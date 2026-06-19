-- 0052 · Sector Compras (v0.10-compras). Órdenes multisucursal, avisos de
-- faltantes, comparador (listas de precios + histórico), score de proveedor.
-- (Aplicada vía MCP; ver docs/PLAN-MAESTRO.md.)

do $$ begin create type public.rubro_compra as enum ('farmacia','perfumeria','supermercado','servicios'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_orden_compra as enum ('borrador','enviada','confirmada','recibida_parcial','recibida','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type public.origen_orden_compra as enum ('sugerencia_nora','aviso_faltante','manual','oportunista','sifaco'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_aviso_faltante as enum ('nuevo','en_orden','resuelto','descartado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_score_evento as enum ('entrega_tarde','faltante','danado','frio_roto','ok'); exception when duplicate_object then null; end $$;

alter table public.proveedores
  add column if not exists rubros text[] not null default '{}',
  add column if not exists score_actual numeric(4,1),
  add column if not exists es_drogueria boolean not null default false;

create sequence if not exists public.ordenes_compra_seq;
create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  rubro public.rubro_compra not null default 'farmacia',
  sucursal_compradora_id uuid references public.sucursales(id) on delete set null,
  estado public.estado_orden_compra not null default 'borrador',
  origen public.origen_orden_compra not null default 'manual',
  total_estimado numeric(14,2) not null default 0,
  condicion_pago text, notas text,
  es_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists oc_proveedor_idx on public.ordenes_compra(proveedor_id);
create index if not exists oc_estado_idx on public.ordenes_compra(estado);

create or replace function public.tg_ordenes_compra_codigo()
returns trigger language plpgsql as $fn$
begin
  if NEW.codigo is null then
    NEW.codigo := 'OC-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.ordenes_compra_seq')::text, 4, '0');
  end if;
  return NEW;
end $fn$;
drop trigger if exists ordenes_compra_codigo on public.ordenes_compra;
create trigger ordenes_compra_codigo before insert on public.ordenes_compra
  for each row execute function public.tg_ordenes_compra_codigo();

create table if not exists public.orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_compra(id) on delete cascade,
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  descripcion text,
  cantidad_total numeric(14,2) not null default 0,
  costo_unitario numeric(14,2) not null default 0,
  distribucion jsonb not null default '{}'::jsonb,
  origen_aviso_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists oci_orden_idx on public.orden_compra_items(orden_id);

alter table public.recepciones_mercaderia
  add column if not exists orden_compra_id uuid references public.ordenes_compra(id) on delete set null;

create table if not exists public.avisos_faltante (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  texto_libre text, rubro public.rubro_compra,
  sucursal_id uuid references public.sucursales(id) on delete set null,
  reportado_por uuid references auth.users(id) on delete set null,
  foto_url text, cantidad_sugerida numeric(14,2),
  estado public.estado_aviso_faltante not null default 'nuevo',
  orden_id uuid references public.ordenes_compra(id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists af_estado_idx on public.avisos_faltante(estado);
create index if not exists af_producto_idx on public.avisos_faltante(producto_id);

create table if not exists public.listas_precios (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  rubro public.rubro_compra not null default 'farmacia',
  archivo_nombre text, hash text,
  fecha_carga timestamptz not null default now(),
  vigente boolean not null default true, mapeo_usado jsonb,
  es_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null
);
create table if not exists public.listas_precios_items (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas_precios(id) on delete cascade,
  sku text, codigo text, descripcion_origen text,
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  precio numeric(14,2) not null default 0, desc_volumen jsonb,
  fecha date not null default current_date,
  es_demo boolean not null default false
);
create index if not exists lpi_lista_idx on public.listas_precios_items(lista_id);
create index if not exists lpi_producto_idx on public.listas_precios_items(producto_id);

create table if not exists public.precios_historico (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos_catalogo(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete cascade,
  rubro public.rubro_compra, precio numeric(14,2) not null,
  fecha date not null default current_date,
  es_demo boolean not null default false
);
create index if not exists ph_prod_prov_idx on public.precios_historico(producto_id, proveedor_id);

create table if not exists public.proveedor_score_eventos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  tipo public.tipo_score_evento not null,
  recepcion_id uuid references public.recepciones_mercaderia(id) on delete set null,
  peso numeric(4,2) not null default 1, nota text,
  fecha timestamptz not null default now(),
  es_demo boolean not null default false
);
create index if not exists pse_prov_idx on public.proveedor_score_eventos(proveedor_id);

create table if not exists public.matcheos_aprendidos_compras (
  id uuid primary key default gen_random_uuid(),
  texto_origen text not null unique,
  producto_id uuid references public.productos_catalogo(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS: ver migración aplicada (read=admin activo; write=super/gerente/comprador;
-- avisos_faltante también escribe rol sucursal/administrativo).
