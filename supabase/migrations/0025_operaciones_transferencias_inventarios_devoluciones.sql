-- ============================================================================
-- 0025_operaciones_transferencias_inventarios_devoluciones.sql
-- F3.3 + F3.4 + F3.5
-- ============================================================================

-- F3.3 Transferencias entre sucursales --------------------------------------
do $$ begin
  create type public.estado_transferencia as enum (
    'solicitada','aprobada','en_transito','recibida','cancelada'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.transferencias_sucursal (
  id                       uuid primary key default gen_random_uuid(),
  sucursal_origen_id       uuid not null references public.sucursales(id) on delete restrict,
  sucursal_destino_id      uuid not null references public.sucursales(id) on delete restrict,
  estado                   public.estado_transferencia not null default 'solicitada',
  fecha_solicitud          timestamptz not null default now(),
  fecha_envio              timestamptz,
  fecha_recepcion          timestamptz,
  solicitado_por           uuid references auth.users(id) on delete set null,
  aprobado_por             uuid references auth.users(id) on delete set null,
  observaciones            text,
  created_at               timestamptz not null default now(),
  constraint transferencia_origen_ne_destino check (sucursal_origen_id <> sucursal_destino_id)
);

create table if not exists public.transferencia_items (
  id                       uuid primary key default gen_random_uuid(),
  transferencia_id         uuid not null references public.transferencias_sucursal(id) on delete cascade,
  producto_id              uuid not null references public.productos(id) on delete restrict,
  cantidad_solicitada      numeric(14,2) not null,
  cantidad_enviada         numeric(14,2),
  cantidad_recibida        numeric(14,2),
  observaciones            text
);

-- F3.4 Inventarios físicos --------------------------------------------------
do $$ begin
  create type public.estado_inventario as enum ('en_curso','cerrado');
exception when duplicate_object then null; end $$;

create table if not exists public.inventarios_fisicos (
  id                       uuid primary key default gen_random_uuid(),
  sucursal_id              uuid not null references public.sucursales(id) on delete restrict,
  fecha_inventario         date not null default current_date,
  estado                   public.estado_inventario not null default 'en_curso',
  responsable_id           uuid references auth.users(id) on delete set null,
  total_items_contados     integer not null default 0,
  diferencias_detectadas   integer not null default 0,
  observaciones            text,
  created_at               timestamptz not null default now(),
  closed_at                timestamptz
);

create table if not exists public.inventario_items (
  id                       uuid primary key default gen_random_uuid(),
  inventario_id            uuid not null references public.inventarios_fisicos(id) on delete cascade,
  producto_id              uuid not null references public.productos(id) on delete restrict,
  stock_sistema            numeric(14,2) not null,
  stock_contado            numeric(14,2),
  diferencia               numeric(14,2) generated always as (stock_contado - stock_sistema) stored,
  motivo_diferencia        text
);

-- F3.5 Devoluciones a proveedor --------------------------------------------
do $$ begin
  create type public.estado_devolucion_proveedor as enum (
    'registrada','enviada','nota_credito_recibida','cerrada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.motivo_devolucion as enum (
    'vencimiento','dano','error_pedido','otro'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.devoluciones_proveedor (
  id                       uuid primary key default gen_random_uuid(),
  proveedor_id             uuid not null references public.proveedores(id) on delete restrict,
  sucursal_id              uuid not null references public.sucursales(id) on delete restrict,
  fecha                    date not null default current_date,
  motivo                   public.motivo_devolucion not null,
  estado                   public.estado_devolucion_proveedor not null default 'registrada',
  numero_remito_devolucion text,
  observaciones            text,
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

create table if not exists public.devolucion_items (
  id                       uuid primary key default gen_random_uuid(),
  devolucion_id            uuid not null references public.devoluciones_proveedor(id) on delete cascade,
  producto_id              uuid references public.productos(id) on delete set null,
  cantidad                 numeric(14,2) not null,
  lote                     text,
  fecha_vencimiento_producto date,
  motivo_especifico        text,
  observaciones            text,
  foto_url                 text
);

-- RLS amplio para todos los staff activos -----------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'transferencias_sucursal','transferencia_items',
    'inventarios_fisicos','inventario_items',
    'devoluciones_proveedor','devolucion_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_rw on public.%I', t, t);
    execute format(
      'create policy %I_rw on public.%I for all using (exists (select 1 from public.users_admin where id = auth.uid() and activo and rol in (''super_admin'',''gerente'',''administrativo'',''sucursal'',''comprador'')))',
      t, t
    );
    execute format('drop policy if exists %I_ro on public.%I', t, t);
    execute format(
      'create policy %I_ro on public.%I for select using (exists (select 1 from public.users_admin where id = auth.uid() and activo))',
      t, t
    );
  end loop;
end $$;
