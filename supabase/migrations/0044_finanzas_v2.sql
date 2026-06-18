-- 0044 · Finanzas v2 — cuentas por pagar + tesorería + caja multinivel (FIN · T1)
--
-- ALTER de F2 (proveedores/facturas/pagos) + tablas nuevas (gastos fijos, caja
-- multinivel, conciliación, config import). El saldo de caja_general se deriva de
-- caja_general_movimientos APROBADOS vía trigger. No rompe F2.

-- ===== ENUMS =====
do $$ begin create type public.forma_pago_proveedor as enum ('transferencia','efectivo','cheque','mercadopago'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tipo_documento_financiero as enum ('factura_a','factura_b','factura_c','nota_credito','nota_debito','recibo','remito','gasto'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pago_origen as enum ('efectivo_sucursal','cuenta_bancaria','cheque','mercadopago'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gasto_fijo_tipo as enum ('alquiler','servicio','seguro','sueldos','otro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.gasto_fijo_estado as enum ('pendiente','pagado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.caja_turno_estado as enum ('abierto','cerrado_pendiente_aprobacion','aprobado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.caja_general_tipo as enum ('caja_general','caja_fuerte'); exception when duplicate_object then null; end $$;
do $$ begin create type public.caja_general_mov_tipo as enum ('entrada_turno','pago_proveedor','retiro_socios','ajuste'); exception when duplicate_object then null; end $$;
do $$ begin create type public.caja_general_mov_estado as enum ('pendiente_aprobacion','aprobado','rechazado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.conciliacion_estado as enum ('conciliado','sugerido','sin_match'); exception when duplicate_object then null; end $$;
do $$ begin create type public.import_finanzas_tipo as enum ('facturas','pagos','extracto'); exception when duplicate_object then null; end $$;

-- ===== ALTER proveedores =====
alter table public.proveedores
  add column if not exists cbu text,
  add column if not exists alias_cbu text,
  add column if not exists banco text,
  add column if not exists forma_pago_default public.forma_pago_proveedor,
  add column if not exists bonif_volumen jsonb,
  add column if not exists desc_pronto_pago jsonb;

-- ===== ALTER facturas_proveedor (= documentos financieros) =====
alter table public.facturas_proveedor
  add column if not exists tipo_documento public.tipo_documento_financiero not null default 'factura_a',
  add column if not exists forma_pago_prevista public.forma_pago_proveedor,
  add column if not exists es_futura boolean not null default false,
  add column if not exists hash_dedup text,
  add column if not exists es_demo boolean not null default false;
create index if not exists facturas_hash_idx on public.facturas_proveedor(hash_dedup) where hash_dedup is not null;

-- ===== ALTER pagos =====
alter table public.pagos
  add column if not exists origen_tipo public.pago_origen,
  add column if not exists origen_sucursal_id uuid references public.sucursales(id) on delete set null,
  add column if not exists origen_cuenta_id uuid references public.cuentas_bancarias_propias(id) on delete set null,
  add column if not exists cheque_id uuid references public.cheques(id) on delete set null,
  add column if not exists retencion_detalle jsonb,
  add column if not exists es_demo boolean not null default false;

-- es_demo en tablas existentes que el demo usa
alter table public.cheques add column if not exists es_demo boolean not null default false;
alter table public.impuestos_obligaciones add column if not exists es_demo boolean not null default false;
alter table public.movimientos_bancarios add column if not exists es_demo boolean not null default false;

-- ===== GASTOS FIJOS =====
create table if not exists public.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  tipo public.gasto_fijo_tipo not null default 'otro',
  sucursal_id uuid references public.sucursales(id) on delete set null,
  monto numeric(14,2),
  frecuencia text not null default 'mensual',
  dia_mes int not null default 1,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  activo boolean not null default true,
  es_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.gastos_fijos_instancias (
  id uuid primary key default gen_random_uuid(),
  gasto_fijo_id uuid not null references public.gastos_fijos(id) on delete cascade,
  periodo text not null,
  monto numeric(14,2),
  estado public.gasto_fijo_estado not null default 'pendiente',
  vencimiento date,
  pago_id uuid references public.pagos(id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (gasto_fijo_id, periodo)
);

-- ===== CAJA MULTINIVEL =====
create table if not exists public.config_caja_sucursal (
  sucursal_id uuid primary key references public.sucursales(id) on delete cascade,
  fondo_fijo numeric(14,2) not null default 0,
  usa_caja_general boolean not null default true,
  usa_caja_fuerte boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  turno_id uuid references public.turnos_sucursal(id) on delete set null,
  fecha date not null,
  cajero_user_id uuid references auth.users(id) on delete set null,
  apertura numeric(14,2) not null default 0,
  ventas_efectivo numeric(14,2) not null default 0,
  pagos_efectivo numeric(14,2) not null default 0,
  esperado numeric(14,2),
  contado numeric(14,2),
  diferencia numeric(14,2),
  fondo_dejado numeric(14,2),
  retiro_a_general numeric(14,2),
  estado public.caja_turno_estado not null default 'abierto',
  arqueo_ciego boolean not null default true,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists caja_turnos_suc_fecha_idx on public.caja_turnos(sucursal_id, fecha);

create table if not exists public.caja_general (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  saldo_actual numeric(14,2) not null default 0,
  tipo public.caja_general_tipo not null default 'caja_general',
  es_demo boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (sucursal_id)
);

create table if not exists public.caja_general_movimientos (
  id uuid primary key default gen_random_uuid(),
  caja_general_id uuid not null references public.caja_general(id) on delete cascade,
  tipo public.caja_general_mov_tipo not null,
  monto numeric(14,2) not null,           -- FIRMADO (+ entradas, − salidas)
  referencia_tipo text,
  referencia_id uuid,
  estado public.caja_general_mov_estado not null default 'pendiente_aprobacion',
  solicitado_por uuid references auth.users(id) on delete set null,
  aprobado_por uuid references auth.users(id) on delete set null,
  notas text,
  es_demo boolean not null default false,
  fecha timestamptz not null default now()
);
create index if not exists cgm_caja_idx on public.caja_general_movimientos(caja_general_id);
create index if not exists cgm_pend_idx on public.caja_general_movimientos(estado) where estado = 'pendiente_aprobacion';

-- Trigger: el saldo de caja_general deriva de los movimientos APROBADOS.
create or replace function public.tg_caja_general_saldo()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT' and NEW.estado = 'aprobado') then
    update public.caja_general set saldo_actual = saldo_actual + NEW.monto, updated_at = now() where id = NEW.caja_general_id;
  elsif (TG_OP = 'UPDATE' and NEW.estado = 'aprobado' and OLD.estado <> 'aprobado') then
    update public.caja_general set saldo_actual = saldo_actual + NEW.monto, updated_at = now() where id = NEW.caja_general_id;
  end if;
  return NEW;
end $$;
drop trigger if exists caja_general_mov_saldo on public.caja_general_movimientos;
create trigger caja_general_mov_saldo after insert or update on public.caja_general_movimientos
  for each row execute function public.tg_caja_general_saldo();

-- ===== CONCILIACIÓN =====
create table if not exists public.conciliacion_items (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_bancarias_propias(id) on delete cascade,
  fecha date not null,
  descripcion_extracto text,
  monto numeric(14,2) not null,
  match_pago_id uuid references public.pagos(id) on delete set null,
  match_movimiento_id uuid references public.movimientos_bancarios(id) on delete set null,
  estado public.conciliacion_estado not null default 'sin_match',
  import_id uuid,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists conciliacion_cuenta_idx on public.conciliacion_items(cuenta_id);

-- ===== CONFIG IMPORT FINANZAS =====
create table if not exists public.config_import_finanzas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo public.import_finanzas_tipo not null,
  mapeo_columnas jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== RLS =====
do $$
declare t text;
begin
  foreach t in array array[
    'gastos_fijos','gastos_fijos_instancias','config_caja_sucursal','caja_turnos',
    'caja_general_movimientos','conciliacion_items','config_import_finanzas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''tesoreria''))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''tesoreria'')))', t, t);
  end loop;
end $$;

-- caja_general: saldo visible solo a super_admin/gerente (lectura restringida)
alter table public.caja_general enable row level security;
drop policy if exists caja_general_read on public.caja_general;
create policy caja_general_read on public.caja_general for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in ('super_admin','gerente','tesoreria')));
drop policy if exists caja_general_write on public.caja_general;
create policy caja_general_write on public.caja_general for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in ('super_admin','gerente'))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in ('super_admin','gerente')));
