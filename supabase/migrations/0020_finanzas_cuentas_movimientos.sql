-- ============================================================================
-- 0020_finanzas_cuentas_movimientos.sql
-- ----------------------------------------------------------------------------
-- F2.1 · Cuentas bancarias + movimientos.
-- Saldo se calcula on-the-fly via view; opcional cachear en columna después.
-- RLS: solo tesoreria, gerente, super_admin, administrativo pueden ver/escribir.
--      auditor SELECT-only.
-- ============================================================================

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type public.tipo_cuenta_bancaria_propia as enum ('caja_ahorro','cuenta_corriente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.moneda as enum ('ARS','USD');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_movimiento_bancario as enum ('ingreso','egreso','transferencia','ajuste');
exception when duplicate_object then null; end $$;

-- Tabla cuentas_bancarias ----------------------------------------------------
create table if not exists public.cuentas_bancarias_propias (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  banco           text not null,
  tipo_cuenta     public.tipo_cuenta_bancaria_propia not null,
  cbu             text,
  alias           text,
  moneda          public.moneda not null default 'ARS',
  activa          boolean not null default true,
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Tabla movimientos_bancarios -----------------------------------------------
create table if not exists public.movimientos_bancarios (
  id                       uuid primary key default gen_random_uuid(),
  cuenta_bancaria_id       uuid not null references public.cuentas_bancarias_propias(id) on delete cascade,
  fecha                    date not null,
  tipo                     public.tipo_movimiento_bancario not null,
  categoria                text,
  monto                    numeric(14,2) not null check (monto >= 0),
  descripcion              text,
  referencia               text,
  comprobante_url          text,
  conciliado               boolean not null default false,
  pago_id                  uuid references public.pagos(id) on delete set null,
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

create index if not exists movimientos_bancarios_cuenta_fecha_idx
  on public.movimientos_bancarios(cuenta_bancaria_id, fecha desc);
create index if not exists movimientos_bancarios_no_conciliado_idx
  on public.movimientos_bancarios(cuenta_bancaria_id, fecha desc)
  where conciliado = false;

-- View saldos por cuenta ----------------------------------------------------
-- Saldo = SUM(ingresos + ajuste positivos) - SUM(egresos + transferencias salientes)
-- Para MVP: monto siempre positivo, signo se infiere del tipo.
create or replace view public.cuentas_bancarias_con_saldo as
select
  c.*,
  coalesce((
    select sum(
      case
        when m.tipo in ('ingreso','ajuste') then m.monto
        when m.tipo in ('egreso','transferencia') then -m.monto
      end
    )
    from public.movimientos_bancarios m
    where m.cuenta_bancaria_id = c.id
  ), 0)::numeric(14,2) as saldo_actual,
  (
    select max(m.fecha)
    from public.movimientos_bancarios m
    where m.cuenta_bancaria_id = c.id
  ) as ultimo_movimiento_fecha
from public.cuentas_bancarias_propias c;

-- Trigger updated_at --------------------------------------------------------
drop trigger if exists cuentas_bancarias_propias_set_updated_at on public.cuentas_bancarias_propias;
create trigger cuentas_bancarias_propias_set_updated_at
  before update on public.cuentas_bancarias_propias
  for each row execute function public.tg_set_updated_at();

-- RLS -----------------------------------------------------------------------
alter table public.cuentas_bancarias_propias enable row level security;
alter table public.movimientos_bancarios     enable row level security;

-- Helper inline: rol del user
-- Reusa lib/admin-hub/auth.ts pattern (lookup en users_admin)

drop policy if exists cuentas_read on public.cuentas_bancarias_propias;
create policy cuentas_read on public.cuentas_bancarias_propias
  for select using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo = true
        and ua.rol in ('super_admin','gerente','tesoreria','administrativo','auditor')
    )
  );

drop policy if exists cuentas_write on public.cuentas_bancarias_propias;
create policy cuentas_write on public.cuentas_bancarias_propias
  for all using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo = true
        and ua.rol in ('super_admin','gerente','tesoreria')
    )
  );

drop policy if exists movimientos_read on public.movimientos_bancarios;
create policy movimientos_read on public.movimientos_bancarios
  for select using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo = true
        and ua.rol in ('super_admin','gerente','tesoreria','administrativo','auditor')
    )
  );

drop policy if exists movimientos_write on public.movimientos_bancarios;
create policy movimientos_write on public.movimientos_bancarios
  for all using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo = true
        and ua.rol in ('super_admin','gerente','tesoreria')
    )
  );
