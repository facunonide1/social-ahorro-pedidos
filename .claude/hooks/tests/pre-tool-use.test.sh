#!/usr/bin/env bash
# Tests del guardrail .claude/hooks/pre-tool-use.sh (Bash, Write, Edit, MultiEdit).
# Uso: bash .claude/hooks/tests/pre-tool-use.test.sh   (sale con 1 si algún caso falla)
set -uo pipefail

HOOK="$(cd "$(dirname "$0")/.." && pwd)/pre-tool-use.sh"
# NORA todavía no tiene staging: este ref es inventado y el hook lo tiene que tratar como cualquier otro.
STAGING="noexistestagingref00"
PW='$DB_PASSWORD'   # placeholder: los fixtures no llevan contraseñas literales
FAILS=0

FIXTURE="$(mktemp -d)"
trap 'rm -r -f "$FIXTURE"' EXIT
MIG="$FIXTURE/supabase/migrations"
mkdir -p "$MIG"
for i in $(seq 1 20); do echo "-- línea $i"; done > "$MIG/0001_core.sql"
for i in $(seq 1 20); do echo "select 1;"; done > "$MIG/0002_repetida.sql"
export CLAUDE_PROJECT_DIR="$FIXTURE"   # las redirecciones se resuelven contra el fixture

# Secretos armados en tiempo de ejecución para que este archivo no los contenga literalmente.
LONG="AbCdEfGhIjKlMnOpQrStUvWx1234"
SK="sk_""live_$LONG"
TR="tr_""dev_$LONG"
VCK="vck_""$LONG"
J="ey""J"
JWT="${J}hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${J}zdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJhZmFsc2E"
FAKEPW="$(printf "Sup3r%s" "S3cret0")"
PGURL="postgresql://postgres:$(printf %s "$FAKEPW")@db.$STAGING.supabase.co:5432/postgres"

# check <esperado: pasa|bloquea|pregunta> <descripción> <json de entrada> [comando hook]
check() {
  local expected="$1" desc="$2" input="$3" out code got
  out="$(printf '%s' "$input" | "${HOOK_RUNNER[@]}" 2>/dev/null)"
  code=$?
  case "$code" in
    0) if printf '%s' "$out" | grep -q '"permissionDecision": *"ask"'; then got="pregunta"; else got="pasa"; fi ;;
    2) got="bloquea" ;;
    *) got="error($code)" ;;
  esac
  if [ "$got" = "$expected" ]; then echo "ok    $desc → $got"; else echo "FALLA $desc → $got (esperado: $expected)"; FAILS=$((FAILS+1)); fi
}
HOOK_RUNNER=(bash "$HOOK")

bash_json()  { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1"; }
write_json() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Write","tool_input":{"file_path":sys.argv[1],"content":sys.argv[2]}}))' "$1" "$2"; }
edit_json()  { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":sys.argv[1],"old_string":sys.argv[2],"new_string":sys.argv[3],"replace_all":sys.argv[4]=="1"}}))' "$1" "$2" "$3" "${4:-0}"; }
multi_json() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"MultiEdit","tool_input":{"file_path":sys.argv[1],"edits":[{"old_string":sys.argv[2],"new_string":sys.argv[3]}]}}))' "$1" "$2" "$3"; }
run() { check "$1" "$2" "$(bash_json "$3")"; }

