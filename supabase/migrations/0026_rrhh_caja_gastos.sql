-- ============================================================================
-- 0026_rrhh_caja_gastos.sql · F5.4 + F5.5 + F5.6 RRHH, caja diaria, gastos
-- ============================================================================

-- F5.4 RRHH ------------------------------------------------------------------
create table if not exists public.empleados (
  id                  uuid primary key default gen_random_uuid(),
  dni                 text unique,
  nombre_completo     text not null,
  fecha_nacimiento    date,
  telefono            text,
  email               text,
  sucursal_id         uuid references public.sucursales(id) on delete set null,
  puesto              text,
  fecha_ingreso       date,
  fecha_egreso        date,
  salario_base        numeric(12,2),
  activo              boolean not null default true,
  observaciones       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists empleados_set_updated_at on public.empleados;
create trigger empleados_set_updated_at
  before update on public.empleados
  for each row execute function public.tg_set_updated_at();

create table if not exists public.empleado_turnos (
  id                  uuid primary key default gen_random_uuid(),
  empleado_id         uuid not null references public.empleados(id) on delete cascade,
  fecha               date not null,
  hora_entrada        time,
  hora_salida         time,
  horas_trabajadas    numeric(5,2),
  observaciones       text,
  created_at          timestamptz not null default now()
);

create index if not exists turnos_empleado_fecha_idx on public.empleado_turnos(empleado_id, fecha desc);

do $$ begin
  create type public.tipo_ausencia as enum ('vacaciones','enfermedad','licencia','falta');
exception when duplicate_object then null; end $$;

create table if not exists public.empleado_ausencias (
  id                  uuid primary key default gen_random_uuid(),
  empleado_id         uuid not null references public.empleados(id) on delete cascade,
  tipo                public.tipo_ausencia not null,
  fecha_desde         date not null,
  fecha_hasta         date not null,
  justificada         boolean not null default true,
  observaciones       text,
  created_at          timestamptz not null default now()
);

-- F5.5 Cajas diarias ---------------------------------------------------------
do $$ begin
  create type public.estado_caja as enum ('abierta','cerrada');
exception when duplicate_object then null; end $$;

create table if not exists public.cajas_diarias (
  id                       uuid primary key default gen_random_uuid(),
  sucursal_id              uuid not null references public.sucursales(id) on delete restrict,
  fecha                    date not null,
  saldo_inicial            numeric(14,2) not null default 0,
  total_ingresos           numeric(14,2) not null default 0,
  total_egresos            numeric(14,2) not null default 0,
  saldo_final_sistema      numeric(14,2) generated always as
    (saldo_inicial + total_ingresos - total_egresos) stored,
  saldo_final_contado      numeric(14,2),
  diferencia               numeric(14,2),
  estado                   public.estado_caja not null default 'abierta',
  responsable_id           uuid references auth.users(id) on delete set null,
  observaciones            text,
  created_at               timestamptz not null default now(),
  closed_at                timestamptz,
  unique(sucursal_id, fecha)
);

create table if not exists public.movimientos_caja (
  id                       uuid primary key default gen_random_uuid(),
  caja_id                  uuid not null references public.cajas_diarias(id) on delete cascade,
  tipo                     text not null check (tipo in ('ingreso','egreso')),
  categoria                text,
  monto                    numeric(14,2) not null check (monto > 0),
  descripcion              text,
  comprobante              text,
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

-- F5.6 Gastos operativos ---------------------------------------------------
do $$ begin
  create type public.categoria_gasto as enum (
    'alquiler','servicios','sueldos','mantenimiento','limpieza','insumos','otros'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.gastos_operativos (
  id                       uuid primary key default gen_random_uuid(),
  sucursal_id              uuid references public.sucursales(id) on delete set null,
  categoria                public.categoria_gasto not null,
  descripcion              text not null,
  monto                    numeric(14,2) not null check (monto > 0),
  fecha                    date not null default current_date,
  proveedor                text,
  comprobante_url          text,
  periodo                  text,
  pagado                   boolean not null default false,
  pago_id                  uuid references public.pagos(id) on delete set null,
  created_at               timestamptz not null default now(),
  created_by               uuid references auth.users(id) on delete set null
);

create index if not exists gastos_periodo_idx on public.gastos_operativos(periodo);
create index if not exists gastos_sucursal_idx on public.gastos_operativos(sucursal_id, fecha desc);

-- RLS bulk -----------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'empleados','empleado_turnos','empleado_ausencias',
    'cajas_diarias','movimientos_caja','gastos_operativos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_ro on public.%I', t, t);
    execute format(
      'create policy %I_ro on public.%I for select using (exists (select 1 from public.users_admin where id = auth.uid() and activo))',
      t, t
    );
    execute format('drop policy if exists %I_rw on public.%I', t, t);
    execute format(
      'create policy %I_rw on public.%I for all using (exists (select 1 from public.users_admin where id = auth.uid() and activo and rol in (''super_admin'',''gerente'',''administrativo'',''tesoreria'',''sucursal'')))',
      t, t
    );
  end loop;
end $$;
