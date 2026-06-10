-- 0036 · Catálogo de productos / vademécum (F6.5.T6)
--
-- Catálogo propio de NORA HQ (independiente de SIFACO): enriquece info de
-- productos (foto, vademécum, comisión, sustitutos, droguerías) y permite
-- carga masiva por CSV. RLS: cualquier usuario admin activo lee/escribe.

do $$ begin
  create type public.producto_catalogo_categoria as enum (
    'medicamento','perfumeria','cuidado_personal','dermocosmetica',
    'maternidad','ortopedia','otros'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.productos_catalogo (
  id                     uuid primary key default gen_random_uuid(),
  sku                    text unique not null,
  codigo_barras          text,
  nombre                 text not null,
  descripcion            text,
  categoria              public.producto_catalogo_categoria not null default 'otros',
  subcategoria           text,
  laboratorio            text,
  presentacion           text,
  droga_principal        text,
  requiere_receta        boolean not null default false,
  es_psicotropico        boolean not null default false,
  es_refrigerado         boolean not null default false,
  foto_url               text,
  vademecum_data         jsonb not null default '{}'::jsonb,
  precio_sugerido        numeric(12,2),
  precio_costo_promedio  numeric(12,2),
  margen_pct             numeric(6,2),
  comision_empleado_pct  numeric(6,2) not null default 0,
  sustitutos_ids         uuid[] not null default '{}',
  droguerias_preferidas  text[] not null default '{}',
  stock_minimo_global    integer,
  activo                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null
);

create index if not exists productos_catalogo_categoria_idx
  on public.productos_catalogo(categoria) where activo;
create index if not exists productos_catalogo_lab_idx
  on public.productos_catalogo(laboratorio) where activo;
create index if not exists productos_catalogo_nombre_trgm_idx
  on public.productos_catalogo using gin (nombre gin_trgm_ops);
create index if not exists productos_catalogo_barras_idx
  on public.productos_catalogo(codigo_barras) where codigo_barras is not null;

alter table public.productos_catalogo enable row level security;

drop policy if exists productos_catalogo_admin_all on public.productos_catalogo;
create policy productos_catalogo_admin_all on public.productos_catalogo
  for all
  using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo))
  with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo));

drop trigger if exists productos_catalogo_set_updated_at on public.productos_catalogo;
create trigger productos_catalogo_set_updated_at
  before update on public.productos_catalogo
  for each row execute function public.tg_set_updated_at();