echo "== supabase db push/reset =="
run bloquea "URL de staging (no hay staging)"  "supabase db push --db-url postgresql://postgres:$PW@db.$STAGING.supabase.co:5432/postgres"
run bloquea "otro ref con '# staging'"       "supabase db push --db-url postgresql://postgres:$PW@db.otroproyectoref.supabase.co:5432/postgres # staging"
run pasa    "localhost"                      "supabase db reset --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres"
run bloquea "pooler de staging (no hay)"       "supabase db push --db-url postgresql://postgres.$STAGING:$PW@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
run bloquea "ref de staging en otro dominio" "supabase db push --db-url postgresql://postgres:$PW@db.$STAGING.evil.example.com:5432/postgres"
run bloquea "--linked"                       "supabase db push --linked"
run bloquea "espacios dobles sin URL"        "supabase  db   push"
run bloquea "local encadenado con prod"      "supabase db reset --local && supabase db push --db-url postgresql://postgres:$PW@db.otroproyectoref.supabase.co:5432/postgres"
run bloquea "mayúsculas sin URL"             "SUPABASE DB PUSH"
run bloquea "flag entre db y push"           "supabase db --debug push"
run pasa    "reset --local"                  "supabase db reset --local"
run bloquea "supabase@latest vía pnpm dlx"   "pnpm dlx supabase@latest db push --linked"
run bloquea "npx supabase sin URL"           "npx supabase db push"
run bloquea "localhost con ?host= de prod"   "supabase db push --db-url postgresql://postgres:$PW@localhost:5432/x?host=prod.example.com"
run bloquea "--db-url en variable"           "supabase db push --db-url \"\$STAGING_URL\""
run bloquea "--local con --db-url variable"  "supabase db push --db-url \"\$PROD_URL\" --local"
run bloquea "--local con --project-ref"      "supabase db push --local --project-ref otroref"
run pasa    "push --dry-run"                 "supabase db push --dry-run --linked"

echo "== proyectos existentes (solo db pull) =="
run pasa    "db pull de Axis"                "supabase db pull --db-url postgresql://postgres:$PW@db.yuluoybfoibtbqpssiyf.supabase.co:5432/postgres"
run bloquea "query contra NORA"              "psql postgresql://postgres:$PW@db.hrjxjbirajbsurobqdca.supabase.co:5432/postgres -c 'select 1'"
run bloquea "pull encadenado con otra cosa"  "supabase db pull --project-ref hrjxjbirajbsurobqdca; supabase migration up --project-ref hrjxjbirajbsurobqdca"
run pasa    "link para poder hacer pull"     "supabase link --project-ref hrjxjbirajbsurobqdca"

