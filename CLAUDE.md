# CLAUDE.md — NORA

NORA es el sistema operativo de Social Ahorro: cuatro farmacias en Ituzaingó (Guzmán, Figueiras, Arabia, Tesei)
más el ecommerce. Orquesta a SIFACO (el sistema de mostrador) sin reemplazarlo: compras y reposición, stock entre
sucursales, caja y pagos, tareas con evidencia, convenios con obras sociales, canales de venta, detección de lo que
no cuadra, agentes por sector y el cerebro con voz del dueño.

**Está en producción con usuarios.** Cualquier error llega a una farmacia abierta.

## Reglas duras (mandan sobre todo lo demás; varias las aplica `.claude/hooks/pre-tool-use.sh`)

1. **Producción es intocable:** ni base (`hrjxjbirajbsurobqdca`), ni deploy, ni variables de entorno, ni dominio.
   Solo lectura para entender. Todo trabajo va a staging o a una rama de base de Supabase.
   Un push a `main` despliega producción en Vercel: nunca se pushea a `main`.
2. **Antes de cambiar algo, leer y documentar cómo funciona hoy** (`docs/COMO-FUNCIONA-HOY.md`) y correr los tests
   existentes para tener la línea base. Si no hay tests de lo que se va a tocar, escribirlos primero.
3. **Solo cambios aditivos:** tablas, columnas y endpoints nuevos. Nunca renombrar, borrar ni cambiar el tipo de
   algo existente. Nunca cambiar el comportamiento de un endpoint que ya se usa: si hace falta, uno nuevo versionado.
4. **Todo lo nuevo detrás de una bandera apagada por defecto.** En producción nadie ve nada hasta que Facundo la
   prende.
5. **Cada migración con `down`, probado en staging antes del PR.**
6. **No actualizar dependencias ni frameworks.** No tocar autenticación, RLS, pagos, facturación ni datos de
   empleados sin dejarlo en `PENDIENTE.md` y esperar.
7. **Prueba de humo antes y después de cada etapa** (login, ver stock, cargar un pedido) en staging, con la
   evidencia en el PR.
8. Si hay dos caminos y uno es más seguro, el seguro. El otro se anota.
9. **Nunca mergear, nunca `push --force`, nunca borrar branches** (ni propios ni ajenos).
10. Nunca commitear secretos. Si aparece uno en un archivo, parar y avisar.
11. Un PR por tema, en su branch.

### Lo que va a `PENDIENTE.md` en vez de hacerse

Permisos, RLS, datos de producción, dinero, datos de empleados y cualquier migración a producción. Se escribe la
pregunta con las opciones y la recomendación, y se sigue con lo que no dependa de eso. Facundo revisa ese archivo
una vez por día. Si algo falla dos veces: PR en borrador con el bloqueo documentado, y seguir.

## Las dos reglas de los datos

- **Cero es «lo miré y no hay». Null es «no lo puedo saber».** Un `?? 0` sobre un error es un bug.
- **Una regla describe el hecho, no la sospecha.**
- Nunca escribir nombres de columnas, constantes ni funciones de memoria: consultar el esquema primero.
- Los LLM no calculan números de negocio: eso es SQL o funciones con tests.
- SIFACO es la autoridad de precio y stock (regla de oro 1).

## Stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres 17, RLS) · Vercel (plan Hobby: crons solo diarios) ·
Tailwind + shadcn · `@supabase/ssr`. Migraciones en `supabase/migrations/NNNN_nombre.sql` (numeración propia,
verificar con `ls` antes de crear).

## Flujo de trabajo, por tema

1. **Plan:** `/ecc:plan`.
2. **Implementación:** skill `tdd-workflow` (test primero, después código).
3. **Revisión:** `/ecc:code-review` sobre el diff del branch.
4. **Revisión cruzada:** `/astra-review`.
5. **PR** (en borrador si falta staging o algo de `PENDIENTE.md`), con la evidencia: comandos corridos, salida
   de los tests, prueba de humo. **Nunca mergear.**

## Cuidado: los tests de este repo escriben en producción

`.env.local` apunta a producción. **`npm run build` escribe ahí**: `auditar:rls-roles` crea y borra usuarios en
auth, y `verificar:coherencia` recalcula `agentes_resumen`. Casi todos los `npm run probar:*` insertan y borran datos
de prueba. El hook bloquea esas invocaciones. Mientras no haya staging, la línea base se corre con lo que es de
solo lectura: `npx tsc --noEmit`, `npx next build`, `npm run auditar:cortes`, `auditar:rls`, `auditar:lente`,
`probar:permisos`, `verificar:limite`, `probar:cerebro` y los tests del hook.

## Línea base que tiene que seguir verde

- `npm run build` corre siete auditores antes de compilar (cortes, RLS, lente, permisos, RLS por rol,
  coherencia, límite). Ninguna función nueva ejecutable por `authenticated` salvo excepción declarada que use
  `auth.uid()` y consulte `users_admin`.
- `bash .claude/hooks/tests/pre-tool-use.test.sh` (el guardrail).
- Los `npm run probar:*` de cada sector.

## Hooks y reglas de ECC

Las reglas de `.claude/rules/ecc/` (common, typescript, react, web) son guía general. Si chocan con este archivo,
manda este archivo. Los hooks de ECC corren con perfil `minimal` (`env.ECC_HOOK_PROFILE` en `.claude/settings.json`).
Cualquiera sea el perfil, `.claude/hooks/pre-tool-use.sh` sigue activo y es fail-closed: si bloquea, la acción no se
ejecuta. El MCP de Supabase del proyecto está en modo solo lectura (`.mcp.json`).
