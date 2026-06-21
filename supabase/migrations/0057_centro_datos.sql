-- ============================================================================
-- 0057 · CENTRO DE DATOS — puente bidireccional con SIFACO
-- ----------------------------------------------------------------------------
-- NORA HQ convive con SIFACO (facturación/stock legacy, NO se reemplaza). El
-- intercambio es por archivos: SIFACO exporta (productos, stock, ventas,
-- clientes) → NORA importa; NORA genera (ofertas/precios, dif. de stock) en el
-- formato exacto que SIFACO espera. Uso frecuente (cada 2hs/diario) → robusto:
-- perfiles de mapeo reutilizables, validación/preview, historial y rollback.
-- Antesala de la integración directa (F20): perfiles/mapeos reutilizables.
--
-- Llave maestra de match en todo el sistema: CODIGO (= SKU interno).
-- Formato real SIFACO (productos): .xls binario, 26 columnas, ~5.400 prod.
--   DESCRIP, PRECIO, STOCK, CODIGO(=SKU), BARRAS(EAN), RUBRO, ESTADO, TIPO,
--   MES_ACT + ANT_1..ANT_6 (ventas mensuales), NOM_PROMO, DEF_PROMO,
--   NOM_LAB, NUM_LAB, DROGA, DESCU, RECAR.
-- ============================================================================