echo "== producción de NORA: deploy, entorno, dominio =="
( cd "$FIXTURE" && git init -q -b main && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init && git branch wo/hook-hardening )
run bloquea "push a main"                    "git push origin main"
run bloquea "push HEAD:main"                 "git push origin HEAD:main"
run bloquea "push refs/heads/main"           "git push origin feature:refs/heads/main"
run bloquea "push sin rama estando en main"  "git push"
( cd "$FIXTURE" && git checkout -q -b feat/x )
run pasa    "push de una rama de trabajo"    "git push -u origin feat/x"
run pasa    "push sin rama en una rama"      "git push"
( cd "$FIXTURE" && git checkout -q main )
run bloquea "vercel --prod"                  "vercel --prod"
run bloquea "vercel --prod=true"             "vercel deploy --prod=true"
run bloquea "git push --all"                 "git push --all origin"
run bloquea "push --repo=origin HEAD:main"   "git push --repo=origin HEAD:main"
run bloquea "push -o x origin estando en main" "git push -o ci.skip origin"
run bloquea "push --signed origin main"      "git push --signed origin main"
run pasa    "push de una rama desde main"    "git push -u origin feat/x"
run bloquea "git -c remote.origin.push=HEAD:main" "git -c remote.origin.push=HEAD:main push origin"
( cd "$FIXTURE" && git checkout -q feat/x )
run bloquea "switch a main y push"           "git switch main && git push origin"
run bloquea "checkout main y push HEAD"      "git checkout main && git push origin HEAD"
run pasa    "switch a otra rama y push explícito" "git switch feat/x && git push -u origin feat/x"
( cd "$FIXTURE" && git checkout -q main )
run bloquea "truncate por pipe a psql"       "printf 'TRUNCATE work_orders;' | psql \"\$DATABASE_URL\""
run bloquea "heredoc a bash con rm -rf"      $'bash <<EOF\nrm -rf build\nEOF'
run bloquea "heredoc citado a sh con rm -rf" $'sh <<\'EOF\'\nrm -rf build\nEOF'
run pasa    "heredoc a cat que menciona rm -rf" $'cat > notas.txt <<\'EOF\'\nno usar rm -rf\nEOF'
run bloquea "--db-url= con variable y URL local en comentario" "supabase db push --db-url=\"\$PROD_URL\" # postgresql://postgres:postgres@localhost/postgres"
run bloquea "cd migrations y > ./archivo existente" "cd supabase/migrations && > ./0001_core.sql"
run bloquea "cd migrations y cp a ./archivo existente" "cd supabase/migrations && cp /tmp/x ./0001_core.sql"
run bloquea "vercel --target production"     "vercel deploy --target production"
run bloquea "vercel --yes promote"           "vercel --yes promote https://x.vercel.app"
run bloquea "vercel --scope x env rm"        "vercel --scope x env rm CLAVE production"
run bloquea "gh --repo x pr merge"           "gh --repo a/b pr merge 12 --squash"
run bloquea "continuación dentro de rm"      $'r\\\nm -rf build'
run bloquea "comillas sin cerrar"            "echo 'hola"
run bloquea "vercel deploy --prod"           "vercel deploy --prebuilt --prod"
run bloquea "vercel promote"                 "vercel promote https://x.vercel.app"
run bloquea "vercel alias"                   "vercel alias set a b"
run bloquea "vercel domains"                 "vercel domains add x.com"
run bloquea "vercel env add"                 "vercel env add CLAVE production"
run bloquea "vercel env rm"                  "vercel env rm CLAVE production"
run pasa    "vercel env ls (lectura)"        "vercel env ls"
run pasa    "vercel deploy de preview"       "vercel deploy"
run bloquea "gh pr merge"                    "gh pr merge 12 --squash"
run bloquea "gh api merge"                   "gh api repos/a/b/pulls/12/merge -X PUT"
run pasa    "gh pr create"                   "gh pr create --draft --title x --body y"
run bloquea "git branch -D"                  "git branch -D feat/de-otro"
run bloquea "git branch -d"                  "git branch -d feat/de-otro"
run pasa    "git branch nueva"               "git branch feat/nueva"
run bloquea "curl a la API de producción"    "curl https://hrjxjbirajbsurobqdca.supabase.co/rest/v1/tareas"

echo "== scripts del repo que escriben en producción =="
run bloquea "npm run build"                  "npm run build"
run bloquea "npm run probar:canales"         "npm run probar:canales"
run bloquea "auditor que crea usuarios"      "npm run auditar:rls-roles"
run bloquea "verificar:coherencia"           "npm run verificar:coherencia"
run bloquea "tsx directo a una prueba"       "npx tsx --env-file=.env.local scripts/prueba-convenios.ts"
run bloquea "contar:relaciones"              "npm run contar:relaciones"
run pasa    "probar:cerebro (solo lectura)"  "npm run probar:cerebro"
run pasa    "probar:permisos (solo lectura)" "npm run probar:permisos"
run pasa    "auditar:cortes"                 "npm run auditar:cortes"
run pasa    "next build sin auditores"       "npx next build"
run pasa    "typecheck"                      "npx tsc --noEmit -p ."

