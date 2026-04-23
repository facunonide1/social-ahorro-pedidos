# Estado actual del repo `social-ahorro-pedidos`

_Snapshot antes de transformar en Admin Hub._

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | `14.2.35` |
| Runtime | React | `18` |
| TypeScript | — | `5` |
| Auth + DB | Supabase (compartido con `cuponera-social-ahorro`) | `@supabase/ssr ^0.10.2`, `@supabase/supabase-js ^2.103.3` |
| Styling | Inline styles (JSX `style={...}`) + Tailwind disponible pero poco usado | `tailwindcss ^3.4.1` |
| Integración externa | WooCommerce REST v3, Resend (email), GitHub Actions (cron de sync) | — |
| Deploy | Vercel | — |

`next.config.mjs` tiene `typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true` — conviene dejarlo así al sumar nuevas áreas para no bloquear despliegues por tipos en transición.

## Estructura de carpetas

```
app/
├── login/                    Form de login + MFA
├── logout/                   Route handler (POST/GET con anti-prefetch)
├── dashboard/                Panel operativo de pedidos (admin/operador)
│   ├── sidebar.tsx           Sidebar oscuro desktop
│   ├── mobile-nav.tsx        Drawer mobile (hamburger)
│   ├── controls.tsx          Filtros tipo/estado/zona/rep/fecha + tabs
│   ├── live-clock.tsx        Reloj en vivo
│   ├── sync-button.tsx       Botón "Sincronizar Woo"
│   ├── new-order-notifier.tsx  Realtime Supabase + ding + badge
│   ├── title-badge.tsx       document.title con (N) pendientes
│   └── global-search.tsx     Modal Cmd+K
├── pedidos/
│   ├── nuevo/                Carga manual con autocomplete + catálogo Woo
│   └── [id]/                 Detalle + remito + acciones + items-editor + incidents + whatsapp-messages + delivery-proof
├── clientes/                 CRM de customers
│   └── [id]/                 Ficha + editor + historial
├── repartidor/               Vista mobile-first, ruta agrupada por zona
├── admin/
│   └── configuracion/        Zonas, usuarios, horarios, stats, backup
├── cuenta/                   MFA / 2FA
└── api/                      Route handlers (nodejs runtime, dynamic force-dynamic)
    ├── admin/backup/         Export JSON
    ├── customers/search/     Autocomplete cliente (local + Woo)
    ├── orders/
    │   ├── [id]/status/      Cambiar estado + sync Woo + email + whatsapp msg
    │   ├── [id]/sync/        Reintento manual sync a Woo
    │   ├── [id]/delivery-proof/  Upload foto
    │   ├── [id]/regenerate-messages/  Re-emitir WhatsApp desde historial
    │   ├── export/           CSV
    │   └── since/            Polling fallback (cuando no hay realtime)
    ├── products/search/      Catálogo Woo
    ├── search/               Búsqueda global (orders + customers)
    ├── sync/                 Sync Woo manual + cron GitHub Actions
    ├── users/                CRUD usuarios (service role)
    ├── whatsapp-messages/[id]/  PATCH estado mensaje
    └── woo-webhook/          Receiver de pedido creado (HMAC firmado)

lib/
├── supabase/
│   ├── client.ts             createBrowserClient
│   └── server.ts             createServerClient + createAdminClient (service role)
├── woo/
│   ├── client.ts             REST v3 (orders, customers, products, updateOrderStatus)
│   └── sync.ts               Bajada y mapping
├── whatsapp/messages.ts      Templates por estado + normalización AR
├── email/resend.ts           Templates por estado + fetch a Resend API
├── orders/
│   ├── format.ts             formatOrderNumber (uses codigo)
│   └── timing.ts             relativeFrom, severidad, minutesBetween
├── address.ts                formatAddress + googleMapsLink
└── types.ts                  Todos los tipos compartidos

supabase/migrations/          0002..0015 aplicadas a mano en prod
```

## Rutas existentes

### Páginas (server components)

