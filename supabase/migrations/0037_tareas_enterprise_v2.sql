-- 0037 · Tareas Enterprise v2 (F6-T · T1)
--
-- Extiende el módulo de tareas de F6 al diseño definitivo: asignación híbrida
-- (pool por turno/sucursal), turnos por sucursal, supervisores por sucursal,
-- verificación humana + pre-verificación IA, y snapshots de métricas.
-- Regla: ALTER/extender lo de F6, CREATE lo que falta. No duplica nada.
--
-- NOTA: las altas de valores de enum (ADD VALUE) se aplican en una transacción
-- separada de su uso (ver bloque [ENUM VALUES] aplicado primero por el runner).

-- ============ [ENUM VALUES] (aplicar primero, fuera del resto del tx) ========
alter type public.tarea_estado    add value if not exists 'reclamada';
alter type public.tarea_origen    add value if not exists 'auto_recurrencia';
alter type public.tarea_origen    add value if not exists 'nora';
alter type public.tarea_categoria add value if not exists 'cadena_frio';

-- ============ ENUMS NUEVOS ====================================================
do $$ begin
  create type public.tarea_asignacion as enum
    ('usuario_especifico','pool_turno','pool_sucursal','rol');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_tarea_alcance as enum ('global','por_sucursal');
exception when duplicate_object then null; end $$;

