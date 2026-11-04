# Cómo funciona NORA hoy

Relevado el 2026-11-04, sobre `main` en `ae5652e` (v1.5-cerebro), **solo leyendo**: código, esquema y la base de
producción en modo lectura. Es la línea base contra la que se mide cualquier cambio (regla 2 de `CLAUDE.md`).

## Qué es

El sistema operativo de Social Ahorro: cuatro farmacias en Ituzaingó (Guzmán SA-01, Figueiras SA-02, Arabia SA-03,
Tesei SA-04) y el ecommerce (SA-EC). Orquesta a SIFACO, el sistema de mostrador, sin reemplazarlo: **SIFACO es la
autoridad de precio y stock** y NORA lee lo que SIFACO exporta.

| | |
|---|---|
| Aplicación | Next.js 14 (App Router), TypeScript, Tailwind + shadcn |
| Base | Supabase `hrjxjbirajbsurobqdca` (Postgres 17, RLS), **producción** |
| Hosting | Vercel, plan Hobby (crons solo diarios). `main` despliega producción |
| Tamaño | 199 pantallas en `/admin`, 180 rutas de API, 287 migraciones |
| Staging | **No existe.** Ni proyecto aparte ni rama de Supabase (ver `PENDIENTE.md` §1) |
| Banderas | **No existe un mecanismo de banderas de funcionalidad.** Ver «Lo que la regla 4 va a necesitar» |

## Cómo entra la gente

- **Login:** `/login`, con email y contraseña de Supabase Auth, o con número de empleado y PIN (`lib/auth/pin*`).
- **Middleware** (`middleware.ts`): en cada request llama a `supabase.auth.getUser()`. Sin sesión, a `/login`.
  Excepciones explícitas: `/api/cron/*` (cada ruta verifica su secreto), `/api/sync`, `/api/woo-webhook`,
  `/bootstrap`, `/brief/*` (por token), `sw.js` y el manifest (modo sin conexión del mostrador).
- **Perfil:** cada usuario tiene una fila en `users_admin` con `rol` y `sucursal_id`. Las páginas llaman a
  `requireAdminHubAccess({ allowedRoles })` (`lib/admin-hub/auth.ts`).
- **Roles:** 13 (`lib/types/admin.ts`): super_admin, gerente, encargado_sucursal, comprador, tesoreria, cajero,
  repartidor, rrhh, marketing, empleado_general, y los legacy administrativo, auditor, sucursal. La matriz de
  permisos rol × módulo vive en `lib/types/permisos.ts` y se sincroniza a la base (`permisos:sincronizar`).
- **Hoy hay 4 usuarios, los 4 super_admin, y 1 empleado cargado.** Nadie más usa el sistema todavía.

## Los tres flujos de la prueba de humo

| Flujo | Dónde | Qué toca |
|---|---|---|
| Login | `/login` → middleware → `requireAdminHubAccess` | `auth.users`, `users_admin` |
| Ver stock | `/admin/operaciones/stock` (`page.tsx`, `stock-client.tsx`) | `stock_items`, `productos_catalogo`, `producto_rotacion`, `quiebres_por_sucursal`, `lotes_productos`, RPC `catalogo_valor_de_stock`; el cliente lee `movimientos_stock` |
| Cargar un pedido | `/pedidos/nuevo` (`form.tsx`) | RPC `create_manual_order` → `orders`; búsquedas en `/api/pedidos/buscar-*` |

## Sub-apps (`lib/os/subapps.ts`)

tareas · stock · compras · convenios · finanzas · comunicacion · clientes · ofertas · personas · compliance ·
centro-datos · inteligencia · configuracion · direccion · decisiones · pedidos. El shell (`components/os/os-shell.tsx`)
filtra el dock por los permisos del usuario.

## Cómo entran los datos

- **SIFACO:** se suben archivos (maestro, ventas por sucursal, ofertas) por el Centro de Datos. Quedan en
  `sifaco_importaciones` y se aplican a `productos_catalogo`, `producto_stock_sifaco` y `producto_ventas_mensuales`.
  El último maestro aplicado es del 21/10/2026.
- **Canales:** el importador universal (`archivo_importaciones`) para catálogos y liquidaciones de plataformas.
- **WooCommerce:** webhook (`/api/woo-webhook`) y sincronización (`/api/sync`).
- **Lo que no entra hoy:** ventas del día (las 7.620 de `ventas_diarias` son de demostración), cierres de caja
  reales (los 48 arqueos son de demostración; hay 3 turnos de caja abiertos y nunca cerrados), registro de
  entrada del personal, gastos fijos, clientes reales.

## Lo que corre solo

- **Crons de Vercel** (`vercel.json`): 20, todos diarios. Varios están «frenados» a propósito porque sus fuentes
  son datos de demostración (`crons_calculo`).
- **pg_cron en la base** (desde v1.5-cerebro): `cerebro-estado` cada minuto (entre 1,7 y 22 s por corrida) y
  `cerebro-limpiar-historial` diario.
- **Snapshots:** `agentes_resumen_snapshot` (diario, ~20-30 s) y `cerebro_snapshot` (cada minuto).

## Las reglas que ya están en código

- **Siete auditores** corren antes de `next build`: cortes (paginación), RLS (tablas ciegas), lente, permisos
  de NORA, RLS por rol, coherencia (pantalla contra base) y límite (constitución, triggers no llamables por RPC,
  funciones de servicio no ejecutables por `authenticated` salvo excepción declarada que use `auth.uid()` y
  consulte `users_admin`).
- **La constitución** (`constitucion_acciones`): acciones que ningún agente ni la voz pueden hacer (cambiar precios,
  pagar sin firma, tocar recetas o pacientes, ascenderse, firmar por voz, publicar, tocar personal). Los intentos
  quedan en `intentos_bloqueados`.

## ⚠ Los tests escriben en producción

`.env.local` apunta a producción, y:

- **El build escribe:** `auditar:rls-roles` crea y borra tres usuarios de prueba en `auth.users` y `users_admin`;
  `verificar:coherencia` recalcula `agentes_resumen`.
- **Casi todos los `probar:*` insertan y borran datos de prueba** (canales 53 escrituras, convenios 37, día del
  encargado 16, importador 13, descripciones 13, detección 10, encargado 9, mostrador 7, apagados 5, dirección 2).
- Solo son de lectura: `tsc`, `next build` sin auditores, `auditar:cortes`, `auditar:rls`, `auditar:lente`,
  `probar:permisos`, `verificar:limite`, `probar:cerebro`.

El guardrail (`.claude/hooks/pre-tool-use.sh`) bloquea las invocaciones que escriben. Con staging, la línea base
completa se podría volver a correr ahí.

## Línea base medida el 2026-11-04 (solo lectura)

Ver el PR de esta etapa: cada comando con su salida.

## Lo que la regla 4 va a necesitar

No hay banderas. Para que todo lo nuevo esté apagado por defecto sin tocar la base de producción, la opción más
segura es una **variable de entorno por bandera, leída en el servidor**: ausente = apagada. Prenderla es una acción
de Facundo en Vercel. Una tabla de banderas sería más cómoda pero es una migración, y sin staging no se puede probar
su `down`. Queda anotada como alternativa.

## Lo que la sesión anterior dejó en producción

La v1.5-cerebro (antes de las reglas actuales) aplicó las migraciones 0288 a 0293, el cron de pg_cron por minuto y
el deploy. Está documentado en `PENDIENTE.md` §3 con las opciones.
