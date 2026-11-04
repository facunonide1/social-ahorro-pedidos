"""Evaluador determinista del guardrail PreToolUse (ver README.md en este directorio).

Lee el JSON del tool call por stdin y decide:
  allow → exit 0 sin salida
  ask   → exit 0 con hookSpecificOutput.permissionDecision = "ask" (Claude Code pide confirmación)
  deny  → motivo por stderr y exit 2
Fail-closed: entrada ilegible, campos faltantes o cualquier excepción terminan en deny.
En Write/Edit los chequeos de deny corren antes que los de ask.
"""
import fnmatch
import json
import os
import re
import shlex
import sys
from urllib.parse import urlsplit

# NORA no tiene staging todavía (ver PENDIENTE.md). Con STAGING_REF vacío, `supabase db push/reset`
# solo pasa contra localhost y las herramientas MCP que escriben quedan bloqueadas en todos los proyectos.
# Cuando exista una rama o un proyecto de staging, su ref va acá y en los tests.
STAGING_REF = ""
PROD_REF = "hrjxjbirajbsurobqdca"  # NORA en producción: solo lectura, bloqueado por host
READ_ONLY_REFS = (PROD_REF, "yuluoybfoibtbqpssiyf")  # NORA producción, Axis
MIN_MIGRATION_LINES = 10
MAX_DEPTH = 4  # anidamiento máximo de bash -c / $(…) que se inspecciona; más profundo = deny
LOCAL_HOSTS = ("localhost", "127.0.0.1")
DENY_PREFIX = "BLOQUEADO por .claude/hooks/pre-tool-use.sh: "

NO_ALNUM_BEFORE = r"(?<![A-Za-z0-9])"  # \b no sirve: "_" es carácter de palabra (KEY_sk_live_…)
SECRET_PATTERNS = (
    ("clave sk_", re.compile(NO_ALNUM_BEFORE + r"(?:sk_(?:live|test)_[A-Za-z0-9]{10,}|sk_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,})")),
    ("clave de Trigger.dev", re.compile(NO_ALNUM_BEFORE + r"tr_(?:dev|prod|stg|preview)_[A-Za-z0-9]{10,}")),
    ("clave vck_", re.compile(NO_ALNUM_BEFORE + r"vck_[A-Za-z0-9_-]{10,}")),
    ("JWT", re.compile(NO_ALNUM_BEFORE + r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
)
PG_URL = re.compile(r"postgres(?:ql)?://([^:/\s@]*):([^@\s]+)@([^/\s:?\"']+)", re.IGNORECASE)
PASSWORD_PLACEHOLDER = re.compile(r"\$\{?[A-Za-z_]\w*\}?|<[^<>]+>|\[[^\[\]]+\]")
POLICY_PATH = re.compile(r"(?:^|/)polic(?:y|ies)(?:[._/-]|$)")
POLICY_STATEMENT = re.compile(r"\b(?:create|alter|drop)\s+policy\b", re.IGNORECASE)
POLICY_TABLE = re.compile(r"\bpolicies\b", re.IGNORECASE)

URL_IN_CMD = re.compile(r"postgres(?:ql)?://[^\s'\"]+")
DESTRUCTIVE_DDL = re.compile(r"\btruncate\b|\bdrop\s+(?:schema|database)\b")
# El DDL solo se evalúa en el segmento que invoca un cliente de base (o en el heredoc que se le pasa):
# así `git commit -m "… truncate …"` o `truncate -s0 archivo` no cuentan, pero `psql <<SQL … truncate …` sí.
DB_CLIENTS = {"psql", "pgcli", "pg_restore", "mysql", "sqlite3", "duckdb"}
DB_CLIENT = re.compile(r"\b(?:psql|pgcli|pg_restore|mysql|sqlite3|duckdb)\b|\bsupabase(?:@\S+)?\s(?:[^\n;|&]*\s)?(?:db|sql)\b")
# grupos: 1 comilla del delimitador, 2 delimitador, 3 resto de la línea de apertura (es comando), 4 cuerpo (es dato)
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)(\w+)\1([^\n]*)\n(.*?)\n[ \t]*\2(?=[\s)\"'`]|$)", re.DOTALL)
SUBSTITUTION = re.compile(r"\$\(((?:[^()]|\([^()]*\))*)\)|`([^`]*)`")
READ_ONLY_OK = re.compile(r"\bsupabase(?:@\S+)?\s.*\b(?:db pull|link|projects list)\b")
GLOB_CHARS = re.compile(r"[*?\[]")

SEPARATOR_CHARS = set(";&|()\n")
TRUNCATING_REDIRECTS = (">", ">|", "&>", ">&")
SHELL_WRAPPERS = {"bash", "sh", "zsh", "dash", "ksh", "fish", "eval", "ssh", "su", "watch"}
MIGRATION_VERBS = {"rm", "unlink", "truncate", "shred"}  # cp y mv tienen su propio chequeo
GIT_MIGRATION_VERBS = {"rm", "mv", "checkout", "restore", "clean"}
GIT_OPTS_WITH_VALUE = {"-c", "-C", "--git-dir", "--work-tree", "--namespace"}


class Decision(Exception):
    def __init__(self, kind, reason):
        super().__init__(reason)
        self.kind, self.reason = kind, reason


def deny(reason):
    raise Decision("deny", reason)


def ask(reason):
    raise Decision("ask", reason)


# ---------- Bash: lexing ----------

def normalize(cmd):
    # Continuación con barra invertida: bash borra «\⏎» entero (`r\⏎m -rf` es `rm -rf`), no lo cambia por un espacio.
    joined = cmd.replace("\\\n", "")
    return re.sub(r"[ \t]+", " ", joined.lower()).strip()


def lex(text):
    """Tokens respetando comillas; operadores (&&, ;, |, >, paréntesis, saltos de línea) como tokens aparte."""
    try:
        lexer = shlex.shlex(text, posix=True, punctuation_chars=";&|()<>\n")
        lexer.whitespace = " \t\r"
        lexer.whitespace_split = True
        lexer.commenters = ""
        return list(lexer)
    except ValueError:
        deny("no se pudo tokenizar el comando (comillas sin cerrar): fail-closed")


def is_separator(token):
    return bool(token) and set(token) <= SEPARATOR_CHARS


def segments_of(tokens):
    current = []
    for t in tokens:
        if is_separator(t):
            if current:
                yield current
            current = []
        else:
            current.append(t)
    if current:
        yield current


def name_of(token):
    return token.strip("`$").rsplit("/", 1)[-1].split("@", 1)[0]


def is_short_flag(t, letter):
    return t.startswith("-") and not t.startswith("--") and letter in t[1:]


def git_subcommand(tokens, names):
    """Índice del subcomando de git (salta -C dir, -c k=v, etc.) o None."""
    if "git" not in names:
        return None
    i = names.index("git") + 1
    while i < len(tokens) and tokens[i].startswith("-"):
        i += 2 if tokens[i] in GIT_OPTS_WITH_VALUE else 1
    return i if i < len(tokens) else None


def mentions_migrations(token):
    if "migrations" in token:
        return True
    return any(GLOB_CHARS.search(part) and fnmatch.fnmatch("migrations", part) for part in token.split("/"))


def project_dir():
    return os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())