-- ===== Enums =====
do $$ begin create type public.direccion_datos as enum ('import','export'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_perfil_datos as enum ('productos','stock','ventas','clientes','ofertas','dif_stock','custom'); exception when duplicate_object then null; end $$;
do $$ begin create type public.formato_datos as enum ('xls','xlsx','csv','txt'); exception when duplicate_object then null; end $$;
do $$ begin create type public.frecuencia_datos as enum ('manual','cada_2hs','diaria','semanal'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_import_job as enum ('preview','aplicado','revertido','error'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_sin_match as enum ('pendiente','creado','vinculado','ignorado'); exception when duplicate_object then null; end $$;

-- ===== Catálogo: ventas mensuales (MES_ACT + ANT_1..6) para análisis =====
-- Acumulado por producto que viene en el archivo de productos SIFACO. La fuente
-- FINA por sucursal/día es ventas_diarias (abajo).
alter table public.productos_catalogo
  add column if not exists rubro text,
  add column if not exists ventas_mensuales jsonb;  -- {mes_act, ant_1..ant_6, actualizado}

-- ===== Perfiles de mapeo reutilizables =====
-- Se configura UNA vez por tipo de archivo; el mapeo queda guardado.
create table if not exists public.perfiles_datos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  descripcion     text,
  direccion       public.direccion_datos not null,
  tipo            public.tipo_perfil_datos not null,
  formato         public.formato_datos not null default 'xlsx',
  -- import: { "CODIGO": "sku", "STOCK": "stock", "PRECIO": "precio", ... }
  -- export: { "sku": "CODIGO", "precio": "PRECIO", ... }  (campo sistema → columna salida)
  mapeo_columnas  jsonb not null default '{}'::jsonb,
  -- { separador, decimales, formato_fecha, con_encabezado, encoding, hoja }
  opciones        jsonb not null default '{}'::jsonb,
  frecuencia      public.frecuencia_datos not null default 'manual',
  es_sistema      boolean not null default false,
  es_demo         boolean not null default false,
  activo          boolean not null default true,
  ultima_carga    timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists perfiles_datos_dir_idx on public.perfiles_datos(direccion, tipo);

-- ===== Acciones de exportación configurables (botones + constructor) =====
create table if not exists public.acciones_export (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  descripcion        text,
  -- { entidad: 'productos'|'ofertas'|'stock'|'dif_stock'|'ventas',
  --   filtros: {rubro, sucursal_id, estado, sin_venta_dias, ...},
  --   columnas: [{ campo, header, orden }] }
  query_definicion   jsonb not null default '{}'::jsonb,
  perfil_formato_id  uuid references public.perfiles_datos(id) on delete set null,
  icono              text,
  es_sistema         boolean not null default false,
  es_demo            boolean not null default false,
  activa             boolean not null default true,
  frecuencia         public.frecuencia_datos not null default 'manual',
  ultima_ejecucion   timestamptz,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ===== Historial de importaciones =====
create table if not exists public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid references public.perfiles_datos(id) on delete set null,
  sucursal_id     uuid references public.sucursales(id) on delete set null,  -- ventas diarias
  archivo_nombre  text,
  archivo_hash    text,                 -- idempotencia (mismo archivo = mismo job)
  filas_total     integer not null default 0,
  filas_ok        integer not null default 0,
  filas_fallidas  integer not null default 0,
  filas_sin_match integer not null default 0,
  -- [{ tipo, severidad, mensaje, detalle }]  (semáforo de validación)
  anomalias       jsonb not null default '[]'::jsonb,
  -- resumen NORA del archivo (mejora 8) + detección de cambios (mejora 3)
  resumen         jsonb not null default '{}'::jsonb,
  snapshot_id     uuid,                 -- → snapshots_import (rollback)
  estado          public.estado_import_job not null default 'preview',
  es_demo         boolean not null default false,
  por_usuario     uuid references auth.users(id),
  por_usuario_nombre text,
  created_at      timestamptz not null default now(),
  aplicado_at     timestamptz,
  revertido_at    timestamptz
);
create index if not exists import_jobs_perfil_idx on public.import_jobs(perfil_id, created_at desc);
create index if not exists import_jobs_hash_idx on public.import_jobs(archivo_hash) where estado = 'aplicado';

-- ===== Historial de exportaciones =====
create table if not exists public.export_jobs (
  id               uuid primary key default gen_random_uuid(),
  perfil_id        uuid references public.perfiles_datos(id) on delete set null,
  accion_id        uuid references public.acciones_export(id) on delete set null,
  nombre           text,
  filas            integer not null default 0,
  archivo_generado text,
  formato          public.formato_datos,
  es_demo          boolean not null default false,
  por_usuario      uuid references auth.users(id),
  por_usuario_nombre text,
  created_at       timestamptz not null default now()
);
create index if not exists export_jobs_created_idx on public.export_jobs(created_at desc);

-- ===== Snapshots para rollback (mejora 6) =====
-- Guarda el estado previo de las filas afectadas ANTES de aplicar un import.
create table if not exists public.snapshots_import (
  id            uuid primary key default gen_random_uuid(),
  import_job_id uuid references public.import_jobs(id) on delete cascade,
  tabla         text not null,         -- 'stock_items' | 'productos_catalogo' | 'ventas_diarias'
  -- [{ pk: {...}, datos_previos: {...} | null(no existía) }]
  datos         jsonb not null default '[]'::jsonb,
  filas         integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists snapshots_import_job_idx on public.snapshots_import(import_job_id);

-- ===== Ventas diarias por sucursal (fuente FINA) =====
-- Además del MES_ACT acumulado del archivo de productos, se carga un archivo de
-- ventas DIARIO POR SUCURSAL (formato SIFACO, por CODIGO). Alimenta el análisis
-- de qué comprar y los reportes con granularidad real. Distinto por sucursal.
create table if not exists public.ventas_diarias (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  producto_id   uuid references public.productos_catalogo(id) on delete set null,  -- match por CODIGO
  sku           text not null,
  descripcion   text,
  cantidad      numeric(14,2) not null default 0,
  monto         numeric(14,2) not null default 0,
  importado_de  uuid references public.import_jobs(id) on delete set null,
  es_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (fecha, sucursal_id, sku)
);
create index if not exists ventas_diarias_suc_fecha_idx on public.ventas_diarias(sucursal_id, fecha desc);
create index if not exists ventas_diarias_prod_idx on public.ventas_diarias(producto_id, fecha desc);
create index if not exists ventas_diarias_sku_idx on public.ventas_diarias(sku);

-- ===== Cola de items sin matchear (mejora 7) =====
create table if not exists public.items_sin_match (
  id                 uuid primary key default gen_random_uuid(),
  import_job_id      uuid references public.import_jobs(id) on delete cascade,
  sku                text,
  codigo             text,            -- CODIGO SIFACO (alias de sku, por claridad)
  barras             text,
  descripcion_origen text,
  datos              jsonb not null default '{}'::jsonb,   -- fila completa
  estado             public.estado_sin_match not null default 'pendiente',
  resuelto_producto_id uuid references public.productos_catalogo(id) on delete set null,
  es_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  resuelto_at        timestamptz
);
create index if not exists items_sin_match_job_idx on public.items_sin_match(import_job_id);
create index if not exists items_sin_match_estado_idx on public.items_sin_match(estado) where estado = 'pendiente';

-- ===== updated_at triggers (reusa la fn global si existe) =====
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists perfiles_datos_updated on public.perfiles_datos;
    create trigger perfiles_datos_updated before update on public.perfiles_datos
      for each row execute function public.set_updated_at();
    drop trigger if exists acciones_export_updated on public.acciones_export;
    create trigger acciones_export_updated before update on public.acciones_export
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ===== RLS (lectura: admin activo · escritura: super_admin/gerente) =====
-- "quien carga queda registrado" → por_usuario default auth.uid() a nivel app.
do $$
declare t text;
begin
  foreach t in array array[
    'perfiles_datos','acciones_export','import_jobs','export_jobs',
    'snapshots_import','ventas_diarias','items_sin_match'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente''))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'')))', t, t);
  end loop;
end $$;