echo "== MCP de Supabase =="
mcp_json() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"mcp__supabase__"+sys.argv[1],"tool_input":json.loads(sys.argv[2])}))' "$1" "$2"; }
mcp() { check "$1" "$2" "$(mcp_json "$3" "$4")"; }
P='"project_id":"hrjxjbirajbsurobqdca"'
mcp bloquea "apply_migration a producción"   apply_migration "{$P,\"name\":\"x\",\"query\":\"select 1\"}"
mcp bloquea "apply_migration sin proyecto"   apply_migration '{"name":"x","query":"select 1"}'
mcp bloquea "create_branch (cuesta plata)"   create_branch "{$P,\"name\":\"staging\"}"
mcp bloquea "deploy_edge_function"           deploy_edge_function "{$P,\"name\":\"f\"}"
mcp pasa    "select de lectura"              execute_sql "{$P,\"query\":\"select count(*), max(created_at) from tareas where estado = 'asignada'\"}"
mcp pasa    "with + catálogo"                execute_sql "{$P,\"query\":\"with x as (select pg_get_functiondef(p.oid) d from pg_proc p) select left(d, 10) from x\"}"
mcp bloquea "select que llama una función"   execute_sql "{$P,\"query\":\"select public.cerebro_calcular()\"}"
mcp bloquea "insert"                         execute_sql "{$P,\"query\":\"insert into t values (1)\"}"
mcp bloquea "dos sentencias"                 execute_sql "{$P,\"query\":\"select 1; delete from t\"}"
mcp bloquea "cte que borra"                  execute_sql "{$P,\"query\":\"with d as (delete from t returning *) select * from d\"}"
mcp bloquea "update"                         execute_sql "{$P,\"query\":\"update compras_parametros set valor = 2\"}"
mcp bloquea "do block"                       execute_sql "{$P,\"query\":\"do \$\$ begin perform 1; end \$\$\"}"
mcp bloquea "explain analyze ejecuta"        execute_sql "{$P,\"query\":\"explain analyze delete from t\"}"
mcp pasa    "palabra prohibida en un literal" execute_sql "{$P,\"query\":\"select count(*) from t where nota = 'drop table'\"}"
mcp bloquea "función con nombre entre comillas" execute_sql "{$P,\"query\":\"select \\\"cerebro_calcular\\\"()\"}"
mcp bloquea "E-string que esconde una llamada" execute_sql "{$P,\"query\":\"select E'\\\\'', cerebro_calcular(), '\\\\''\"}"
mcp bloquea "-- dentro de un literal"        execute_sql "{$P,\"query\":\"select '--', public.cerebro_calcular()\"}"
mcp bloquea "select into crea una tabla"     execute_sql "{$P,\"query\":\"select 1 into public.guardrail_probe\"}"
mcp pasa    "comentario con comillas"        execute_sql "{$P,\"query\":\"select 1 -- it's fine\"}"
check bloquea "namespace claude_ai_Supabase" "$(python3 -c 'import json; print(json.dumps({"tool_name":"mcp__claude_ai_Supabase__apply_migration","tool_input":{"name":"x","query":"select 1"}}))')"
mcp bloquea "comentario de bloque anidado"   execute_sql "{$P,\"query\":\"select 1 /* a /* b */ ' */ , public.cerebro_calcular() -- '\"}"
mcp pasa    "list_tables"                    list_tables "{$P}"
mcp pasa    "get_advisors"                   get_advisors "{$P,\"type\":\"security\"}"

echo "== fail-closed =="
check bloquea "JSON inválido"                '{"tool_name": "Bash", "tool_input": '
check bloquea "comando vacío"                '{"tool_name":"Bash","tool_input":{"command":""}}'
check bloquea "comando solo espacios"        '{"tool_name":"Bash","tool_input":{"command":"   "}}'
check bloquea "sin tool_input"               '{"tool_name":"Bash"}'
check bloquea "sin tool_name"                '{"tool_input":{"command":"ls"}}'
check bloquea "Write sin file_path"          '{"tool_name":"Write","tool_input":{"content":"hola"}}'
check bloquea "entrada vacía"                ''
HOOK_RUNNER=(env PATH=/nonexistent /bin/bash "$HOOK")
check bloquea "sin python3 en PATH"          "$(bash_json "ls")"
HOOK_RUNNER=(bash "$HOOK")