- `/` (redirect según rol)
- `/login` (+ MFA challenge)
- `/dashboard` — admin/operador
- `/pedidos/nuevo` — admin/operador
- `/pedidos/[id]` — todos los roles
- `/pedidos/[id]/remito` — todos los roles
- `/clientes` — admin/operador
- `/clientes/[id]` — admin/operador
- `/repartidor` — solo rol repartidor
- `/admin/configuracion` — solo admin
- `/cuenta` — todos

### API routes

Todos son `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`. Usan cookies Supabase para auth. Excepto `/api/sync` y `/api/woo-webhook` que son públicos a nivel middleware (tienen su propio esquema de auth).

## Autenticación y roles

**Supabase Auth** (email + password) + **MFA TOTP** opcional (enrollable desde `/cuenta`).

**Tabla de perfiles del dominio pedidos**: `public.users_pedidos` (FK a `auth.users(id)`).

**Enum de roles**: `pedidos_user_role` = `'admin' | 'operador' | 'repartidor'`.

**Helper SQL**: `public.current_pedidos_role()` retorna el rol del `auth.uid()` actual si está activo. `SECURITY DEFINER` para no caer en recursión RLS.

**RLS sobre tablas propias**: cada tabla (`orders`, `customers`, `zonas_reparto`, `whatsapp_messages`, `order_incidents`, etc.) tiene policies que se apoyan en `current_pedidos_role()`.

**Flujo redirects según rol** (middleware + Home `/`):
- Sin auth → `/login`
- Auth sin fila en `users_pedidos` o `active=false` → `/logout?reason=sin_permiso`
- Rol `repartidor` → `/repartidor`
- Admin/operador → `/dashboard`

**Trigger `lock_self_role`**: nadie puede cambiar su propio rol ni desactivarse a sí mismo.

**⚠ Alerta compartida**: en el proyecto Supabase hay también un trigger `on_auth_user_created` (función `public.handle_new_user`) que pertenece al repo cuponera y rompe al crear usuarios desde admin API sin DNI en metadata. Sigue pendiente resolverlo (opción: wrap con `exception when others then return new`). No tocar esa función desde este repo sin coordinar.

## Tablas existentes en Supabase (propias del repo de pedidos)

| Tabla | Propósito | Columnas clave |
|---|---|---|
| `users_pedidos` | Perfil + rol del operador del CRM | `id` (FK auth.users), `email`, `name`, `role` (enum), `active` |
| `zonas_reparto` | Zonas geográficas de delivery | `id`, `nombre`, `barrios text[]`, `color`, `activa` |
| `customers` | CRM cliente first-class | `id`, `name`, `phone`, `email`, `dni`, `address jsonb`, `tags text[]`, `notes` |
| `orders` | Pedido (Woo + manual) | `id`, `codigo` (`SA-YYYY-XXXX` por trigger), `woo_order_id`, `manual_order_number`, `origin`, `tipo_envio`, `status`, `fuera_de_horario`, `customer_id`, `customer_*` (snapshot), `shipping/billing_address jsonb`, `items jsonb`, `total`, `zona_id`, `assigned_to`, `confirmed_at/ready_at/delivered_at`, `delivery_proof_url`, `woo_last_sync_*` |
| `order_status_history` | Historial de cambios de estado por pedido | `order_id`, `status`, `changed_by`, `note` |
| `whatsapp_messages` | Outbox de mensajes por cambio de estado | `order_id`, `status_trigger`, `phone`, `message`, `status` (enum pending/sent/skipped), `sent_at`, `sent_by` |
| `order_incidents` | Incidencias por pedido (cliente ausente, etc.) | `order_id`, `tipo` (enum), `descripcion`, `registrado_by` |
| `app_settings` | Singleton de config global | `id=1`, `hora_apertura`, `hora_cierre` |

**Tablas existentes del otro repo** (cuponera — NO tocar): `public.users` + trigger `on_auth_user_created` → `public.handle_new_user`.

**Almacenamiento Supabase Storage**: bucket `delivery-proofs` (público, read-only vía policies).

## Componentes UI disponibles

El repo **no tiene una librería de componentes compartida**; cada página arma su UI con inline styles siguiendo los tokens de color.

