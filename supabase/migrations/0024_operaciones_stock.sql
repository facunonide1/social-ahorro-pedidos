-- ============================================================================
-- 0024_operaciones_stock.sql · F3.1 + F3.2 Stock, lotes, vencimientos
-- ============================================================================

do $$ begin
  create type public.tipo_movimiento_stock as enum (
    'entrada','salida','ajuste','transferencia','vencido','devolucion','inventario_alta','inventario_baja'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.referencia_movimiento_stock as enum (
    'pedido','factura','recepcion','transferencia','inventario','devolucion','manual'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.productos (
  id                       uuid primary key default gen_random_uuid(),
  codigo_interno           text unique,
  codigo_barras            text,
  nombre                   text not null,
  descripcion              text,
  categoria                text,
  laboratorio              text,
  presentacion             text,
  precio_costo             numeric(12,2),
  precio_venta_sugerido    numeric(12,2),
  iva_alicuota             numeric(5,2) not null default 21,
  activo                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists productos_codigo_barras_idx on public.productos(codigo_barras) where codigo_barras is not null;
create index if not exists productos_nombre_trgm_idx on public.productos using gin (nombre gin_trgm_ops);

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
  before update on public.productos
  for each row execute function public.tg_set_updated_at();

create table if not exists public.stock_sucursal (
  id                       uuid primary key default gen_random_uuid(),
  producto_id              uuid not null references public.productos(id) on delete cascade,
  sucursal_id              uuid not null references public.sucursales(id) on delete cascade,
  cantidad_actual          numeric(14,2) not null default 0,
  stock_minimo             numeric(14,2) not null default 0,
  stock_maximo             numeric(14,2),
  ubicacion                text,
  ultima_actualizacion     timestamptz not null default now(),
  unique(producto_id, sucursal_id)
);

create index if not exists stock_sucursal_critico_idx
  on public.stock_sucursal(sucursal_id) where cantidad_actual <= stock_minimo;

create table if not exists public.movimientos_stock (
  id                       uuid primary key default gen_random_uuid(),
  producto_id              uuid not null references public.productos(id) on delete restrict,
  sucursal_id              uuid not null references public.sucursales(id) on delete restrict,
  tipo                     public.tipo_movimiento_stock not null,
  cantidad                 numeric(14,2) not null,
  motivo                   text,
  referencia_tipo          public.referencia_movimiento_stock,
  referencia_id            uuid,
  fecha                    timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now()
);

create index if not exists mov_stock_producto_idx on public.movimientos_stock(producto_id, fecha desc);
create index if not exists mov_stock_sucursal_idx on public.movimientos_stock(sucursal_id, fecha desc);

-- Lotes para tracking de vencimientos (F3.2) --------------------------------
create table if not exists public.lotes_productos (
  id                       uuid primary key default gen_random_uuid(),
  producto_id              uuid not null references public.productos(id) on delete cascade,
  sucursal_id              uuid not null references public.sucursales(id) on delete cascade,
  numero_lote              text,
  fecha_vencimiento        date not null,
  cantidad_actual          numeric(14,2) not null default 0,
  recepcion_id             uuid references public.recepciones_mercaderia(id) on delete set null,
  created_at               timestamptz not null default now()
);

create index if not exists lotes_vencimiento_idx
  on public.lotes_productos(fecha_vencimiento) where cantidad_actual > 0;

-- RLS -----------------------------------------------------------------------
alter table public.productos enable row level security;
alter table public.stock_sucursal enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.lotes_productos enable row level security;

-- Read amplio para todos los activos
do $$ begin
  perform 1;
exception when others then null; end $$;

drop policy if exists productos_read on public.productos;
create policy productos_read on public.productos
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists productos_write on public.productos;
create policy productos_write on public.productos
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','comprador','administrativo'))
  );

drop policy if exists stock_read on public.stock_sucursal;
create policy stock_read on public.stock_sucursal
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists stock_write on public.stock_sucursal;
create policy stock_write on public.stock_sucursal
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo','sucursal'))
  );

drop policy if exists mov_stock_read on public.movimientos_stock;
create policy mov_stock_read on public.movimientos_stock
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists mov_stock_write on public.movimientos_stock;
create policy mov_stock_write on public.movimientos_stock
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo','sucursal'))
  );

drop policy if exists lotes_read on public.lotes_productos;
create policy lotes_read on public.lotes_productos
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists lotes_write on public.lotes_productos;
create policy lotes_write on public.lotes_productos
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo','sucursal'))
  );