echo "== rm recursivo forzado =="
run bloquea "rm -rf"                         "rm -rf build"
run bloquea "rm -fr"                         "rm -fr build"
run bloquea "rm -r -f"                       "rm -r -f build"
run bloquea "rm -Rf"                         "rm -Rf build"
run bloquea "rm --recursive --force"         "rm --recursive --force build"
run bloquea "/bin/rm -rf"                    "/bin/rm -rf build"
run bloquea "rm con flags al final"          "rm build -r -f"
run bloquea "rm -rf con espacios múltiples"  "rm    -rf    build"
run bloquea "rm -rf encadenado"              "ls && rm -rf build"
run bloquea "rm -rf en subshell"             "echo \$(rm -rf build)"
run pasa    "rm de un archivo"               "rm build/out.txt"
run bloquea "bash -c con rm -rf"             "bash -c \"rm -rf x\""
run bloquea "sh -c con git push -f"          "sh -c 'git push -f'"
run bloquea "ssh remoto con rm -rf"          "ssh host \"rm -rf /srv/app\""
run bloquea "eval con rm -rf"                "eval 'rm -rf x'"
run bloquea "docker exec sh -c"              "docker exec app sh -c 'rm -rf /data'"
run bloquea "\$(…) entre comillas"           "echo \"\$(rm -rf x)\""
run bloquea "backticks"                      "echo \`rm -rf x\`"
run bloquea "salto de línea"                 $'ls\nrm -rf x'
run pasa    "commit que menciona rm -rf"     "git commit -m 'docs: nunca rm -rf'"
run pasa    "commit heredoc con rm -rf y push --force" "git commit -m \"\$(cat <<'EOF'
fix: x

menciona rm -rf y git push --force
EOF
)\""
run pasa    "commit multilínea entre comillas" $'git commit -m "feat: x\n\ndocumenta git push --force"'
run pasa    "grep -rf no es rm"              "grep -rf patrones.txt src"

echo "== DDL destructivo =="
run bloquea "TRUNCATE"                       "psql -c 'TRUNCATE work_orders'"
run bloquea "truncate en minúscula"          "psql -c 'truncate work_orders'"
run bloquea "Drop Schema mixto"              "psql -c 'Drop   Schema public cascade'"
run bloquea "drop database"                  "psql -c 'drop database postgres'"
run pasa    "select común"                   "psql -c 'select count(*) from work_orders'"
run pasa    "truncate -s0 de un log"         "truncate -s0 build/out.log"
run pasa    "supabase db diff con truncate_logs" "supabase db diff -f truncate_logs"
run bloquea "heredoc psql con truncate"      $'psql "$DB" <<SQL\ntruncate work_orders;\nSQL'
run bloquea "supabase db query con drop"     "supabase db query 'DROP SCHEMA x'"
run pasa    "commit que menciona truncate"   "git commit -m 'fix: no truncate/drop schema en logs'"

echo "== git push forzado =="
run bloquea "--force"                        "git push --force origin main"
run bloquea "-f"                             "git push -f"
run bloquea "--force al final"               "git push origin main --force"
run bloquea "--force-with-lease"             "git push --force-with-lease origin main"
run bloquea "refspec +main"                  "git push origin +main"
run bloquea "refspec +HEAD:main"             "git push origin +HEAD:main"
run bloquea "-uf combinado"                  "git push -uf origin main"
run bloquea "git -C dir push --force"        "git -C repo push --force"
run bloquea "mayúsculas"                     "GIT PUSH --FORCE"
run pasa    "push normal"                    "git push -u origin wo/hook-hardening"
run bloquea "refspec HEAD:+main"             "git push origin HEAD:+main"
run bloquea "borrar rama remota :main"       "git push origin :main"
run bloquea "--delete"                       "git push --delete origin wo/x"
run bloquea "--mirror"                       "git push --mirror"
run pasa    "git stash push"                 "git stash push -m wip"
run pasa    "git push --tags"                "git push --tags"