Tokens en uso:
- Fondo: `#faf8f5`, sidebar oscuro `#2a2a2a`
- Principal: `#FF6D6E` (salmón), acento `#726DFF` (violeta)
- Semánticos: `#1f8a4c` verde, `#c6831a` ámbar, `#a33` rojo, `#2855c7` azul
- Bordes/Divisores: `#ede9e4`, `#f0ede8`, `#f5f1ec`
- Radius: 10–18px; border `0.5px solid` para divisores finos
- Badges: pill `borderRadius: 999`, `padding: 2px 8px`, `fontSize: 10-11`, `fontWeight: 700`, `letterSpacing: 0.3px`, `textTransform: uppercase`

Patrones reutilizables que encontrás **copy-pasted** en múltiples archivos:
- Badge de estado/tipo
- Card blanca con borde `0.5px solid #ede9e4` y `borderRadius: 16`
- Header compacto `padding: 14px 20px, background: #fff, borderBottom`

Utilitarios CSS globales en `app/globals.css`:
- `.sa-sidebar-desktop`, `.sa-mobile-topbar`, `.sa-desktop-only`, `.sa-mobile-only` — visibilidad por viewport
- `.sa-form-grid`, `.sa-items-row`, `.sa-items-sku` — colapso de grids en mobile
- `.sa-list-table-wrap` — scroll horizontal en tablas anchas
- `.sa-drawer-overlay`, `.sa-drawer-panel` + keyframes — drawer mobile

## Convenciones detectadas

### SQL
- **snake_case** en tablas y columnas.
- Enums con nombre en singular (`order_status`, `tipo_envio`, `pedidos_user_role`, `incident_type`, `whatsapp_msg_status`, `order_origin`).
- **Triggers**: prefijo `tg_` para la función, trigger con nombre de tabla (`orders_set_updated_at`, `orders_log_status`).
- **Índices**: sufijo `_idx` (`orders_status_idx`).
- **Helper de permisos**: `public.current_pedidos_role()` — convención para el admin hub: `public.current_admin_role()`.
- **RLS**: `enable row level security` en toda tabla con datos de dominio; policies nombradas `<tabla>_<accion>` (`orders_read`, `zonas_reparto_admin_write`).
- **Foreign keys**: `ON DELETE CASCADE` cuando la fila hija no tiene sentido sin la padre (order_status_history ⇒ orders). `ON DELETE SET NULL` para referencias opcionales (zona, assigned_to).
- **Timestamps**: `created_at` y `updated_at` default `now()`; trigger `public.tg_set_updated_at()` — **ya existe, reusable**.
- **UUID**: `uuid primary key default gen_random_uuid()`.

### TypeScript / React
- **camelCase** en JS; los tipos matchean columnas SQL pero en JS (ej. `Order.customer_id: string | null`).
- Tipos compartidos en `lib/types.ts` (todo junto).
- **Server Components por default**; `'use client'` solo donde hay estado/eventos.
- **Server Actions**: **no se usan**. El flujo es: UI client llama endpoints `/api/*` con `fetch`, que hacen auth + SQL + return `NextResponse.json`.
- Cookies via `createServerClient` del helper `@/lib/supabase/server`.
- **Tablas con RLS**: se leen con el user client (respeta policies). Para escribir con bypass se usa `createAdminClient()` (service role) — esto es crítico para `auth.users` (createUser/deleteUser) y para workflows donde el usuario no debe ver sus propias operaciones (ej. backup, woo-webhook, order status insert de whatsapp_messages).
- **Endpoints**: `export const dynamic = 'force-dynamic'` + `export const runtime = 'nodejs'` en casi todos.

### Nombres de rutas
- URLs en **español**: `/pedidos`, `/clientes`, `/cuenta`, `/repartidor`, `/admin/configuracion`.
- API en **inglés**: `/api/orders`, `/api/customers`, `/api/users`, `/api/products`. (Mismo patrón que las tablas de dominio.)

### Migraciones
- Numeración correlativa `NNNN_descripcion.sql` (no timestamp unix).
- Uso generalizado de `create ... if not exists`, `drop policy if exists` antes de create, `do $$ ... end $$` para chequeos condicionales en enums, idempotentes.
