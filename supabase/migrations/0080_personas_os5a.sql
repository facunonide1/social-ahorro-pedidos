-- OS-5a · Personas: rol farmacéutico, cobertura por franja, ausencias con
-- workflow, legajo con vencimientos. Extiende el modelo existente (empleados,
-- empleado_turnos, empleado_ausencias) — no duplica.

-- A · Rol farmacéutico y matrícula (capacidad del empleado) + rol que cubre el turno.
alter table public.empleados add column if not exists es_farmaceutico boolean not null default false;
alter table public.empleados add column if not exists matricula text;
alter table public.empleado_turnos add column if not exists rol_cobertura text;  -- cajero|repositor|farmaceutico|encargado|...

-- C · Ausencias con estado (solicitada→aprobada/rechazada). Las existentes eran
-- hechos ya registrados → quedan 'aprobada'.
alter table public.empleado_ausencias add column if not exists estado text not null default 'aprobada';
alter table public.empleado_ausencias add column if not exists aprobado_por uuid references auth.users(id) on delete set null;
alter table public.empleado_ausencias add column if not exists aprobado_at timestamptz;

-- B · Config de cobertura por sucursal (horario de atención + umbral de alerta).
create table if not exists public.cobertura_config (
  sucursal_id uuid primary key references public.sucursales(id) on delete cascade,
  hora_apertura int not null default 8,
  hora_cierre int not null default 20,
  umbral_horas_descubiertas int not null default 4,
  updated_at timestamptz not null default now()
);

-- D · Legajo: documentos con vencimiento.
create table if not exists public.empleado_documentos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  tipo text not null,                -- libreta_sanitaria | art | contrato | otro
  archivo_url text,
  vence_at date,
  created_by uuid references auth.users(id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists empleado_documentos_emp_idx on public.empleado_documentos(empleado_id);
create index if not exists empleado_documentos_vence_idx on public.empleado_documentos(vence_at) where vence_at is not null;

-- RLS: las nuevas tablas se acceden server-side con service_role. Enable sin
-- policy (deny a authenticated; service_role bypassa). Coherente con la sesión
-- de seguridad previa.
alter table public.cobertura_config enable row level security;
alter table public.empleado_documentos enable row level security;

-- Bucket privado para el legajo.
insert into storage.buckets (id, name, public) values ('legajo','legajo',false) on conflict (id) do nothing;