-- 0042 · WMS schema (OPS · T2)
--
-- Modelo: movimientos_stock = FUENTE DE VERDAD (cantidad FIRMADA = delta).
-- Un trigger aplica cada movimiento a stock_items atómicamente. Así "ventas por
-- diferencia" (T3), conteos, recepciones, transferencias y bajas son todos
-- movimientos con su delta, y stock_items siempre deriva de ellos.

-- ===== [ENUM VALUES] (se aplican en tx separada por el runner) =====
alter type public.tipo_movimiento_stock add value if not exists 'venta';
alter type public.tipo_movimiento_stock add value if not exists 'ajuste_pos';
alter type public.tipo_movimiento_stock add value if not exists 'ajuste_neg';
alter type public.tipo_movimiento_stock add value if not exists 'recepcion';
alter type public.tipo_movimiento_stock add value if not exists 'transferencia_in';
alter type public.tipo_movimiento_stock add value if not exists 'transferencia_out';
alter type public.tipo_movimiento_stock add value if not exists 'baja_vencimiento';
alter type public.tipo_movimiento_stock add value if not exists 'conteo';
alter type public.tipo_movimiento_stock add value if not exists 'import_diferencia';

-- ===== ENUMS NUEVOS =====
do $$ begin create type public.estado_lote as enum ('activo','agotado','vencido','devuelto','bloqueado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.severidad_alerta as enum ('info','warning','critica'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_alerta as enum ('activa','atendida','descartada'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_alerta_stock as enum ('stock_critico','quiebre_proyectado','sobrestock','sin_rotacion','stock_fantasma','vencimiento_90','vencimiento_60','vencimiento_30','vencimiento_15'); exception when duplicate_object then null; end $$;
do $$ begin create type public.interpretacion_import as enum ('venta','ingreso','sin_cambio','discrepancia','no_encontrado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_import as enum ('procesando','ok','parcial','error'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_config_import as enum ('stock','vencimientos'); exception when duplicate_object then null; end $$;

-- ===== stock_items (reemplaza stock_sucursal) =====
create table if not exists public.stock_items (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos_catalogo(id) on delete cascade,
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  cantidad      numeric(14,2) not null default 0,
  stock_minimo  integer not null default 0,
  stock_maximo  integer,
  es_demo       boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (producto_id, sucursal_id)
);
create index if not exists stock_items_suc_idx on public.stock_items(sucursal_id);
create index if not exists stock_items_critico_idx on public.stock_items(sucursal_id) where cantidad <= stock_minimo;

-- ===== movimientos_stock: + costo + es_demo =====
alter table public.movimientos_stock
  add column if not exists costo_unitario numeric(12,2),
  add column if not exists es_demo boolean not null default false;

-- Trigger: cada movimiento aplica su delta (cantidad firmada) a stock_items.
create or replace function public.tg_aplicar_movimiento_stock()
returns trigger language plpgsql as $$
begin
  insert into public.stock_items (producto_id, sucursal_id, cantidad, updated_at)
  values (NEW.producto_id, NEW.sucursal_id, NEW.cantidad, now())
  on conflict (producto_id, sucursal_id)
  do update set cantidad = public.stock_items.cantidad + NEW.cantidad, updated_at = now();
  return NEW;
end $$;

drop trigger if exists movimientos_stock_aplicar on public.movimientos_stock;
create trigger movimientos_stock_aplicar
  after insert on public.movimientos_stock
  for each row execute function public.tg_aplicar_movimiento_stock();

-- ===== lotes_productos: + costo, estado, es_demo =====
alter table public.lotes_productos
  add column if not exists costo_unitario numeric(12,2),
  add column if not exists estado public.estado_lote not null default 'activo',
  add column if not exists es_demo boolean not null default false;
create index if not exists lotes_venc_idx on public.lotes_productos(fecha_vencimiento) where cantidad_actual > 0;

-- ===== producto_rotacion =====
create table if not exists public.producto_rotacion (
  id                      uuid primary key default gen_random_uuid(),
  producto_id             uuid not null references public.productos_catalogo(id) on delete cascade,
  sucursal_id             uuid not null references public.sucursales(id) on delete cascade,
  venta_diaria_prom_7d    numeric(12,2) not null default 0,
  venta_diaria_prom_30d   numeric(12,2) not null default 0,
  dias_stock_restante     numeric(10,1),
  fecha_quiebre_estimada  date,
  clasificacion_abc       char(1),
  ultima_venta            date,
  es_demo                 boolean not null default false,
  updated_at              timestamptz not null default now(),
  unique (producto_id, sucursal_id)
);

-- ===== imports =====
create table if not exists public.stock_imports (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null references public.sucursales(id) on delete cascade,
  fecha             date not null,
  archivo_nombre    text,
  hash_archivo      text unique,
  filas_total       int not null default 0,
  filas_ok          int not null default 0,
  filas_error       int not null default 0,
  ventas_detectadas int not null default 0,
  discrepancias     int not null default 0,
  estado            public.estado_import not null default 'procesando',
  mapeo_usado       jsonb,
  es_demo           boolean not null default false,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create table if not exists public.stock_imports_items (
  id                          uuid primary key default gen_random_uuid(),
  import_id                   uuid not null references public.stock_imports(id) on delete cascade,
  fila                        int,
  sku                         text,
  ean                         text,
  nombre_origen               text,
  producto_id                 uuid references public.productos_catalogo(id) on delete set null,
  stock_anterior              numeric(14,2),
  stock_nuevo                 numeric(14,2),
  diferencia                  numeric(14,2),
  interpretado_como           public.interpretacion_import,
  cantidad_vendida_declarada  numeric(14,2)
);
create index if not exists stock_imports_items_import_idx on public.stock_imports_items(import_id);

-- ===== config de import (mapeo reusable) =====
create table if not exists public.config_import_stock (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  tipo            public.tipo_config_import not null default 'stock',
  mapeo_columnas  jsonb not null default '{}'::jsonb,
  separador       text default ',',
  encoding        text default 'utf-8',
  hoja            text,
  tiene_header    boolean not null default true,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ===== matcheos aprendidos (texto origen → producto) =====
create table if not exists public.matcheos_aprendidos (
  id           uuid primary key default gen_random_uuid(),
  texto_origen text not null,
  producto_id  uuid not null references public.productos_catalogo(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (texto_origen)
);

-- ===== alertas de stock =====
create table if not exists public.alertas_stock (
  id            uuid primary key default gen_random_uuid(),
  tipo          public.tipo_alerta_stock not null,
  producto_id   uuid references public.productos_catalogo(id) on delete cascade,
  sucursal_id   uuid references public.sucursales(id) on delete cascade,
  lote_id       uuid references public.lotes_productos(id) on delete cascade,
  severidad     public.severidad_alerta not null default 'warning',
  datos         jsonb not null default '{}'::jsonb,
  estado        public.estado_alerta not null default 'activa',
  atendida_por  uuid references auth.users(id) on delete set null,
  es_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists alertas_stock_uniq_activa
  on public.alertas_stock(tipo, producto_id, sucursal_id, coalesce(lote_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where estado = 'activa';

-- ===== RLS (lectura: admin activo · escritura: super/gerente/comprador) =====
do $$
declare t text;
begin
  foreach t in array array[
    'stock_items','producto_rotacion','stock_imports','stock_imports_items',
    'config_import_stock','matcheos_aprendidos','alertas_stock'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''comprador''))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''comprador'')))', t, t);
  end loop;
end $$;
