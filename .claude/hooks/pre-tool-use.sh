#!/usr/bin/env bash
# Guardrail determinista: evalúa Bash, Write, Edit y MultiEdit ANTES de que Claude Code los ejecute.
# Claude Code pasa el JSON del tool call por stdin. Salir con código 2 = bloquear.
# La lógica vive en pre_tool_use.py. Este wrapper es fail-closed: si falta python3 o el
# evaluador termina con un código distinto de 0/2 (excepción, crash), se bloquea.
set -uo pipefail

deny() { echo "BLOQUEADO por .claude/hooks/pre-tool-use.sh: $1" >&2; exit 2; }

HOOK_DIR="${BASH_SOURCE[0]%/*}"   # sin dirname: tiene que funcionar aunque PATH esté roto
command -v python3 >/dev/null 2>&1 || deny "python3 no disponible (fail-closed)"
[ -f "$HOOK_DIR/pre_tool_use.py" ] || deny "falta pre_tool_use.py (fail-closed)"

python3 -I "$HOOK_DIR/pre_tool_use.py"
code=$?
case "$code" in
  0|2) exit "$code" ;;
  *)   deny "el evaluador falló con código $code (fail-closed)" ;;
esac
