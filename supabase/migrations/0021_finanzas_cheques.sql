-- ============================================================================
-- 0021_finanzas_cheques.sql · F2.4 Cheques emitidos y recibidos
-- ============================================================================

do $$ begin
  create type public.tipo_cheque as enum ('emitido','recibido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_cheque as enum (
    'emitido','en_cartera','depositado','cobrado','rechazado','anulado'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.cheques (
  id                     uuid primary key default gen_random_uuid(),
  tipo                   public.tipo_cheque not null,
  numero                 text not null,
  banco                  text not null,
  cuenta                 text,
  monto                  numeric(14,2) not null check (monto > 0),
  fecha_emision          date not null,
  fecha_cobro_estimada   date,
  estado                 public.estado_cheque not null default 'emitido',
  beneficiario_o_emisor  text,
  proveedor_id           uuid references public.proveedores(id) on delete set null,
  cliente_id             uuid references public.customers(id) on delete set null,
  cuenta_bancaria_id     uuid references public.cuentas_bancarias_propias(id) on delete set null,
  observaciones          text,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null,
  constraint cheques_un_proveedor_o_cliente
    check (
      (tipo = 'emitido' and cliente_id is null) or
      (tipo = 'recibido' and proveedor_id is null)
    )
);

create index if not exists cheques_estado_idx on public.cheques(estado);
create index if not exists cheques_fecha_cobro_idx on public.cheques(fecha_cobro_estimada) where estado in ('emitido','en_cartera','depositado');

alter table public.cheques enable row level security;

drop policy if exists cheques_read on public.cheques;
create policy cheques_read on public.cheques
  for select using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria','administrativo','auditor'))
  );

drop policy if exists cheques_write on public.cheques;
create policy cheques_write on public.cheques
  for all using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo
      and ua.rol in ('super_admin','gerente','tesoreria'))
  );
