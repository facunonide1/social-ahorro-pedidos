# Guardrail PreToolUse

`pre-tool-use.sh` corre antes de cada `Bash`, `Write`, `Edit`, `MultiEdit` y herramienta MCP de Supabase
(ver `.claude/settings.json`). Adaptado de `facundo-os` para NORA, que está en producción con usuarios.
Aplica en código determinista las reglas duras de `CLAUDE.md`. La lógica vive en `pre_tool_use.py`;
el `.sh` es un wrapper fail-closed.

## Decisiones

| Resultado | Cómo lo ve Claude Code |
|---|---|
| **bloquea** | exit 2, motivo por stderr. La acción no se ejecuta. |
| **pregunta** | JSON `permissionDecision: "ask"`. Claude Code te pide confirmación (solo Write/Edit). |
| **pasa** | exit 0 sin salida. Sigue el flujo normal de permisos. |

## Fail-closed

Bloquea si el JSON no se parsea, si falta `tool_name`/`tool_input`, si el comando viene vacío, si falta `file_path`,
si un `MultiEdit` trae edits inválidos, si no hay `python3` o si el evaluador termina con un código distinto de 0/2.
El hook además está declarado con `onFailure: "block"`, así que un timeout o un script inexistente también bloquean.

## Bash

**Cómo se lee el comando.** El comando se pasa a minúsculas y se tokeniza respetando comillas: `&&`, `||`, `;`, `|`,
`&`, paréntesis, saltos de línea y redirecciones quedan como tokens aparte, y el comando se evalúa por segmento.
La continuación con barra invertida se une antes de leer. El cuerpo de un heredoc se trata como dato, así que un
`git commit -m "$(cat <<'EOF' …)"` que *menciona* `rm -rf` no se bloquea. Hay tres excepciones: el resto de la
línea de apertura sí se evalúa (`cat <<EOT; rm -rf x`); si esa línea tiene un cliente de base, se revisa el DDL
del cuerpo; y en un heredoc sin comillas se inspeccionan las `$(…)` del cuerpo. Sí se inspecciona, de forma recursiva y con hasta 4 niveles, lo que el shell va a
ejecutar: `$(…)`, backticks y el argumento de `bash/sh/zsh -c`, `eval`, `ssh`, `su` y `watch`.

**Qué bloquea.**
- `rm` recursivo y forzado en cualquier forma (`-rf`, `-r -f`, `-Rf`, `--recursive --force`, `/bin/rm`, `sudo`, flags al final).
- `truncate`, `drop schema` y `drop database` dentro de un segmento que invoca un cliente de base
  (`psql`, `supabase db …`, `mysql`, `sqlite3`, …) o en el heredoc que se le pasa.
  `truncate -s0 archivo.log` no cuenta.
- `git push` con `--force*`, `-f`, `+ref`/`ref:+ref`, `--delete`/`-d`, `:ref`, `--mirror` o `--prune`,
  también con `git -C dir push`.
- **Migraciones** (`supabase/migrations/`): cualquier comando sobre una ruta con `migrations`, globs incluidos
  (`supabase/m*/…`), o hecho después de un `cd` a ese directorio, que:
  - borre: `rm`, `unlink`, `truncate`, `shred`, `git rm/mv/checkout/restore/clean`, `find -delete/-exec`;
  - saque o renombre con `mv` una migración;
  - pise: `sed -i`, `perl -i`, `dd of=`, `tee` sin `-a`, o `cp`/`mv`/`>` sobre un archivo que ya existe.

  Crear una migración nueva sí pasa: por redirección (`supabase db diff > supabase/migrations/0010_x.sql`)
  o con `cp`/`mv` desde afuera hacia un nombre nuevo.
- **`supabase db push/reset`**, también vía `npx`, `pnpm dlx` o `supabase@version`:
  - pasa solo con una URL literal de staging (`db.<ref>.supabase.co` o el pooler con usuario `postgres.<ref>`)
    o de localhost, sin query string;
  - `--local` pasa si no viene con `--db-url`, `--linked` ni `--project-ref`;
  - `push --dry-run` pasa;
  - una URL en variable (`--db-url "$X"`) se bloquea porque no se puede verificar.