echo "== supabase/migrations por Bash =="
run bloquea "rm de migración"                "rm supabase/migrations/0001_core.sql"
run bloquea "mv de migración"                "mv supabase/migrations/0001_core.sql /tmp/"
run bloquea "git rm de migración"            "git rm supabase/migrations/0001_core.sql"
run bloquea "git rm -r del directorio"       "git rm -r supabase/migrations"
run bloquea "redirección que vacía"          "echo '' > supabase/migrations/0001_core.sql"
run bloquea "rm desde supabase/"             "cd supabase && rm migrations/0002_work.sql"
run pasa    "leer migración"                 "cat supabase/migrations/0001_core.sql"
run pasa    "append a migración"             "echo '-- nota' >> supabase/migrations/0010_nueva.sql"
run pasa    "git add de migraciones"         "git add supabase/migrations/0010_nueva.sql"
run bloquea "cd + rm"                        "cd supabase/migrations && rm 0001_core.sql"
run bloquea "cd + redirección"               "cd supabase/migrations && > 0001_core.sql"
run bloquea "bash -c con cd + rm"            "bash -c \"cd supabase/migrations && rm 0001_core.sql\""
run bloquea "truncate -s0"                   "truncate -s0 supabase/migrations/0001_core.sql"
run bloquea "cp /dev/null encima"            "cp /dev/null supabase/migrations/0001_core.sql"
run bloquea "tee encima"                     "echo x | tee supabase/migrations/0001_core.sql"
run bloquea "dd of="                         "dd if=/dev/null of=supabase/migrations/0001_core.sql"
run bloquea "find -delete"                   "find supabase/migrations -name '*.sql' -delete"
run bloquea "git checkout --"                "git checkout -- supabase/migrations"
run bloquea "git restore"                    "git restore supabase/migrations/0001_core.sql"
run bloquea "sed -i"                         "sed -i '' '1,\$d' supabase/migrations/0001_core.sql"
run bloquea "glob supabase/migr*"            "rm supabase/migr*/0001_core.sql"
run bloquea "glob supabase/m*/0001*"         "rm supabase/m*/0001*"
run bloquea "redirección al directorio"      "echo x > supabase/migrations/"
run pasa    "migración nueva por redirección" "supabase db diff > supabase/migrations/0010_nueva.sql"
run pasa    "tee -a a migración"             "echo x | tee -a supabase/migrations/0010_nueva.sql"
run pasa    "cp desde migraciones"           "cp supabase/migrations/0001_core.sql /tmp/"
run pasa    "2>&1 con tee a log"             "pnpm test 2>&1 | tee out.log"
run pasa    "git checkout -b"                "git checkout -b wo/bootstrap"
run pasa    "mv de migración nueva desde afuera" "mv x.sql supabase/migrations/0010_nueva.sql"
run pasa    "cp de migración nueva desde afuera" "cp x.sql supabase/migrations/0010_nueva.sql"
run bloquea "cp encima de una existente"     "cp x.sql supabase/migrations/0001_core.sql"
run bloquea "mv dentro de la carpeta (cd)"   "cd supabase/migrations && mv 0001_core.sql 0001_x.sql"
run bloquea "heredoc con ; rm -rf en la apertura" $'cat <<EOT; rm -rf x\nhola\nEOT'
run bloquea "heredoc con && rm -rf"          $'cat <<\'EOT\' && rm -rf x\nhola\nEOT'
run bloquea "heredoc con | y git push -f"    $'cat <<EOT >f; git push -f\nhola\nEOT'
run bloquea "heredoc por pipe a psql"        $'cat <<SQL | psql\ntruncate t;\nSQL'
run bloquea "heredoc sin comillas con \$(rm -rf)" $'cat <<EOT >/dev/null\n$(rm -rf x)\nEOT'
run pasa    "heredoc con comillas es dato"   $'cat <<\'EOT\' >/dev/null\n$(rm -rf x)\nEOT'
run bloquea "barra invertida + salto (rm)"   $'rm \\\n -rf y'
run bloquea "barra invertida + salto (push)" $'git push \\\n -f'

