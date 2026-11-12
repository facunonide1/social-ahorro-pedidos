-- 0294 · Drive del dueño: varias carpetas, y nada del maestro se aplica solo.
--
-- Los tokens no los lee el navegador. Las dos tablas de la conexión y la cola
-- de archivos tienen RLS sin políticas y REVOKE a anon y authenticated.
--
-- 0250: en este proyecto `authenticated` recibe privilegios por default privileges.
-- Revocar solo de PUBLIC no alcanza. Se revoca de anon y de authenticated.
-- service_role queda con GRANT porque es el único que escribe.
--
-- compras_lineas es distinto: la lee un admin (super_admin, gerente, comprador).
-- Tiene política de lectura. La escritura sigue siendo service_role.
--
-- No se aplica desde el agente. Va en el paquete de firma.

create table if not exists public.integraciones_google_drive (
  id uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references public.users_admin(id) on delete cascade,
  email_cuenta text,
  refresh_token_cifrado text not null,
  iv text not null,
  tag text not null,
  estado text not null default 'conectada' check (estado in ('conectada', 'vencida', 'error')),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  listado_cursor jsonb,
  listado_completo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_admin_id)
);

create table if not exists public.integraciones_google_drive_carpetas (
  id uuid primary key default gen_random_uuid(),
  integracion_id uuid not null references public.integraciones_google_drive(id) on delete cascade,
  folder_id text not null,
  folder_nombre text not null,
  incluir_subcarpetas boolean not null default true,
  created_at timestamptz not null default now(),
  unique (integracion_id, folder_id)
);

create table if not exists public.drive_archivos_ingestados (
  id uuid primary key default gen_random_uuid(),
  file_id text not null unique,
  nombre text not null,
  mime text,
  modified_time timestamptz,
  md5 text,
  clasificacion text not null default 'sin_clasificar'
    check (clasificacion in ('maestro', 'precios', 'factura', 'planilla', 'sin_clasificar', 'ignorar')),
  clasificacion_forzada text
    check (clasificacion_forzada is null or clasificacion_forzada in ('maestro', 'precios', 'factura', 'planilla', 'sin_clasificar', 'ignorar')),
  destino_ref text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'ok', 'error', 'sin_clasificar', 'previa')),
  error text,
  intentos integer not null default 0,
  proximo_intento_at timestamptz,
  carpeta_raiz_id text,
  carpeta_raiz_nombre text,
  ruta_relativa text,
  web_view_link text,
  bytes bigint,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  match_pct numeric,
  lista_id uuid,
  lista_anterior_id uuid,
  sucursal_codigo text,
  contenido_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drive_archivos_estado_idx
  on public.drive_archivos_ingestados (estado, created_at);

create table if not exists public.drive_mapeo_productos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete cascade,
  nombre_norm text not null,
  producto_id uuid not null references public.productos_catalogo(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists drive_mapeo_productos_key
  on public.drive_mapeo_productos (coalesce(proveedor_id, '00000000-0000-0000-0000-000000000000'::uuid), nombre_norm);

create table if not exists public.compras_lineas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_nombre text,
  sucursal_nombre text,
  sucursal_codigo text,
  comprobante text,
  fecha date,
  producto_nombre text not null,
  droga text,
  concentracion text,
  unidades text,
  codigo_barras text,
  cantidad numeric,
  precio_unitario numeric,
  descuento_pct numeric,
  importe numeric,
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  match_score numeric,
  match_via text,
  origen text not null,
  origen_ref text,
  hash_linea text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists compras_lineas_prov_idx on public.compras_lineas (proveedor_nombre, fecha desc);

alter table public.listas_precios_items
  add column if not exists match_score numeric,
  add column if not exists match_via text;

alter table public.integraciones_google_drive enable row level security;
alter table public.integraciones_google_drive_carpetas enable row level security;
alter table public.drive_archivos_ingestados enable row level security;
alter table public.drive_mapeo_productos enable row level security;
alter table public.compras_lineas enable row level security;

revoke all on table public.integraciones_google_drive from public, anon, authenticated;
revoke all on table public.integraciones_google_drive_carpetas from public, anon, authenticated;
revoke all on table public.drive_archivos_ingestados from public, anon, authenticated;
revoke all on table public.drive_mapeo_productos from public, anon, authenticated;
revoke all on table public.compras_lineas from public, anon, authenticated;

grant all on table public.integraciones_google_drive to service_role;
grant all on table public.integraciones_google_drive_carpetas to service_role;
grant all on table public.drive_archivos_ingestados to service_role;
grant all on table public.drive_mapeo_productos to service_role;
grant all on table public.compras_lineas to service_role;
grant select on table public.compras_lineas to authenticated;

drop policy if exists compras_lineas_leer on public.compras_lineas;
create policy compras_lineas_leer on public.compras_lineas
  for select to authenticated
  using (exists (
    select 1 from public.users_admin u
    where u.id = auth.uid() and u.activo and u.rol in ('super_admin', 'gerente', 'comprador')
  ));

comment on table public.integraciones_google_drive is
  'OAuth de solo lectura de Drive. El refresh token va cifrado. Sin políticas: solo service_role.';
comment on table public.compras_lineas is
  'Líneas históricas de compra que llegan de la planilla o de una factura con texto. No es una orden: es lo que ya se compró.';
