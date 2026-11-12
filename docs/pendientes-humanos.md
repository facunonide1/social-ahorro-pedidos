# Pendientes de Facu

Lista viva de lo que necesita una persona, ordenada por prioridad. Cada ítem
dice qué hace falta, por qué, qué se traba si no llega, dónde se resuelve y
el texto exacto de la firma.

Nada de esto lo hace un agente: no aplica SQL, no toca secretos ni
variables, no mergea a main y no deploya.

---

## Orden de merge propuesto

Los PRs van apilados: cada uno apunta a la rama del anterior, así la bitácora
no choca. Se mergean en este orden. Al mergear uno, el siguiente se re-apunta
a `main`.

| # | PR | Rama | Migración | Firma |
|---|---|---|---|---|
| ✓ | [#9](https://github.com/facunonide1/social-ahorro-pedidos/pull/9) | `claude/bold-turing-9ualkj` | — | firmado y mergeado (e59e71e) |
| ✓ | [#10](https://github.com/facunonide1/social-ahorro-pedidos/pull/10) | `chore/backlog` | — | firmado y mergeado (bea4fef) |
| ✓ | [#11](https://github.com/facunonide1/social-ahorro-pedidos/pull/11) | `chore/ci-tests` | — | firmado y mergeado (fa7a354) |
| 1 | [#12](https://github.com/facunonide1/social-ahorro-pedidos/pull/12) | `fix/avisos-dedup-por-tandas` | — | «Firmo merge y deploy del PR #12, SHA …» |
| 2 | [#15](https://github.com/facunonide1/social-ahorro-pedidos/pull/15) | `feat/seguridad-pin-debil` | — | «Firmo merge y deploy del PR #15, SHA …» |
| 3 | [#14](https://github.com/facunonide1/social-ahorro-pedidos/pull/14) | `feat/estabilidad-cerebro` | 0297 | Un solo paquete: «Firmo merge del PR #14, SHA …, y aplicar la migración 0297 en prod» |
| 4 | [#13](https://github.com/facunonide1/social-ahorro-pedidos/pull/13) | `fix/crons-tandas` | — | «Firmo merge y deploy del PR #13, SHA …». Ya va por tramos con plazo: ninguna corrida pasa los 60 s y la que no llega no escribe. |
| 5 | [#16](https://github.com/facunonide1/social-ahorro-pedidos/pull/16) | `chore/auditar-definer` | — | «Firmo merge del PR #16, SHA …» |
| 6 | [#17](https://github.com/facunonide1/social-ahorro-pedidos/pull/17) | `fix/multisucursal-denegado` | — | «Firmo merge y deploy del PR #17, SHA …» |
| 7 | [#18](https://github.com/facunonide1/social-ahorro-pedidos/pull/18) | `feat/pulido-estados` | — | «Firmo merge y deploy del PR #18, SHA …» |
| 8 | [#19](https://github.com/facunonide1/social-ahorro-pedidos/pull/19) | `chore/banderas` | — | «Firmo merge del PR #19, SHA …» |
| 9 | [#20](https://github.com/facunonide1/social-ahorro-pedidos/pull/20) | `chore/tests-ingesta-woo` | — | «Firmo merge y deploy del PR #20, SHA …» |
| 10 | [#26](https://github.com/facunonide1/social-ahorro-pedidos/pull/26) | `fix/crons-registro` | — | «Firmo merge y deploy del PR #26, SHA …» |
| 11 | [#27](https://github.com/facunonide1/social-ahorro-pedidos/pull/27) | `fix/auditor-avisos-tandas` | — | «Firmo merge y deploy del PR #27, SHA …» |
| 12 | [#28](https://github.com/facunonide1/social-ahorro-pedidos/pull/28) | `feat/seguridad-indices-fk` | — (consulta de sólo lectura; los índices, P12) | «Firmo merge del PR #28, SHA …» |
| 13 | [#29](https://github.com/facunonide1/social-ahorro-pedidos/pull/29) | `feat/seguridad-rls-initplan` | — (consultas de sólo lectura; aplicar, P13) | «Firmo merge del PR #29, SHA …» |
| 14 | [#30](https://github.com/facunonide1/social-ahorro-pedidos/pull/30) | `chore/esquema-vivo` | — (consultas de sólo lectura, P14) | «Firmo merge del PR #30, SHA …» |
| 15 | [#31](https://github.com/facunonide1/social-ahorro-pedidos/pull/31) | `feat/pulido-proximamente` | — | «Firmo merge y deploy del PR #31, SHA …» |
| 16 | [#35](https://github.com/facunonide1/social-ahorro-pedidos/pull/35) | `feat/multisucursal-canales` | — | «Firmo merge y deploy del PR #35, SHA …» |
| 17 | [#36](https://github.com/facunonide1/social-ahorro-pedidos/pull/36) | `feat/multisucursal-acceso` | — | «Firmo merge y deploy del PR #36, SHA …» |
| 18 | [#37](https://github.com/facunonide1/social-ahorro-pedidos/pull/37) | `chore/limpiar-shell-viejo` | — | «Firmo merge y deploy del PR #37, SHA …» |
| 19 | [#38](https://github.com/facunonide1/social-ahorro-pedidos/pull/38) | `feat/pulido-errores-lectura` | — | «Firmo merge y deploy del PR #38, SHA …» |

**Segunda pila: compras e ingesta** (sale de `main`; sus PRs van en este
orden; si chocan con la primera en `docs/bitacora.md`, se re-apilan antes de
firmar):

| # | PR | Rama | Migración | Firma |
|---|---|---|---|---|
| 1 | [#22](https://github.com/facunonide1/social-ahorro-pedidos/pull/22) (reemplaza #7) | `feat/compras-cruce` | 0296 opcional (sin la tabla la ingesta sigue) | «Firmo merge y deploy del PR #22, SHA 86a8065»; aparte «Firmo aplicar la migración 0296 en prod» |
| 2 | [#23](https://github.com/facunonide1/social-ahorro-pedidos/pull/23) | `feat/compras-lineas` | — | «Firmo merge y deploy del PR #23, SHA …» |
| 3 | [#24](https://github.com/facunonide1/social-ahorro-pedidos/pull/24) | `feat/fuentes-interfaz` | — | «Firmo merge y deploy del PR #24, SHA …» |
| 4 | [#32](https://github.com/facunonide1/social-ahorro-pedidos/pull/32) | `feat/ingesta-archivos-grandes` | — | «Firmo merge y deploy del PR #32, SHA …» |
| 5 | [#33](https://github.com/facunonide1/social-ahorro-pedidos/pull/33) | `feat/ingesta-incremental` | — | «Firmo merge y deploy del PR #33, SHA …» |
| 6 | [#34](https://github.com/facunonide1/social-ahorro-pedidos/pull/34) | `feat/fuente-find` | — | «Firmo merge del PR #34, SHA …» |

**Tercera pila: precios** (sale de `main`):

| # | PR | Rama | Migración | Firma |
|---|---|---|---|---|
| 1 | [#21](https://github.com/facunonide1/social-ahorro-pedidos/pull/21) (reemplaza #6) | `feat/precios-historial` | **0295 ANTES del deploy** (sin ella el comparador queda vacío) | Paquete: «Firmo aplicar la migración 0295 en prod y, después, merge y deploy del PR #21, SHA 57e9a0e» |
| 2 | [#25](https://github.com/facunonide1/social-ahorro-pedidos/pull/25) | `fix/comparador-items` | — | «Firmo merge y deploy del PR #25, SHA …» |

El SHA exacto de cada uno se completa en la firma cuando el PR quede cerrado
y con CI en verde. Rollback de cualquiera: promover en Vercel el deploy
anterior. Ninguno de estos cambia datos.

## P1 · Merge del hotfix del build (PR #9)

- **Qué:** mergear y deployar [PR #9](https://github.com/facunonide1/social-ahorro-pedidos/pull/9).
- **Por qué:** hoy cada deploy de producción escribe `agentes_resumen_snapshot`
  y le carga a la base unos 20 s de cálculo. Y el comando de la bitácora para
  correr el auditor crea usuarios reales.
- **Si no llega:** sigue pasando eso en cada deploy.
- **Dónde:** GitHub, y después Vercel.
- **Rollback:** promover el deploy anterior (`dpl_GviuDZxnxRuSC97cn8WybpbqkuDJ`).
- **Firma:** «Firmo merge y deploy del PR #9, SHA 9f170fd».

## P2 · Acceso de solo lectura a la base para los agentes

- **Qué:** abrir una sesión nueva en el entorno de Claude
  `social-ahorro-pedidos` (ya permite `mcp.supabase.com` y la URL del
  proyecto), y conectar el MCP de Supabase en modo solo lectura.
- **Por qué:** sin la base no se puede:
  - armar el revoke de las 9 funciones (F2);
  - traer el cuerpo de `decisiones_pendientes` (A4) y el resto del esquema
    que vive sólo en la base (F8);
  - leer los advisors (F5, F6);
  - revisar los usuarios `@rls.test` (F7).
- **Si no llega:** A4, F2, F5 (la lista real), F6, F7 y F8 quedan
  bloqueados. El resto sigue.
- **Dónde:** claude.ai/code, con una sesión nueva en ese entorno.
- **Firma:** «Autorizo acceso de solo lectura del MCP de Supabase al proyecto
  hrjxjbirajbsurobqdca».

## P3 · Cambiar el PIN del super admin

- **Qué:** poner un PIN nuevo desde `/admin/configuracion/usuarios`.
- **Por qué:** el PIN actual es débil. Cuando entre F1, la pantalla rechaza
  los PINs débiles (todos iguales, escaleras, años).
- **Si no llega:** el acceso queda abierto a quien pruebe los PINs obvios.
- **Dónde:** la app, logueado.
- **Firma:** no hace falta; avisar cuando esté.

## P4 · Protección de contraseñas filtradas

- **Qué:** prenderla en Supabase, en Authentication → Sign In / Providers →
  Email.
- **Por qué:** sin ella, Auth acepta contraseñas que ya aparecen en
  filtraciones.
- **Si no llega:** F4 sigue abierto.
- **Dónde:** el dashboard de Supabase.
- **Firma:** «Firmo activar la protección de contraseñas filtradas en Supabase
  Auth».

## P5 · Migraciones, en este orden

No se aplica ninguna hasta que su PR esté mergeado. Cada una tiene su
rollback en `supabase/rollbacks/`.

| Orden | Migración | PR | Qué hace | Rollback | Firma |
|---|---|---|---|---|---|
| 1 | 0294 | #5 (ya en main) | Varias carpetas de Drive | `rollbacks/0294_…` | «Firmo aplicar migración 0294 en prod» |
| 2 | 0295 | #21 (reemplaza #6) · **antes del deploy del #21** | `vigente_desde` y `clave_dedup` (sólo columnas) | `rollbacks/0295_…` | «Firmo aplicar migración 0295 en prod» |
| 3 | 0296 | #22 (reemplaza #7) | `sifaco_seccion_proveedor` con RLS | `rollbacks/0296_…` | «Firmo aplicar migración 0296 en prod» |
| 4 | 0297 | `feat/estabilidad-cerebro` | pg_cron del cerebro de cada minuto a cada 5 (no toca la función) | `rollbacks/0297_…` | junto con el PR #14: «Firmo merge del PR #14, SHA …, y aplicar la migración 0297 en prod» |

Las siguientes se agregan a la tabla a medida que se preparen (cerebro, Monroe,
maestro por sucursal, revoke, índices).

## P6 · Variables de Supabase en Vercel Preview

- **Qué:** que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  apliquen a todas las ramas de Preview, no sólo a `feature/crm-redesign`. La
  `SUPABASE_SERVICE_ROLE_KEY` conviene dejarla fuera de Preview.
- **Por qué:** sin ellas, las previews compilan pero no se pueden probar
  logueado.
- **Si no llega:** las pruebas en preview quedan sin base. CI no se traba:
  no usa secretos.
- **Dónde:** Vercel → Settings → Environment Variables.
- **Firma:** «Firmo ampliar las env de Supabase (URL y anon) a todas las ramas
  de Preview».

## P7 · Cerrar PRs reemplazados

- **Qué:** cerrar el PR #3 (su 0294 choca con la de main y su comparador lo
  reemplazaron el #5 y el #6). El #6 y el #7 se cierran cuando entren sus
  reemplazos, #21 y #22.
- **Por qué:** que no se mergee por error una 0294 duplicada.
- **Dónde:** GitHub.
- **Firma:** «Firmo cerrar el PR #3 como reemplazado».

## P8 · PR #1 (guardrail) y PR #2 (docs)

- **Qué:** decidir si entran.
- **#1:** agrega hooks de Claude (`.claude/`) que bloquean scripts que
  escriben en producción. Mergea limpio contra main.
- **#2:** agrega `docs/COMO-FUNCIONA-HOY.md`.
- **Firma:** «Firmo merge del PR #1, SHA 35ab431» y/o «Firmo merge del PR #2,
  SHA 6c15bfc», o «Cerrar #1/#2».

## P9 · Usuarios `@rls.test`

- **Qué:** si no llega P2, correr en la máquina (es de solo lectura):
  `npx tsx --env-file=.env.local scripts/buscar-usuarios-auditor.ts`
  (está en la rama del PR #9).
- **Si aparece alguno:** borrarlo de Auth y de `users_admin`.
- **Firma para borrar:** «Firmo borrar los usuarios @rls.test listados».

## P11 · Cómo está configurado el límite de tiempo en Vercel

- **Qué:** decir el plan de Vercel y si el proyecto tiene fluid compute
  prendido (Settings → Functions).
- **Por qué:** `medidor` declara `maxDuration = 300` y se deploya, así que el
  plan permite más de 60 s. Con fluid compute, el valor por defecto ya es 300:
  declarar 60 en un cron lo **bajaría**. #12 y #13 declaran 60 en crons
  hechos para entrar en 60 s. En el resto no se tocó.
- **Si no llega:** los crons siguen con su límite actual. Sólo se pierde poder
  ajustar cada uno con datos.
- **Dónde:** Vercel → proyecto social-ahorro-pedidos → Settings → Functions.
- **Firma:** no hace falta; alcanza con la respuesta.

## P12 · Crear los índices de las foreign keys

- **Qué:** correr `supabase/consultas/indices_fk_faltantes.sql` en el SQL
  editor de Supabase. Es de sólo lectura y devuelve, por FK sin índice, la
  sentencia `crear` y su `rollback`, las tablas más grandes primero. Después,
  ejecutar las sentencias `crear` **de a una** (no pegar varias juntas: el
  editor las envuelve en una transacción y `concurrently` falla adentro).
  Empezar por las 20 más grandes y medir.
- **Por qué:** es una de las dos causas de fondo de los timeouts. Sin índice,
  cada join por la FK y cada borrado en la tabla padre recorre la hija entera.
- **Si no llega:** los crons y las pantallas siguen recorriendo tablas enteras.
- **Rollback:** la columna `rollback` de cada fila (`drop index concurrently`).
  Un índice que quedó INVALID por un corte se borra igual y se reintenta.
- **Firma:** «Firmo crear en prod los índices de FK que lista la consulta,
  empezando por las N más grandes».

## P13 · RLS: envolver auth.uid() y revisar permisivas duplicadas

- **Qué:** correr `supabase/consultas/rls_initplan.sql`. Es de sólo lectura:
  por política, devuelve `cambiar` y `rollback`. Aplicar `cambiar` tabla por
  tabla, empezando por las tablas grandes (stock, movimientos, pedidos).
  Después, correr `rls_permisivas_multiples.sql` y decidir qué política sobra
  en cada caso: no es mecánico.
- **Por qué:** 430 políticas evalúan `auth.uid()` por fila. Es costo puro en
  cada pantalla que lee con sesión, y suma a los timeouts.
- **Si no llega:** las lecturas con sesión siguen pagando ese costo.
- **Rollback:** la columna `rollback` de cada fila.
- **Firma:** «Firmo aplicar en prod los alter policy de initplan de las
  tablas …».

## P14 · Dos consultas de sólo lectura que destraban F2, A4 y C1

Si P2 (acceso de los agentes a la base) no llega, esto lo reemplaza.

- **Qué:** correr en el SQL editor de Supabase y pegar el resultado en un
  comentario del PR o en un archivo:
  1. `supabase/consultas/definer_abiertas_a_anon.sql`: las funciones abiertas
     a anon, con las políticas que las usan.
  2. `supabase/consultas/esquema_vivo.sql`: el DDL de la vista, las funciones
     y la tabla que no están en el repo.
- **Por qué:** con (1) se arma la migración del revoke (F2) sin adivinar. Con
  (2) se puede arreglar `decisiones_pendientes` (A4) y escribir el aplicar del
  maestro por sucursal (C1).
- **Si no llega:** F2, A4 y C1 siguen bloqueados.
- **Firma:** no hace falta, las dos sólo leen.

## P15 · Dar de alta Monroe Americana (y confirmar OMICRON)

- **Qué:** en `/admin/proveedores/nuevo`, crear «MONROE AMERICANA» con su CUIT
  real. Confirmar que existe un proveedor OMICRON.
- **Por qué:** el #22 ya reconoce «Monroe Americana» y «Laboratorio Omicron»
  en las listas y facturas, pero si el proveedor no existe, la lista queda sin
  droguería y no entra al comparador. `cuit` es obligatorio y único: no se
  carga por migración con un CUIT inventado.
- **Si no llega:** las listas de Monroe Americana quedan en previa.
- **Firma:** no hace falta; es un alta desde la app.

## P10 · Datos de negocio

- Confirmar el mapeo de secciones de SIFACO, sobre todo `NOR → NORMA`, que
  está dudoso.
- Quién da acceso a FIND, y cómo, cuando llegue el momento (H2).
