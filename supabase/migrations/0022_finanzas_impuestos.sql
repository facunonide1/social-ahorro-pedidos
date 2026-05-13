-- ============================================================================
-- 0022_finanzas_impuestos.sql · F2.5 Calendario fiscal
-- ============================================================================

do $$ begin
  create type public.tipo_impuesto as enum (
    'iva','iibb','ganancias','cargas_sociales','monotributo','otros'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_impuesto as enum (
    'pendiente','presentado','pagado','vencido'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.impuestos_obligaciones (
  id                  uuid primary key default gen_random_uuid(),
  tipo                public.tipo_impuesto not null,
  periodo             text not null, -- "2026-05" o "2026-Q2"
  descripcion         text,
  fecha_vencimiento   date not null,
  monto_estimado      numeric(14,2),
  monto_real          numeric(14,2),
  estado              public.estado_impuesto not null default 'pendiente',
  comprobante_url     text,
  notas               text,
  pago_id             uuid references public.pagos(id) on delete set null,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null,
  unique(tipo, periodo)
);

create index if not exists impuestos_fecha_idx on public.impuestos_obligaciones(fecha_vencimiento);
create index if not exists impuestos_estado_idx on public.impuestos_obligaciones(estado);

alter table public.impuestos_obligaciones enable row level security;

drop policy if exists impuestos_read on public.impuestos_obligaciones;
create policy impuestos_read on public.impuestos_obligaciones
  for select using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria','administrativo','auditor'))
  );

drop policy if exists impuestos_write on public.impuestos_obligaciones;
create policy impuestos_write on public.impuestos_obligaciones
  for all using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria','administrativo'))
  );