# ---------- Bash: reglas por segmento ----------

def check_ddl(tokens, names):
    is_db_client = bool(DB_CLIENTS & set(names)) or ("supabase" in names and bool({"db", "sql"} & set(tokens)))
    if is_db_client and DESTRUCTIVE_DDL.search(" ".join(tokens)):
        deny("DDL destructivo (truncate / drop schema / drop database)")


def check_heredocs(norm, ctx):
    """El cuerpo es dato, salvo para el cliente de base que lo lee y las $(…) de un heredoc sin comillas."""
    for m in HEREDOC.finditer(norm):
        line_start = norm.rfind("\n", 0, m.start()) + 1
        opener, body = norm[line_start:m.end(3)], m.group(4)
        if DB_CLIENT.search(opener) and DESTRUCTIVE_DDL.search(body):
            deny("DDL destructivo en heredoc (truncate / drop schema / drop database)")
        # Si lo consume un shell (bash <<EOF), el cuerpo no es dato: es lo que se ejecuta.
        # La línea de apertura puede tener comillas que cierran después del heredoc (git commit -m "$(cat <<EOF):
        # se separa por palabras, sin tokenizar.
        opener_names = {name_of(w) for w in re.split(r"[\s;&|()\"'`$<>]+", opener) if w}
        if opener_names & (SHELL_WRAPPERS - {"ssh", "su", "watch", "eval"}):
            scan_bash(body, ctx, 1)
        if not m.group(1):
            for sub in SUBSTITUTION.finditer(body):
                scan_bash(sub.group(1) if sub.group(1) is not None else sub.group(2), ctx, 1)


def check_rm(tokens, names):
    if "rm" not in names:
        return
    args = tokens[names.index("rm") + 1:]
    recursive = any(t == "--recursive" or is_short_flag(t, "r") for t in args)
    force = any(t == "--force" or is_short_flag(t, "f") for t in args)
    if recursive and force:
        deny("rm recursivo forzado")