echo "== Write/Edit: migraciones =="
check bloquea "Write que vacía migración"     "$(write_json "$MIG/0001_core.sql" "")"
check bloquea "Write que deja 3 líneas"       "$(write_json "$MIG/0001_core.sql" $'a\nb\nc\n')"
check bloquea "Write con 12 líneas en blanco" "$(write_json "$MIG/0001_core.sql" $'a\n\n\n\n\n\n\n\n\n\n\n\nb\n')"
check pasa    "Write de migración nueva corta" "$(write_json "$MIG/0010_nueva.sql" $'create table t (id int);\n')"
check pasa    "Write que mantiene 15 líneas"  "$(write_json "$MIG/0001_core.sql" "$(seq 1 15)")"
# En un FS que no distingue mayúsculas (macOS) esa ruta ES la migración y se bloquea; en uno que sí (Linux, CI)
# es otro archivo, que no existe, y pasa. El hook decide por el archivo real, así que el esperado depende del FS.
if [ -e "$FIXTURE/Supabase/Migrations/0001_core.sql" ]; then UPPER_EXPECTED=bloquea; else UPPER_EXPECTED=pasa; fi
check "$UPPER_EXPECTED" "ruta con mayúsculas (FS: $UPPER_EXPECTED)" "$(write_json "$FIXTURE/Supabase/Migrations/0001_core.sql" "")"
check bloquea "ruta con .."                   "$(write_json "$FIXTURE/supabase/x/../migrations/0001_core.sql" "")"
check bloquea "ruta relativa"                 "$(write_json "supabase/migrations/0001_core.sql" "")"
check bloquea "Edit que borra casi todo"      "$(edit_json "$MIG/0001_core.sql" "$(sed -n 3,20p "$MIG/0001_core.sql")" "")"
check pasa    "Edit chico en migración"       "$(edit_json "$MIG/0001_core.sql" "-- línea 1" "-- línea uno")"
check bloquea "Edit replace_all que vacía"    "$(edit_json "$MIG/0002_repetida.sql" "select 1;" "" 1)"
check bloquea "MultiEdit que vacía"           "$(multi_json "$MIG/0001_core.sql" "$(cat "$MIG/0001_core.sql")" "x")"

echo "== Write/Edit: secretos =="
check bloquea "clave sk_"                     "$(write_json "$FIXTURE/a.ts" "const k = '$SK'")"
check bloquea "clave tr_dev_"                 "$(write_json "$FIXTURE/a.ts" "TRIGGER_SECRET_KEY=$TR")"
check bloquea "clave vck_"                    "$(write_json "$FIXTURE/a.ts" "token: $VCK")"
check bloquea "JWT eyJ"                       "$(write_json "$FIXTURE/a.ts" "anon = '$JWT'")"
check bloquea "postgresql:// con contraseña"  "$(write_json "$FIXTURE/a.ts" "DB=$PGURL")"
check bloquea "secreto en Edit"               "$(edit_json "$FIXTURE/a.ts" "x" "$SK")"
check bloquea "secreto en MultiEdit"          "$(multi_json "$FIXTURE/a.ts" "x" "$JWT")"
check bloquea "sk_ pegado a un prefijo"       "$(write_json "$FIXTURE/a.ts" "KEY_$SK")"
check bloquea "tr_dev_ pegado a un prefijo"   "$(write_json "$FIXTURE/a.ts" "X_$TR")"
check bloquea "POSTGRESQL:// en mayúsculas"   "$(write_json "$FIXTURE/a.ts" "$(printf %s "$PGURL" | tr a-z A-Z)")"
check bloquea "postgresql:// sin usuario"     "$(write_json "$FIXTURE/a.ts" "postgresql://:$(printf %s "$FAKEPW")@db.x.supabase.co/postgres")"
check pasa    "postgresql:// con variable"    "$(write_json "$FIXTURE/a.ts" "postgresql://postgres:$PW@db.$STAGING.supabase.co:5432/postgres")"
check pasa    "postgresql:// local"           "$(write_json "$FIXTURE/a.ts" "postgresql://postgres:postgres@127.0.0.1:54322/postgres")"
check pasa    "postgresql:// sin contraseña"  "$(write_json "$FIXTURE/a.ts" "postgresql://postgres@db.$STAGING.supabase.co/postgres")"
check pasa    "placeholder <password>"        "$(write_json "$FIXTURE/a.ts" "postgresql://postgres:<password>@db.x.supabase.co/postgres")"
check pasa    "nombre sk_ corto no es secreto" "$(write_json "$FIXTURE/a.ts" "const sk_id = 1")"

