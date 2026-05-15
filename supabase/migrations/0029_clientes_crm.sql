-- ============================================================================
-- 0029_clientes_crm.sql · F5.1 CRM de clientes B2B interno
--
-- Tabla NUEVA — no toca `customers` (base B2C de la cuponera, otro repo).
-- ============================================================================

do $$ begin
  create type public.tipo_cliente_crm as enum (
    'mayorista','corporativo','institucional','particular_vip'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.condicion_pago_crm as enum (
    'contado','7d','15d','30d','60d','90d'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.segmento_cliente as enum (
    'nuevo','activo','en_riesgo','dormido','vip'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.clientes_crm (
  id                       uuid primary key default gen_random_uuid(),
  tipo_cliente             public.tipo_cliente_crm not null,
  razon_social             text not null,
  nombre_fantasia          text,
  cuit                     text,
  dni                      text,
  email                    text,
  telefono                 text,
  direccion_completa       text,
  localidad                text,
  provincia                text,
  codigo_postal            text,
  sucursal_asignada_id     uuid references public.sucursales(id) on delete set null,
  vendedor_asignado_id     uuid references public.users_admin(id) on delete set null,
  condicion_iva            condicion_iva,
  condicion_pago           public.condicion_pago_crm not null default 'contado',
  limite_credito           numeric(14,2) not null default 0,
  descuento_general_pct    numeric(5,2) not null default 0,
  activo                   boolean not null default true,
  segmento                 public.segmento_cliente not null default 'nuevo',
  ltv                      numeric(14,2) not null default 0,
  frecuencia_compra_dias   numeric(8,2),
  ultima_compra_at         timestamptz,
  puntos_acumulados        integer not null default 0,
  notas                    text,
  tags                     text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

-- CUIT único para mayorista / corporativo (los demás tipos pueden repetir o no tener)
create unique index if not exists clientes_crm_cuit_unico
  on public.clientes_crm(cuit)
  where cuit is not null and tipo_cliente in ('mayorista','corporativo');

create index if not exists clientes_crm_razon_social_idx
  on public.clientes_crm ((lower(razon_social)));
create index if not exists clientes_crm_segmento_idx
  on public.clientes_crm(segmento) where activo;
create index if not exists clientes_crm_vendedor_idx
  on public.clientes_crm(vendedor_asignado_id);
create index if not exists clientes_crm_nombre_trgm_idx
  on public.clientes_crm using gin (razon_social gin_trgm_ops);

drop trigger if exists clientes_crm_set_updated_at on public.clientes_crm;
create trigger clientes_crm_set_updated_at
  before update on public.clientes_crm
  for each row execute function public.tg_set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.clientes_crm enable row level security;

drop policy if exists clientes_crm_ro on public.clientes_crm;
create policy clientes_crm_ro on public.clientes_crm
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists clientes_crm_rw on public.clientes_crm;
create policy clientes_crm_rw on public.clientes_crm
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo'))
  );