def is_forced_push_arg(t):
    return (t.startswith("--force") or t in ("--mirror", "--delete", "--prune")
            or is_short_flag(t, "f") or is_short_flag(t, "d")
            or re.search(r"(?:^|:)\+", t) is not None or (t.startswith(":") and len(t) > 1))


def check_git_push(tokens, names):
    sub = git_subcommand(tokens, names)
    if sub is None or tokens[sub] != "push":
        return
    if any(is_forced_push_arg(t) for t in tokens[sub + 1:]):
        deny("git push destructivo (--force*, -f, +ref, --delete, :ref o --mirror)")


def migration_target_exists(target, in_migrations_dir):
    if GLOB_CHARS.search(target):
        return True
    rest = target.split("migrations/", 1)[1] if "migrations/" in target else target
    if not rest or rest.endswith("/") or ("migrations" in target and "migrations/" not in target):
        return True  # apunta al directorio entero
    if "migrations" not in target and not in_migrations_dir:
        return False
    return os.path.exists(os.path.join(project_dir(), "supabase", "migrations", rest))


def local_name(target, ctx):
    """Dentro de migrations, `./x.sql` y `a/../x.sql` son `x.sql`: bash los resuelve ahí."""
    if not ctx["in_migrations"] or os.path.isabs(target):
        return target
    norm = os.path.normpath(target)
    return norm if not norm.startswith("..") else target


def check_redirects(tokens, ctx):
    for i, t in enumerate(tokens[:-1]):
        if t not in TRUNCATING_REDIRECTS:
            continue
        target = tokens[i + 1]
        if t == ">&" and (target.isdigit() or target == "-"):
            continue
        target = local_name(target, ctx)
        in_dir = ctx["in_migrations"] and "/" not in target
        if (mentions_migrations(target) or in_dir) and migration_target_exists(target, in_dir):
            deny("redirección que pisa una migración existente (supabase/migrations/)")


def check_migrations_bash(tokens, names, ctx):
    if not (ctx["in_migrations"] or any(mentions_migrations(t) for t in tokens)):
        return
    name_set, token_set = set(names), set(tokens)
    sub = git_subcommand(tokens, names)
    destructive = (
        bool(MIGRATION_VERBS & name_set)
        or (sub is not None and tokens[sub] in GIT_MIGRATION_VERBS)
        or ("find" in name_set and bool({"-delete", "-exec", "-execdir", "-ok"} & token_set))
        or (bool({"sed", "perl"} & name_set) and any(t.startswith("--in-place") or is_short_flag(t, "i") for t in tokens))
        or ("dd" in name_set and any(t.startswith("of=") for t in tokens))
        or ("tee" in name_set and not {"-a", "--append"} & token_set)
    )
    if destructive:
        deny("no se borran, mueven ni pisan migraciones (supabase/migrations/)")


def check_copy_move(tokens, names, ctx):
    """cp/mv pueden crear una migración nueva, pero no pisar una existente ni sacar una de la carpeta."""
    for verb in ("cp", "mv"):
        if verb not in names:
            continue
        args = [t for t in tokens[names.index(verb) + 1:] if not t.startswith("-")]
        if len(args) < 2:
            continue
        sources, dest = args[:-1], args[-1]
        dest = local_name(dest, ctx)
        dest_in_dir = ctx["in_migrations"] and "/" not in dest
        if (mentions_migrations(dest) or dest_in_dir) and migration_target_exists(dest, dest_in_dir):
            deny(f"{verb} pisaría una migración existente (supabase/migrations/)")
        if verb == "mv" and (ctx["in_migrations"] or any(mentions_migrations(src) for src in sources)):
            deny("mv saca o renombra una migración (supabase/migrations/)")


def url_allowed(url):
    try:
        parts = urlsplit(url)
        host, user = (parts.hostname or "").lower(), (parts.username or "")
    except ValueError:
        return False
    if parts.query:  # libpq lee host=… del query string: no se puede confiar en el host visible
        return False
    if host in LOCAL_HOSTS:
        return True
    if not STAGING_REF:
        return False
    if host == f"db.{STAGING_REF}.supabase.co":
        return True
    return host.endswith(".pooler.supabase.com") and user == f"postgres.{STAGING_REF}"