echo "== Write/Edit: confirmación =="
check pregunta ".env.local por Write"         "$(write_json "$FIXTURE/.env.local" "A=1")"
check pregunta ".env.local por Edit"          "$(edit_json "$FIXTURE/.env.local" "A=1" "A=2")"
check pasa     ".env.example"                 "$(write_json "$FIXTURE/.env.example" "A=")"
check pregunta "archivo de policies"          "$(write_json "$FIXTURE/packages/tools/src/policy.ts" "export {}")"
check pregunta "SQL con create policy"        "$(write_json "$MIG/0010_nueva.sql" "create policy p on t for all using (true);")"
check pregunta "Edit que quita un policy"     "$(edit_json "$FIXTURE/b.sql" "drop policy if exists p on t;" "")"
check pregunta "tabla policies en SQL"        "$(write_json "$MIG/0010_nueva.sql" "alter table policies add column x int;")"
check pasa     "markdown que menciona policies" "$(write_json "$FIXTURE/notas.md" "Las policies se evalúan en código.")"
check pasa     "privacy-policy.ts no es policies" "$(write_json "$FIXTURE/src/privacy-policy.ts" "export {}")"
check pasa     "comentario con policies en .ts" "$(write_json "$FIXTURE/src/x.ts" "// las policies se leen en runtime")"
check bloquea  "MultiEdit con edit null"     '{"tool_name":"MultiEdit","tool_input":{"file_path":"/tmp/x","edits":[null]}}'
check pasa     "Write común"                  "$(write_json "$FIXTURE/src/index.ts" "export const x = 1")"

echo "== cableado en settings.json =="
SETTINGS="$(cd "$(dirname "$0")/../.." && pwd)/settings.json"
config() { # config <descripción> <expresión python sobre s (settings) y h (hook PreToolUse)>
  if python3 - "$SETTINGS" "$2" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
h = s["hooks"]["PreToolUse"][0]
sys.exit(0 if eval(sys.argv[2]) else 1)
PY
  then echo "ok    $1"; else echo "FALLA $1"; FAILS=$((FAILS+1)); fi
}
config "matcher cubre Bash, Write, Edit, MultiEdit y los dos MCP de Supabase" 'set(h["matcher"].split("|")) >= {"Bash","Write","Edit","MultiEdit","mcp__supabase__.*","mcp__claude_ai_Supabase__.*"}'
config "ruta con \$CLAUDE_PROJECT_DIR"               '"$CLAUDE_PROJECT_DIR" in h["hooks"][0]["command"]'
config "onFailure: block"                            'h["hooks"][0].get("onFailure") == "block"'
config "deny de rm -rf, push --force y db push"      'all(r in s["permissions"]["deny"] for r in ("Bash(rm -rf *)","Bash(git push --force *)","Bash(supabase db push)"))'
out="$(cd / && bash_json "rm -rf x" | CLAUDE_PROJECT_DIR="${SETTINGS%/.claude/settings.json}" bash -c 'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-tool-use.sh' 2>&1)"
[ $? -eq 2 ] && echo "ok    el comando del hook funciona desde otro cwd" || { echo "FALLA comando del hook desde otro cwd: $out"; FAILS=$((FAILS+1)); }

echo
[ "$FAILS" -eq 0 ] && echo "todos los casos OK" || { echo "$FAILS caso(s) fallaron"; exit 1; }