-- ============ TURNOS POR SUCURSAL ============================================
create table if not exists public.turnos_sucursal (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null references public.sucursales(id) on delete cascade,
  nombre       text not null,
  hora_inicio  time not null,
  hora_fin     time not null,
  dias_semana  int[] not null default '{1,2,3,4,5,6}',
  activo       boolean not null default true,
  orden        int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists turnos_sucursal_suc_idx on public.turnos_sucursal(sucursal_id) where activo;

drop trigger if exists turnos_sucursal_set_updated_at on public.turnos_sucursal;
create trigger turnos_sucursal_set_updated_at
  before update on public.turnos_sucursal
  for each row execute function public.tg_set_updated_at();

-- ============ SUPERVISORES DE TAREAS ========================================
create table if not exists public.supervisores_tareas (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  categorias    text[],
  activo        boolean not null default true,
  designado_por uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists supervisores_tareas_uniq
  on public.supervisores_tareas(sucursal_id, user_id) where activo;
create index if not exists supervisores_tareas_suc_idx on public.supervisores_tareas(sucursal_id);

-- ============ ALTER tareas ===================================================
alter table public.tareas
  add column if not exists asignacion_tipo public.tarea_asignacion not null default 'usuario_especifico',
  add column if not exists turno_id uuid references public.turnos_sucursal(id) on delete set null,
  add column if not exists reclamada_por uuid references auth.users(id) on delete set null,
  add column if not exists reclamada_at timestamptz,
  add column if not exists verificacion_humana boolean not null default true,
  add column if not exists verificada_por uuid references auth.users(id) on delete set null,
  add column if not exists verificada_at timestamptz,
  add column if not exists pre_verificacion_ia jsonb,
  add column if not exists motivo_rechazo text,
  add column if not exists rechazos_count int not null default 0,
  add column if not exists hora_limite time,
  add column if not exists tiempo_resolucion_min int,
  add column if not exists demora_min int,
  add column if not exists escalamiento_nivel int not null default 0,
  add column if not exists puntos_otorgados int,
  add column if not exists creado_por_nombre text;

create index if not exists tareas_suc_venc_idx on public.tareas(sucursal_id, fecha_vencimiento);
create index if not exists tareas_estado_venc_idx on public.tareas(estado, fecha_vencimiento);
create index if not exists tareas_asignacion_turno_idx on public.tareas(asignacion_tipo, turno_id);
create index if not exists tareas_responsable_idx on public.tareas(responsable_id);

-- ============ ALTER tipos_tareas ============================================
alter table public.tipos_tareas
  add column if not exists alcance public.tipo_tarea_alcance not null default 'global',
  add column if not exists sucursales_ids uuid[],
  add column if not exists verificacion_humana boolean not null default true,
  add column if not exists checklist_items jsonb;

-- ============ ALTER tareas_recurrencias =====================================
alter table public.tareas_recurrencias
  add column if not exists asignacion_tipo public.tarea_asignacion not null default 'usuario_especifico',
  add column if not exists turno_id uuid references public.turnos_sucursal(id) on delete set null,
  add column if not exists usuario_fijo_id uuid references auth.users(id) on delete set null,
  add column if not exists hora_limite time;

-- ============ ALTER empleados_objetivos =====================================
alter table public.empleados_objetivos
  add column if not exists proyeccion_pct numeric,
  add column if not exists comentario_nora text;

-- ============ MÉTRICAS — SNAPSHOTS ==========================================
create table if not exists public.empleados_metricas_diarias (
  id                  uuid primary key default gen_random_uuid(),
  empleado_user_id    uuid not null references auth.users(id) on delete cascade,
  sucursal_id         uuid references public.sucursales(id) on delete set null,
  fecha               date not null,
  asignadas           int not null default 0,
  completadas         int not null default 0,
  completadas_en_sla  int not null default 0,
  rechazadas          int not null default 0,
  reclamadas_pool     int not null default 0,
  tiempo_promedio_min numeric,
  demora_promedio_min numeric,
  puntos_dia          int not null default 0,
  racha_dias          int not null default 0,
  created_at          timestamptz not null default now(),
  unique (empleado_user_id, fecha)
);
create index if not exists emp_metricas_fecha_idx on public.empleados_metricas_diarias(fecha);

create table if not exists public.sucursales_metricas_diarias (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references public.sucursales(id) on delete cascade,
  fecha           date not null,
  total           int not null default 0,
  completadas     int not null default 0,
  en_sla          int not null default 0,
  vencidas        int not null default 0,
  cumplimiento_pct numeric,
  por_categoria   jsonb not null default '{}'::jsonb,
  por_turno       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (sucursal_id, fecha)
);
create index if not exists suc_metricas_fecha_idx on public.sucursales_metricas_diarias(fecha);

create table if not exists public.tipos_tareas_metricas_mensuales (
  id                  uuid primary key default gen_random_uuid(),
  tipo_tarea_id       uuid not null references public.tipos_tareas(id) on delete cascade,
  periodo             text not null,
  total               int not null default 0,
  cumplimiento_pct    numeric,
  tiempo_promedio_min numeric,
  tasa_rechazo_pct    numeric,
  created_at          timestamptz not null default now(),
  unique (tipo_tarea_id, periodo)
);

create table if not exists public.supervisores_metricas_diarias (
  id                              uuid primary key default gen_random_uuid(),
  supervisor_user_id              uuid not null references auth.users(id) on delete cascade,
  sucursal_id                     uuid references public.sucursales(id) on delete set null,
  fecha                           date not null,
  verificadas                     int not null default 0,
  rechazos                        int not null default 0,
  tiempo_promedio_verificacion_min numeric,
  vencidas_en_cola                int not null default 0,
  created_at                      timestamptz not null default now(),
  unique (supervisor_user_id, fecha)
);

-- ============ RLS ============================================================
alter table public.turnos_sucursal enable row level security;
alter table public.supervisores_tareas enable row level security;
alter table public.empleados_metricas_diarias enable row level security;
alter table public.sucursales_metricas_diarias enable row level security;
alter table public.tipos_tareas_metricas_mensuales enable row level security;
alter table public.supervisores_metricas_diarias enable row level security;

-- helper inline: usuario admin activo
-- lectura amplia para cualquier admin activo
do $$
declare t text;
begin
  foreach t in array array[
    'turnos_sucursal','supervisores_tareas','empleados_metricas_diarias',
    'sucursales_metricas_diarias','tipos_tareas_metricas_mensuales','supervisores_metricas_diarias'
  ] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format(
      'create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo))',
      t, t);
  end loop;
end $$;

-- escritura de turnos/supervisores: super_admin o gerente
do $$
declare t text;
begin
  foreach t in array array['turnos_sucursal','supervisores_tareas'] loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente''))) with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'')))',
      t, t);
  end loop;
end $$;

-- ============ SEED turnos (Mañana 08-14, Tarde 14-21, lun-sáb) ==============
insert into public.turnos_sucursal (sucursal_id, nombre, hora_inicio, hora_fin, dias_semana, orden)
select s.id, v.nombre, v.hi::time, v.hf::time, '{1,2,3,4,5,6}'::int[], v.orden
from public.sucursales s
cross join (values ('Mañana','08:00','14:00',0), ('Tarde','14:00','21:00',1)) as v(nombre, hi, hf, orden)
where s.activa
  and not exists (
    select 1 from public.turnos_sucursal ts
    where ts.sucursal_id = s.id and ts.nombre = v.nombre
  );

-- ============ STORAGE BUCKETS ===============================================
insert into storage.buckets (id, name, public) values ('tareas-evidencias','tareas-evidencias',false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('comprobantes','comprobantes',false) on conflict (id) do nothing;

drop policy if exists tareas_comprobantes_rw on storage.objects;
create policy tareas_comprobantes_rw on storage.objects
  for all to authenticated
  using (bucket_id in ('tareas-evidencias','comprobantes'))
  with check (bucket_id in ('tareas-evidencias','comprobantes'));