def check_db_push(tokens, names):
    token_set = set(tokens)
    if "supabase" not in names or "db" not in token_set or not ({"push", "reset"} & token_set):
        return
    if "push" in token_set and "--dry-run" in token_set:
        return
    # Lo que viene después de un # es comentario para bash: no cuenta como URL validada.
    if any(t.startswith("#") for t in tokens):
        tokens = tokens[:next(i for i, t in enumerate(tokens) if t.startswith("#"))]
        token_set = set(tokens)
    # Solo vale el valor efectivo de --db-url (separado o con =); si es dinámico, no se puede verificar.
    db_urls = []
    for i, t in enumerate(tokens):
        if t == "--db-url" and i + 1 < len(tokens):
            db_urls.append(tokens[i + 1])
        elif t.startswith("--db-url="):
            db_urls.append(t.split("=", 1)[1])
    if any("$" in u or "`" in u for u in db_urls):
        deny("db push/reset con --db-url en variable: no se puede verificar que sea staging; usá la URL literal")
    urls = db_urls or URL_IN_CMD.findall(" ".join(tokens))
    has_db_url = any(t.startswith("--db-url") for t in tokens)
    if not urls and has_db_url:
        deny("db push/reset con --db-url en variable: no se puede verificar que sea staging; usá la URL literal")
    if not urls:
        if "--local" in token_set and not ({"--linked", "--project-ref"} & token_set):
            return
        deny("db push/reset: sin URL explícita de staging o local")
    if "--linked" in token_set or not all(url_allowed(u) for u in urls):
        deny("db push/reset: URL no permitida (solo staging o localhost, sin query string)")


def check_read_only_refs(tokens):
    text = " ".join(tokens)
    for ref in READ_ONLY_REFS:
        if ref in text and not READ_ONLY_OK.search(text):
            deny(f"proyecto Supabase existente ({ref}): solo db pull / link")


PROTECTED_BRANCHES = {"main", "master", "production", "prod"}
VERCEL_PROD_FLAGS = {"--prod", "--production", "--target=production"}
VERCEL_DENY_SUBCOMMANDS = {"promote", "rollback", "alias", "domains", "dns", "certs", "redeploy", "remove", "rm"}
VERCEL_ENV_WRITES = {"add", "rm", "remove", "update"}


def current_branch():
    """Rama actual leyendo .git/HEAD; None si no se puede saber (y entonces se trata como protegida)."""
    try:
        with open(os.path.join(project_dir(), ".git", "HEAD"), encoding="utf-8") as f:
            head = f.read().strip()
    except OSError:
        return None
    return head.rsplit("/", 1)[-1] if head.startswith("ref:") else None


def is_local_branch(name):
    """¿Existe esta rama local y no es protegida? Lee .git/refs/heads y packed-refs."""
    name = name.replace("refs/heads/", "")
    if not name or name in PROTECTED_BRANCHES or name == "head":
        return False
    git = os.path.join(project_dir(), ".git")
    if os.path.isfile(os.path.join(git, "refs", "heads", *name.split("/"))):
        return True
    try:
        with open(os.path.join(git, "packed-refs"), encoding="utf-8") as f:
            return any(line.rstrip().endswith(f" refs/heads/{name}") for line in f)
    except OSError:
        return False


def repo_config_pushes_protected():
    """¿.git/config tiene un `push = …:main` (o similar) en algún remoto? Entonces cualquier push puede ir a main."""
    try:
        with open(os.path.join(project_dir(), ".git", "config"), encoding="utf-8") as f:
            for line in f:
                m = re.match(r"\s*push\s*=\s*(\S+)", line, re.IGNORECASE)
                if m and m.group(1).split(":", 1)[-1].replace("refs/heads/", "").lower() in PROTECTED_BRANCHES:
                    return True
    except OSError:
        return False
    return False