- Cualquier comando que use el ref de producción de NORA (`hrjxjbirajbsurobqdca`) o el de Axis, salvo
  `supabase db pull`, `supabase link` y `supabase projects list`. Incluye `curl` a la API REST del proyecto.
- **NORA no tiene staging todavía** (`STAGING_REF = ""`): `db push/reset` solo pasa contra localhost.
  Cuando exista staging, su ref va en `STAGING_REF` y en los tests.
- **Producción por otros caminos:** `git push` a `main`/`master` (Vercel despliega producción desde main),
  `git push` sin rama estando en main, `vercel --prod`, `promote`, `rollback`, `alias`, `domains`,
  `vercel env add/rm/update`.
- **Nunca mergear ni borrar branches:** `gh pr merge`, `gh api …/merge`, `git branch -d/-D`.

## MCP de Supabase

Las herramientas MCP no pasan por Bash, así que el original no las veía.
- **Bloquea siempre** (salvo contra `STAGING_REF`): `apply_migration`, `deploy_edge_function`,
  `create_edge_function_secret`, `create/pause/restore_project`, y crear, borrar, mergear o resetear ramas
  (crear una rama cuesta plata).
- **`execute_sql` fuera de staging es solo lectura:** una sentencia, que empiece con
  `select/with/explain/show`, sin verbos de escritura fuera de los literales, sin `$$` y sin llamar funciones
  que no estén en la lista de lectura. `select cerebro_calcular()` es un select que escribe: se bloquea.
- Segunda garantía, del lado del servidor: `.mcp.json` apunta al MCP con `read_only=true`.

## Write / Edit / MultiEdit

**Qué bloquea.**
- Contenido nuevo con secretos: `sk_live_/sk_test_…`, `sk-ant-…`, `tr_dev_/tr_prod_…`, `vck_…`, JWT `eyJ….…`
  (aunque estén pegados a un prefijo como `KEY_sk_…`), y `postgres(ql)://usuario:contraseña@host` en cualquier
  combinación de mayúsculas. No cuentan como secreto `$VAR`/`${VAR}`, `<placeholder>`, `[placeholder]`
  ni las URLs a `localhost`/`127.0.0.1`.
- Dejar un archivo existente de `supabase/migrations/` con menos de 10 líneas no vacías. La ruta se normaliza
  (`..`, mayúsculas, rutas relativas) y el edit se aplica sobre el contenido actual para medir el resultado.

**Qué pide confirmación.**
- Escribir `.env`, `.env.local` o cualquier `.env.*` salvo `.env.example`.
- Tocar policies (regla 7):
  - archivos llamados `policy*`/`policies*` o dentro de una carpeta `policies/` (no `privacy-policy.ts`);
  - cambios que crean, modifican o borran una policy de RLS (`create/alter/drop policy`);
  - en `.sql`, cambios que mencionan la tabla `policies`.

## Segunda capa: `permissions.deny`

`settings.json` niega por patrón `rm -rf`, `git push --force`/`-f`/`+ref` y `supabase db push/reset` sin URL,
con `--linked` o con la URL en variable. La doc de Claude Code advierte que estas reglas matchean el texto del
comando y **no son una barrera de seguridad**: `/bin/rm` o `git -C . push` las esquivan. Además, como deny gana
sobre allow, no se puede expresar "push solo a staging". El filtro fino es este hook.

## Límites conocidos

- Un script que Claude ejecute (`bash x.sh`, `python x.py`) no se inspecciona por dentro.
- La normalización es textual. La ofuscación deliberada (variables con el comando, base64, comentarios SQL
  entre `drop` y `schema`) puede pasar. El hook está pensado para errores de un agente, no para un atacante.
- `rm *` y otros globs que podrían cubrir `migrations` se bloquean aunque no la toquen: ante la duda, bloquea.
- Un commit cuyo mensaje mencione a la vez un cliente de base y `truncate`/`drop schema` *en el mismo segmento*
  se bloquea. Usá `git commit -F archivo`.

## Tests

```bash
bash .claude/hooks/tests/pre-tool-use.test.sh
```

Hay un caso por cada forma de esquivar conocida, incluidas las que encontró la revisión, más los casos
fail-closed, los falsos positivos que no deben bloquear y el cableado de `settings.json`.
Los secretos de prueba se arman en tiempo de ejecución, así que el archivo de tests no los contiene literalmente.