def check_push_to_protected(tokens, names, ctx=None):
    """Un push a main despliega producción en Vercel: no se hace nunca desde acá."""
    sub = git_subcommand(tokens, names)
    if sub is None or tokens[sub] != "push":
        return
    # `git -c remote.origin.push=HEAD:main push origin` empuja main sin nombrarlo después de push.
    for i, t in enumerate(tokens[:sub]):
        if t == "-c" and i + 1 < sub and re.match(r"(?:remote\.[^=]*\.push|push\.)", tokens[i + 1]):
            deny("git -c que cambia a dónde empuja el push: no se puede verificar el destino")
        if t.startswith("-c") and len(t) > 2 and re.match(r"-c(?:remote\.[^=]*\.push|push\.)", t):
            deny("git -c que cambia a dónde empuja el push: no se puede verificar el destino")
    if repo_config_pushes_protected():
        deny("la configuración del repo tiene un push refspec hacia una rama protegida")
    rest = tokens[sub + 1:]
    if {"--all", "--branches"} & set(rest):
        deny("git push --all empuja también main, que despliega producción")
    # Ante la duda, bloquea: cualquier posicional cuyo destino sea una rama protegida, esté donde esté. Así no
    # importa qué opción tome un valor (`--repo=origin HEAD:main`, `-o x`): no hay que adivinar cuál es el remoto.
    positional = [t for t in rest if not t.startswith("-")]
    for r in positional:
        dest = r.split(":", 1)[-1].replace("refs/heads/", "")
        if dest in PROTECTED_BRANCHES or (dest == "head" and ((ctx or {}).get("cambio_de_rama")
                                                               or current_branch() in PROTECTED_BRANCHES | {None})):
            deny(f"git push a {dest}: main despliega producción; se trabaja en una rama y se abre un PR")
    # Estando en main (o sin poder saberlo), el push tiene que nombrar una rama local que no sea protegida.
    # Contar posicionales no alcanza: en `git push -o x origin` el `x` es el valor de -o, no una rama.
    # Si el mismo comando cambió de rama antes (git switch main && git push), HEAD en disco ya no dice nada.
    branch = None if (ctx or {}).get("cambio_de_rama") else current_branch()
    tags_only = "--tags" in rest and len(positional) <= 1
    if (branch is None or branch in PROTECTED_BRANCHES) and not tags_only:
        if not any(is_local_branch(r.split(":", 1)[0]) for r in positional):
            deny("git push sin una rama de trabajo explícita estando en main (o sin poder saberlo): main despliega producción")


def check_branch_delete(tokens, names):
    sub = git_subcommand(tokens, names)
    if sub is None or tokens[sub] != "branch":
        return
    if any(t in ("-d", "-D", "--delete") or (t.startswith("-") and not t.startswith("--") and set(t[1:]) & {"d", "D"})
           for t in tokens[sub + 1:]):
        deny("no se borran branches")


def check_merge(tokens, names):
    if "gh" in names:
        i = names.index("gh")
        rest = tokens[i + 1:]
        pares = list(zip(rest, rest[1:]))
        if ("pr", "merge") in pares or ("api" in rest and any("/merge" in t for t in rest)):
            deny("nunca se mergea: el merge lo hace una persona")


def check_vercel(tokens, names):
    if "vercel" not in names:
        return
    rest = tokens[names.index("vercel") + 1:]
    if VERCEL_PROD_FLAGS & set(rest) or any(t.startswith(("--target=prod", "--prod")) for t in rest):
        deny("deploy a producción en Vercel")
    for a, b in zip(rest, rest[1:]):
        if a in ("--target", "-t") and b.startswith("prod"):
            deny("deploy a producción en Vercel (--target production)")
    # Las opciones globales pueden ir antes del subcomando: se mira cualquier posicional.
    positional = [t for t in rest if not t.startswith("-")]
    hit = VERCEL_DENY_SUBCOMMANDS & set(positional)
    if hit:
        deny(f"vercel {sorted(hit)[0]} toca producción (dominio, alias o deploy)")
    if "env" in positional and VERCEL_ENV_WRITES & set(positional[positional.index("env") + 1:]):
        deny("no se tocan variables de entorno de Vercel")


# Scripts del repo que ESCRIBEN en la base que diga .env.local, que hoy es producción. Medido el 2026-11-04:
# `npm run build` corre dos auditores que crean y borran usuarios en auth y recalculan agentes_resumen, y casi
# todos los `probar:*` insertan y borran datos de prueba. El hook no ve lo que hace un script por dentro, así que
# se bloquea la invocación. Los de solo lectura (permisos, cerebro, cortes, rls, lente, límite) pasan.
SCRIPTS_QUE_ESCRIBEN = re.compile(
    r"(?:scripts/(?:prueba-(?!cerebro)[\w-]+|_auditar-rls-roles|_verificar-coherencia|probar-nora-tres-roles"
    r"|cargar-[\w-]+|importar-[\w-]+|sincronizar-permisos|bootstrap-admin|fabrica-[\w-]+|pesos-desde-woo"
    r"|recuperar-fechas[\w-]*|espejo-canal-woo)\b"
    r"|\bnpm run (?:build|probar:(?!cerebro\b|permisos\b)[\w:-]+|auditar:rls-roles|verificar:coherencia"
    r"|permisos:sincronizar|contar:[\w-]+)\b)")


def check_scripts_que_escriben(text):
    m = SCRIPTS_QUE_ESCRIBEN.search(text)
    if m:
        deny(f"«{m.group(0)}» escribe en la base de .env.local, que es producción. Typecheck: npx tsc --noEmit; "
             "compilar: npx next build")


def nested_commands(tokens, names):
    """Texto que el shell va a ejecutar adentro de este segmento: $(…), `…` y argumentos de bash -c/eval/ssh."""
    for t in tokens:
        for m in SUBSTITUTION.finditer(t):
            yield m.group(1) if m.group(1) is not None else m.group(2)
    if SHELL_WRAPPERS & set(names):
        for t in tokens:
            if re.search(r"\s", t) or set(t) & SEPARATOR_CHARS:
                yield t


def scan_bash(text, ctx, depth=0):
    if depth > MAX_DEPTH:
        deny("comando anidado demasiado profundo para inspeccionar (fail-closed)")
    for tokens in segments_of(lex(text)):
        names = [name_of(t) for t in tokens]
        check_ddl(tokens, names)
        check_rm(tokens, names)
        check_git_push(tokens, names)
        check_redirects(tokens, ctx)
        check_migrations_bash(tokens, names, ctx)
        check_copy_move(tokens, names, ctx)
        check_db_push(tokens, names)
        check_read_only_refs(tokens)
        check_push_to_protected(tokens, names, ctx)
        sub = git_subcommand(tokens, names)
        if sub is not None and tokens[sub] in ("checkout", "switch"):
            ctx["cambio_de_rama"] = True
        check_branch_delete(tokens, names)
        check_merge(tokens, names)
        check_vercel(tokens, names)
        check_scripts_que_escriben(" ".join(tokens))
        if names[0] in ("cd", "pushd") and any(mentions_migrations(t) for t in tokens):
            ctx["in_migrations"] = True
        for inner in nested_commands(tokens, names):
            scan_bash(inner, ctx, depth + 1)


def evaluate_bash(tool_input):
    cmd = tool_input.get("command")
    if not isinstance(cmd, str) or not cmd.strip():
        deny("comando vacío o ausente (fail-closed)")
    norm = normalize(cmd)
    ctx = {"in_migrations": False, "cambio_de_rama": False}
    # El DDL puede llegar al cliente por un pipe (printf "truncate …" | psql): se mira el comando entero.
    sin_heredocs = HEREDOC.sub(lambda m: "<< heredoc" + m.group(3), norm)
    if "|" in sin_heredocs and DB_CLIENT.search(sin_heredocs) and DESTRUCTIVE_DDL.search(sin_heredocs):
        deny("DDL destructivo que llega a un cliente de base por un pipe")
    check_heredocs(norm, ctx)
    scan_bash(HEREDOC.sub(lambda m: "<< heredoc" + m.group(3), norm), ctx)


# ---------- Write / Edit / MultiEdit ----------

def resolve(path):
    full = path if os.path.isabs(path) else os.path.join(project_dir(), path)
    return os.path.normpath(full)


def edits_of(tool_name, tool_input):
    if tool_name == "Edit":
        return [tool_input]
    if tool_name == "MultiEdit":
        edits = tool_input.get("edits")
        if not isinstance(edits, list) or not all(isinstance(e, dict) for e in edits):
            deny("MultiEdit con edits inválidos (fail-closed)")
        return edits
    return []


def texts_of(tool_name, tool_input, key):
    if tool_name == "Write":
        return [str(tool_input.get("content", ""))] if key == "new_string" else []
    return [str(e.get(key, "")) for e in edits_of(tool_name, tool_input)]


def resulting_content(tool_name, tool_input, current):
    if tool_name == "Write":
        return str(tool_input.get("content", ""))
    result = current
    for e in edits_of(tool_name, tool_input):
        old, new = str(e.get("old_string", "")), str(e.get("new_string", ""))
        count = -1 if e.get("replace_all") else 1
        result = result.replace(old, new, count) if old else result
    return result


def non_blank_lines(text):
    return sum(1 for line in text.splitlines() if line.strip())


def check_secrets(text):
    for label, pattern in SECRET_PATTERNS:
        if pattern.search(text):
            deny(f"el contenido parece incluir un secreto ({label}); usá variables de entorno")
    for _user, password, host in PG_URL.findall(text):
        if not PASSWORD_PLACEHOLDER.fullmatch(password) and host.lower() not in LOCAL_HOSTS:
            deny("el contenido incluye una URL postgresql:// con contraseña; usá una variable")


def check_migration_shrink(path, tool_name, tool_input):
    if "/supabase/migrations/" not in path.lower().replace(os.sep, "/") or not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            current = f.read()
    except OSError:
        deny("no se pudo leer la migración existente (fail-closed)")
    if non_blank_lines(resulting_content(tool_name, tool_input, current)) < MIN_MIGRATION_LINES:
        deny(f"la migración quedaría con menos de {MIN_MIGRATION_LINES} líneas; las migraciones no se vacían")


def check_confirmations(path, tool_name, tool_input):
    lowered = path.lower().replace(os.sep, "/")
    name = os.path.basename(lowered)
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        ask(f"{name} guarda secretos locales: confirmá antes de modificarlo")
    if POLICY_PATH.search(lowered):
        ask("el archivo es de policies (regla 7 de CLAUDE.md): confirmá antes de modificarlo")
    touched = "\n".join(texts_of(tool_name, tool_input, "old_string") + texts_of(tool_name, tool_input, "new_string"))
    if not lowered.endswith(".md") and POLICY_STATEMENT.search(touched):
        ask("el cambio crea, modifica o borra una policy de RLS (regla 7): confirmá antes de aplicarlo")
    if lowered.endswith(".sql") and POLICY_TABLE.search(touched):
        ask("el cambio toca la tabla policies (regla 7): confirmá antes de aplicarlo")


def evaluate_file_tool(tool_name, tool_input):
    raw_path = tool_input.get("file_path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        deny(f"{tool_name} sin file_path (fail-closed)")
    path = resolve(raw_path)
    check_secrets("\n".join(texts_of(tool_name, tool_input, "new_string")))
    check_migration_shrink(path, tool_name, tool_input)
    check_confirmations(path, tool_name, tool_input)


# ---------- MCP de Supabase ----------
#
# Las herramientas MCP no pasan por Bash: sin esto, `apply_migration` contra producción no lo vería nadie.
# Contra cualquier proyecto que no sea staging, solo lectura. Y lectura quiere decir una sola sentencia que
# empieza por select/with/explain/show, sin verbos de escritura y sin llamar funciones que no estén en la
# lista: `select cerebro_calcular()` es un select que escribe.

MCP_ALWAYS_DENY = {
    "apply_migration", "deploy_edge_function", "create_edge_function_secret",
    "create_project", "pause_project", "restore_project",
    "create_branch", "delete_branch", "merge_branch", "rebase_branch", "reset_branch",
}
SQL_WRITE = re.compile(
    r"\b(?:insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|comment|copy|call|do|"
    r"vacuum|analyze|refresh|lock|cluster|reindex|listen|notify|prepare|execute|set|reset|begin|commit|"
    r"rollback|savepoint|security|import|nextval|setval|pg_sleep|dblink|lo_import|lo_export|into)\b")
SQL_FUNC = re.compile(r"([a-z_][a-z0-9_$.]*)\s*\(")
SQL_KEYWORDS_BEFORE_PAREN = {
    "select", "from", "where", "and", "or", "not", "in", "as", "on", "join", "using", "exists", "any", "all",
    "some", "values", "with", "when", "then", "else", "case", "over", "filter", "within", "partition", "by",
    "having", "group", "order", "is", "lateral", "union", "intersect", "except", "array", "row", "cast",
    "between", "like", "ilike", "similar", "distinct", "returning", "limit", "offset", "materialized",
}
SQL_READ_FUNCS = {
    "count", "sum", "avg", "min", "max", "coalesce", "nullif", "greatest", "least", "round", "ceil", "floor",
    "abs", "length", "lower", "upper", "left", "right", "substring", "substr", "trim", "btrim", "ltrim", "rtrim",
    "replace", "split_part", "concat", "concat_ws", "format", "regexp_replace", "regexp_match", "position",
    "string_agg", "array_agg", "json_agg", "jsonb_agg", "json_object_agg", "jsonb_object_agg",
    "json_build_object", "jsonb_build_object", "json_build_array", "jsonb_build_array", "to_json", "to_jsonb",
    "row_to_json", "jsonb_pretty", "jsonb_typeof", "jsonb_array_length", "jsonb_object_keys",
    "jsonb_array_elements", "jsonb_each", "jsonb_exists", "unnest", "generate_series", "array_length",
    "now", "current_date", "date_trunc", "date_part", "extract", "to_char", "to_date", "to_timestamp", "age",
    "clock_timestamp", "timezone", "pg_get_functiondef", "pg_get_viewdef", "pg_get_constraintdef", "pg_get_expr",
    "pg_get_indexdef", "pg_get_triggerdef", "pg_get_function_identity_arguments", "pg_get_function_result",
    "has_function_privilege", "has_table_privilege", "has_schema_privilege", "to_regclass", "to_regprocedure",
    "to_regtype", "obj_description", "col_description", "format_type", "pg_relation_size",
    "pg_total_relation_size", "pg_size_pretty", "current_setting", "version", "row_number", "rank",
    "dense_rank", "lag", "lead", "first_value", "last_value", "percentile_cont", "md5", "bool_or", "bool_and",
    "every", "numeric", "int", "integer", "text", "date", "timestamp", "timestamptz", "interval", "char",
    "varchar", "bigint", "smallint", "boolean", "uuid", "jsonb", "json", "float", "double",
}


def strip_sql(sql):
    """Un recorrido: literales → '', identificadores entre comillas → "x", comentarios → espacio.

    Hacerlo en pasadas separadas es lo que permitía esconder una llamada detrás de un '--' dentro de un literal.
    """
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if c == "'":
            j = i + 1
            while j < n and not (sql[j] == "'" and (j + 1 >= n or sql[j + 1] != "'")):
                j += 2 if sql[j] == "'" else 1
            if j >= n:
                deny("execute_sql con un literal sin cerrar (fail-closed)")
            out.append("''"); i = j + 1
        elif c == '"':
            j = sql.find('"', i + 1)
            if j < 0:
                deny("execute_sql con un identificador sin cerrar (fail-closed)")
            out.append('"x"'); i = j + 1
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            out.append(" "); i = n if j < 0 else j
        elif sql.startswith("/*", i):
            # Postgres anida los comentarios de bloque; un recorte que corta en el primer */ se puede engañar.
            # Una consulta de lectura no los necesita.
            deny("execute_sql con comentario de bloque: no se puede verificar (usá --)")
        else:
            out.append(c); i += 1
    return "".join(out).lower().strip()


def check_read_only_sql(query):
    if not isinstance(query, str) or not query.strip():
        deny("execute_sql sin query (fail-closed)")
    if "\\" in query:
        # Con E'…' la barra invertida cambia dónde termina un literal y se puede esconder una llamada adentro.
        deny("execute_sql con barra invertida: no se puede verificar dónde terminan los literales")
    sql = strip_sql(query)
    if re.search(r'"\s*\(', sql):
        deny("execute_sql llama a una función con el nombre entre comillas: no se puede verificar")
    if "$$" in sql or "$" in re.sub(r"\$\d+", "", sql):
        deny("execute_sql con dollar-quoting o parámetros: no se puede verificar que sea solo lectura")
    if ";" in sql.rstrip("; \n\t"):
        deny("execute_sql con más de una sentencia contra un proyecto de solo lectura")
    if not re.match(r"^(?:select|with|explain|show|values|table)\b", sql):
        deny("execute_sql contra producción: solo select / with / explain / show")
    m = SQL_WRITE.search(sql)
    if m:
        deny(f"execute_sql contra producción con «{m.group(0)}»: solo lectura")
    for name in SQL_FUNC.findall(sql):
        base = name.rsplit(".", 1)[-1]
        if base in SQL_KEYWORDS_BEFORE_PAREN or base in SQL_READ_FUNCS:
            continue
        deny(f"execute_sql contra producción llama a {name}(): una función puede escribir; no está en la lista de lectura")


def evaluate_mcp(tool_name, tool_input):
    op = tool_name.split("__", 2)[-1]
    ref = str(tool_input.get("project_id") or tool_input.get("project_ref") or "")
    is_staging = bool(STAGING_REF) and ref == STAGING_REF
    if op in MCP_ALWAYS_DENY and not is_staging:
        deny(f"MCP {op} fuera de staging: producción es intocable (y crear ramas o proyectos cuesta plata)")
    if op == "execute_sql" and not is_staging:
        check_read_only_sql(tool_input.get("query"))


# ---------- entrada ----------

FILE_TOOLS = ("Write", "Edit", "MultiEdit")


def evaluate(payload):
    if not isinstance(payload, dict):
        deny("entrada del hook no es un objeto JSON (fail-closed)")
    tool_name, tool_input = payload.get("tool_name"), payload.get("tool_input")
    if not isinstance(tool_name, str) or not isinstance(tool_input, dict):
        deny("entrada sin tool_name o tool_input (fail-closed)")
    if tool_name == "Bash":
        evaluate_bash(tool_input)
    elif tool_name.startswith("mcp__supabase__") or tool_name.startswith("mcp__claude_ai_Supabase__"):
        evaluate_mcp(tool_name, tool_input)
    elif tool_name in FILE_TOOLS:
        evaluate_file_tool(tool_name, tool_input)


def main():
    try:
        try:
            payload = json.loads(sys.stdin.read())
        except ValueError:
            deny("no se pudo parsear el JSON del tool call (fail-closed)")
        evaluate(payload)
    except Decision as d:
        if d.kind == "ask":
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": d.reason,
            }}))
            return 0
        print(DENY_PREFIX + d.reason, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
