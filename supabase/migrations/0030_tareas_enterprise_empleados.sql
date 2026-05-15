-- ============================================================================
-- 0030_tareas_enterprise_empleados.sql · FASE 6
--
-- Sistema de Tareas Enterprise + extensión de Empleados + Objetivos KPI +
-- Gamificación (badges + puntos) + Recurrencias + Triggers automáticos.
--
-- Aditiva. Todas las tablas con RLS por rol vía users_admin.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

do $$ begin
  create type public.tarea_categoria as enum (
    'finanzas','compras','operaciones','rrhh','comercial','sucursal',
    'regulatorio','limpieza','seguridad','atencion_cliente','inventario','otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tarea_prioridad as enum ('baja','media','alta','critica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tarea_estado as enum (
    'pendiente','asignada','en_progreso','en_verificacion','en_aprobacion',
    'bloqueada','completada','descartada','vencida','rechazada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tarea_origen as enum (
    'auto_sistema','manual','plantilla','recurrencia'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.recurrencia_patron as enum (
    'diaria','semanal','mensual','anual','custom_cron'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tarea_historial_accion as enum (
    'creada','asignada','reasignada','iniciada','marcada_verificacion',
    'verificada','rechazada','aprobada_final','completada','descartada',
    'reabierta','vencida','comentario','adjunto','evidencia','dependencia',
    'subtarea','cambio_prioridad','cambio_vencimiento','cambio_responsable'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.empleado_nivel_acceso as enum (
    'empleado','encargado','jefe','admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.objetivo_periodo_tipo as enum ('mensual','trimestral','anual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.objetivo_estado as enum ('en_curso','cerrado');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. TIPOS DE TAREAS
-- ============================================================================

create table if not exists public.tipos_tareas (
  id                              uuid primary key default gen_random_uuid(),
  codigo                          text not null unique,
  nombre                          text not null,
  descripcion                     text,
  categoria                       public.tarea_categoria not null,
  icono                           text,
  color                           text,
  prioridad_default               public.tarea_prioridad not null default 'media',
  sla_horas                       integer,
  requiere_aprobacion             boolean not null default false,
  niveles_workflow                integer not null default 1
                                  check (niveles_workflow between 1 and 3),
  evidencia_requerida             jsonb not null default '[]'::jsonb,
  campos_custom                   jsonb not null default '[]'::jsonb,
  rol_responsable_default         text,
  rol_verificador_default         text,
  rol_aprobador_final_default     text,
  es_auto_generable               boolean not null default false,
  permite_recurrencia             boolean not null default false,
  plantilla_titulo                text,
  plantilla_descripcion           text,
  notificar_creacion              boolean not null default true,
  notificar_vencimiento           boolean not null default true,
  dias_alerta_previa              integer not null default 1,
  puntos_completar                integer not null default 10,
  activo                          boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index if not exists tipos_tareas_categoria_idx on public.tipos_tareas(categoria) where activo;
create index if not exists tipos_tareas_codigo_idx on public.tipos_tareas(codigo);

drop trigger if exists tipos_tareas_set_updated_at on public.tipos_tareas;
create trigger tipos_tareas_set_updated_at
  before update on public.tipos_tareas
  for each row execute function public.tg_set_updated_at();

-- ============================================================================
-- 3. RECURRENCIAS (FK referenciada por tareas más abajo)
-- ============================================================================

create table if not exists public.tareas_recurrencias (
  id                          uuid primary key default gen_random_uuid(),
  tipo_tarea_id               uuid references public.tipos_tareas(id) on delete cascade,
  titulo_plantilla            text not null,
  descripcion_plantilla       text,
  patron                      public.recurrencia_patron not null,
  dias_semana                 integer[],
  dia_mes                     integer check (dia_mes is null or dia_mes between 1 and 31),
  hora_creacion               time not null default '06:00',
  fecha_inicio                date not null default current_date,
  fecha_fin                   date,
  responsable_default_id      uuid references auth.users(id) on delete set null,
  verificador_default_id      uuid references auth.users(id) on delete set null,
  sucursal_id                 uuid references public.sucursales(id) on delete set null,
  rol_responsable             text,
  activa                      boolean not null default true,
  ultima_ejecucion            timestamptz,
  proxima_ejecucion           timestamptz,
  created_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null
);

create index if not exists tareas_recurrencias_proxima_idx
  on public.tareas_recurrencias(proxima_ejecucion) where activa;
create index if not exists tareas_recurrencias_tipo_idx
  on public.tareas_recurrencias(tipo_tarea_id);

-- ============================================================================
-- 4. TAREAS (con autogeneración de código secuencial por año)
-- ============================================================================

create sequence if not exists public.tareas_codigo_seq;

create or replace function public.tg_tareas_codigo()
returns trigger
language plpgsql
as $$
declare
  yr text := to_char(now(), 'YYYY');
  seq_val bigint;
begin
  if new.codigo is null or new.codigo = '' then
    seq_val := nextval('public.tareas_codigo_seq');
    new.codigo := 'TASK-' || yr || '-' || lpad(seq_val::text, 5, '0');
  end if;
  return new;
end $$;

create table if not exists public.tareas (
  id                          uuid primary key default gen_random_uuid(),
  codigo                      text not null unique,
  tipo_tarea_id               uuid references public.tipos_tareas(id) on delete set null,
  tipo_origen                 public.tarea_origen not null default 'manual',
  titulo                      text not null,
  descripcion                 text,
  prioridad                   public.tarea_prioridad not null default 'media',
  estado                      public.tarea_estado not null default 'pendiente',

  -- Workflow multi-nivel
  responsable_id              uuid references auth.users(id) on delete set null,
  verificador_id              uuid references auth.users(id) on delete set null,
  aprobador_final_id          uuid references auth.users(id) on delete set null,

  asignados_secundarios       uuid[] not null default '{}',
  rol_destinatario            text,
  sucursal_id                 uuid references public.sucursales(id) on delete set null,
  departamento                text,

  -- Vínculo con otra entidad del ERP
  entidad_relacionada         text,
  entidad_id                  uuid,
  entidad_url                 text,

  -- Fechas / timing
  fecha_creacion              timestamptz not null default now(),
  fecha_asignacion            timestamptz,
  fecha_vencimiento           timestamptz,
  fecha_inicio_real           timestamptz,
  fecha_completada            timestamptz,
  fecha_verificada            timestamptz,
  fecha_aprobada_final        timestamptz,

  sla_horas                   integer,
  tiempo_resolucion_horas     numeric(10,2),

  datos_custom                jsonb not null default '{}'::jsonb,
  evidencias                  jsonb not null default '[]'::jsonb,

  -- Relaciones entre tareas
  tarea_padre_id              uuid references public.tareas(id) on delete set null,
  dependencias_ids            uuid[] not null default '{}',
  siguiente_tarea_id          uuid references public.tareas(id) on delete set null,
  recurrencia_id              uuid references public.tareas_recurrencias(id) on delete set null,

  -- Gamificación + auditoría
  puntos_obtenidos            integer,
  creado_por                  uuid references auth.users(id) on delete set null,
  motivo_descartada           text,
  motivo_rechazada            text,
  comentario_verificacion     text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists tareas_responsable_idx
  on public.tareas(responsable_id, estado, fecha_vencimiento);
create index if not exists tareas_verificador_idx
  on public.tareas(verificador_id) where estado = 'en_verificacion';
create index if not exists tareas_aprobador_idx
  on public.tareas(aprobador_final_id) where estado = 'en_aprobacion';
create index if not exists tareas_estado_idx on public.tareas(estado);
create index if not exists tareas_sucursal_idx on public.tareas(sucursal_id);
create index if not exists tareas_tipo_idx on public.tareas(tipo_tarea_id);
create index if not exists tareas_vencimiento_pendientes_idx
  on public.tareas(fecha_vencimiento) where estado in ('pendiente','asignada','en_progreso');
create index if not exists tareas_entidad_idx
  on public.tareas(entidad_relacionada, entidad_id) where entidad_id is not null;
create index if not exists tareas_padre_idx on public.tareas(tarea_padre_id) where tarea_padre_id is not null;
create index if not exists tareas_recurrencia_idx on public.tareas(recurrencia_id) where recurrencia_id is not null;
create index if not exists tareas_titulo_trgm_idx on public.tareas using gin (titulo gin_trgm_ops);

drop trigger if exists tareas_set_updated_at on public.tareas;
create trigger tareas_set_updated_at
  before update on public.tareas
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tareas_set_codigo on public.tareas;
create trigger tareas_set_codigo
  before insert on public.tareas
  for each row execute function public.tg_tareas_codigo();

-- ============================================================================
-- 5. COMENTARIOS / ADJUNTOS / HISTORIAL
-- ============================================================================

create table if not exists public.tareas_comentarios (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references public.tareas(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete set null,
  contenido           text not null,
  menciones           uuid[] not null default '{}',
  es_cambio_estado    boolean not null default false,
  estado_anterior     text,
  estado_nuevo        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists tareas_comentarios_tarea_idx
  on public.tareas_comentarios(tarea_id, created_at desc);
create index if not exists tareas_comentarios_menciones_idx
  on public.tareas_comentarios using gin (menciones);

create table if not exists public.tareas_adjuntos (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references public.tareas(id) on delete cascade,
  nombre_archivo      text not null,
  url                 text not null,
  tipo_mime           text,
  tamanio_bytes       integer,
  es_evidencia        boolean not null default false,
  subido_por          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists tareas_adjuntos_tarea_idx
  on public.tareas_adjuntos(tarea_id, created_at desc);

create table if not exists public.tareas_historial (
  id                  uuid primary key default gen_random_uuid(),
  tarea_id            uuid not null references public.tareas(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete set null,
  accion              public.tarea_historial_accion not null,
  estado_anterior     jsonb,
  estado_nuevo        jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists tareas_historial_tarea_idx
  on public.tareas_historial(tarea_id, created_at desc);

-- ============================================================================
-- 6. TRIGGERS AUTOMÁTICOS (configuración)
-- ============================================================================

create table if not exists public.tareas_triggers_auto (
  id                          uuid primary key default gen_random_uuid(),
  nombre                      text not null,
  tipo_tarea_id               uuid not null references public.tipos_tareas(id) on delete cascade,
  evento                      text not null,
  condiciones                 jsonb not null default '{}'::jsonb,
  asignacion_logic            jsonb not null default '{}'::jsonb,
  prioridad_override          public.tarea_prioridad,
  vencimiento_horas           integer,
  activo                      boolean not null default true,
  ejecuciones_count           integer not null default 0,
  ultima_ejecucion            timestamptz,
  created_at                  timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null
);

create index if not exists tareas_triggers_evento_idx
  on public.tareas_triggers_auto(evento) where activo;

-- ============================================================================
-- 7. EMPLEADOS — extensión (la tabla viene de migración 0026)
-- ============================================================================

alter table public.empleados
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists supervisor_id uuid references public.empleados(id) on delete set null,
  add column if not exists foto_perfil_url text,
  add column if not exists nivel_acceso public.empleado_nivel_acceso not null default 'empleado',
  add column if not exists sucursales_acceso uuid[] not null default '{}',
  add column if not exists score_total integer not null default 0,
  add column if not exists badges_obtenidos jsonb not null default '[]'::jsonb;

create unique index if not exists empleados_user_id_unico
  on public.empleados(user_id) where user_id is not null;
create index if not exists empleados_supervisor_idx
  on public.empleados(supervisor_id) where supervisor_id is not null;
create index if not exists empleados_score_idx on public.empleados(score_total desc) where activo;

-- ============================================================================
-- 8. KPIs catálogo + objetivos + evaluaciones
-- ============================================================================

create table if not exists public.empleados_kpis_catalogo (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nombre          text not null,
  descripcion     text,
  unidad          text not null check (unidad in ('cantidad','pct','monto','horas','dias')),
  fuente_dato     text not null,
  query_calculo   text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.empleados_objetivos (
  id                  uuid primary key default gen_random_uuid(),
  empleado_id         uuid not null references public.empleados(id) on delete cascade,
  periodo_tipo        public.objetivo_periodo_tipo not null,
  periodo_anio        integer not null,
  periodo_mes         integer check (periodo_mes is null or periodo_mes between 1 and 12),
  periodo_trimestre   integer check (periodo_trimestre is null or periodo_trimestre between 1 and 4),
  kpis                jsonb not null default '[]'::jsonb,
  score_calculado     numeric(10,2),
  score_pct           numeric(5,2),
  estado              public.objetivo_estado not null default 'en_curso',
  created_at          timestamptz not null default now(),
  closed_at           timestamptz
);

create index if not exists empleados_objetivos_empleado_idx
  on public.empleados_objetivos(empleado_id, periodo_anio desc, periodo_mes desc);
create index if not exists empleados_objetivos_en_curso_idx
  on public.empleados_objetivos(empleado_id) where estado = 'en_curso';

create table if not exists public.empleados_evaluaciones (
  id              uuid primary key default gen_random_uuid(),
  empleado_id     uuid not null references public.empleados(id) on delete cascade,
  evaluador_id    uuid references auth.users(id) on delete set null,
  periodo         text not null,
  puntaje         numeric(3,1) check (puntaje >= 0 and puntaje <= 10),
  areas_fortaleza text,
  areas_mejora    text,
  comentarios     text,
  created_at      timestamptz not null default now()
);

create index if not exists empleados_evaluaciones_empleado_idx
  on public.empleados_evaluaciones(empleado_id, created_at desc);

-- ============================================================================
-- 9. BADGES (catálogo + asignados viven en empleados.badges_obtenidos)
-- ============================================================================

create table if not exists public.empleados_badges (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nombre          text not null,
  descripcion     text,
  icono           text,
  color           text,
  criterio        jsonb not null default '{}'::jsonb,
  puntos_bonus    integer not null default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- 10. RLS — bulk enable, lectura amplia, escritura por rol
-- ============================================================================

alter table public.tipos_tareas              enable row level security;
alter table public.tareas                    enable row level security;
alter table public.tareas_recurrencias       enable row level security;
alter table public.tareas_comentarios        enable row level security;
alter table public.tareas_adjuntos           enable row level security;
alter table public.tareas_historial          enable row level security;
alter table public.tareas_triggers_auto      enable row level security;
alter table public.empleados_kpis_catalogo   enable row level security;
alter table public.empleados_objetivos       enable row level security;
alter table public.empleados_evaluaciones    enable row level security;
alter table public.empleados_badges          enable row level security;

-- Tipos / catálogos: lectura para todos los activos, escritura solo gerencia.
do $$
declare t text;
begin
  foreach t in array array['tipos_tareas','tareas_recurrencias','tareas_triggers_auto',
                            'empleados_kpis_catalogo','empleados_badges']
  loop
    execute format('drop policy if exists %I_ro on public.%I', t, t);
    execute format(
      'create policy %I_ro on public.%I for select using (exists (select 1 from public.users_admin where id = auth.uid() and activo))',
      t, t
    );
    execute format('drop policy if exists %I_rw on public.%I', t, t);
    execute format(
      'create policy %I_rw on public.%I for all using (exists (select 1 from public.users_admin where id = auth.uid() and activo and rol in (''super_admin'',''gerente'')))',
      t, t
    );
  end loop;
end $$;

-- Tareas: lectura amplia (todo user_admin activo); escritura amplia
-- (cualquier user_admin puede crear/modificar) — la lógica fina la hace
-- el workflow engine en la app.
drop policy if exists tareas_ro on public.tareas;
create policy tareas_ro on public.tareas
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );
drop policy if exists tareas_rw on public.tareas;
create policy tareas_rw on public.tareas
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

-- Comentarios / adjuntos / historial: lectura si ve la tarea; escritura
-- de comentarios/adjuntos para todo user activo; historial vía app.
do $$
declare t text;
begin
  foreach t in array array['tareas_comentarios','tareas_adjuntos','tareas_historial']
  loop
    execute format('drop policy if exists %I_ro on public.%I', t, t);
    execute format(
      'create policy %I_ro on public.%I for select using (exists (select 1 from public.users_admin where id = auth.uid() and activo))',
      t, t
    );
    execute format('drop policy if exists %I_rw on public.%I', t, t);
    execute format(
      'create policy %I_rw on public.%I for all using (exists (select 1 from public.users_admin where id = auth.uid() and activo))',
      t, t
    );
  end loop;
end $$;

-- Objetivos / evaluaciones: lectura para gerencia + el propio empleado.
drop policy if exists objetivos_ro on public.empleados_objetivos;
create policy objetivos_ro on public.empleados_objetivos
  for select using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and (ua.rol in ('super_admin','gerente','auditor')
             or exists (select 1 from public.empleados e
                        where e.id = empleados_objetivos.empleado_id
                          and e.user_id = auth.uid()))
    )
  );
drop policy if exists objetivos_rw on public.empleados_objetivos;
create policy objetivos_rw on public.empleados_objetivos
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo'))
  );

drop policy if exists evals_ro on public.empleados_evaluaciones;
create policy evals_ro on public.empleados_evaluaciones
  for select using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and (ua.rol in ('super_admin','gerente','auditor')
             or exists (select 1 from public.empleados e
                        where e.id = empleados_evaluaciones.empleado_id
                          and e.user_id = auth.uid()))
    )
  );
drop policy if exists evals_rw on public.empleados_evaluaciones;
create policy evals_rw on public.empleados_evaluaciones
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente'))
  );

-- ============================================================================
-- 11. SEED — KPIs catálogo
-- ============================================================================

insert into public.empleados_kpis_catalogo (codigo, nombre, descripcion, unidad, fuente_dato) values
  ('tareas_completadas',         'Tareas completadas',           'Total de tareas marcadas como completadas en el período', 'cantidad', 'tareas'),
  ('tareas_completadas_en_sla',  'Tareas en SLA',                'Porcentaje de tareas completadas dentro del SLA',          'pct',      'tareas'),
  ('asistencia_pct',             'Asistencia',                   'Porcentaje de días asistidos sobre días laborables',       'pct',      'asistencia'),
  ('horas_capacitacion',         'Horas de capacitación',        'Horas formales de capacitación en el período',             'horas',    'manual'),
  ('ventas_individuales',        'Ventas individuales',          'Monto total de ventas atribuidas',                         'monto',    'ventas'),
  ('ticket_promedio',            'Ticket promedio',              'Ticket promedio en pesos',                                 'monto',    'ventas'),
  ('nps_clientes',               'NPS de clientes',              'Net Promoter Score de clientes atendidos',                 'cantidad', 'manual'),
  ('quejas_recibidas',           'Quejas recibidas',             'Reclamos formales recibidos',                              'cantidad', 'manual'),
  ('elogios_recibidos',          'Elogios recibidos',            'Felicitaciones formales recibidas',                        'cantidad', 'manual'),
  ('tareas_verificadas_aprobadas','Verificaciones aprobadas',    'Tareas que verificó y aprobó',                             'cantidad', 'tareas')
on conflict (codigo) do nothing;

-- ============================================================================
-- 12. SEED — Badges
-- ============================================================================

insert into public.empleados_badges (codigo, nombre, descripcion, icono, color, criterio, puntos_bonus) values
  ('primer_paso',          'Primer paso',          'Completá tu primera tarea',                           'Sparkles',  '#22c55e', '{"tareas_completadas_minimo":1}',   5),
  ('consistente',          'Consistente',          'Completá 10 tareas',                                  'CheckCheck','#0ea5e9', '{"tareas_completadas_minimo":10}',  20),
  ('pro',                  'Pro',                  'Completá 100 tareas',                                 'Award',     '#f59e0b', '{"tareas_completadas_minimo":100}', 100),
  ('maestro',              'Maestro',              'Completá 500 tareas',                                 'Crown',     '#a855f7', '{"tareas_completadas_minimo":500}', 500),
  ('super_responsable',    'Super responsable',    'Completá tareas en SLA por 30 días seguidos',         'ShieldCheck','#16a34a', '{"streak_sla_dias":30}',           150),
  ('tutor',                'Tutor',                'Verificó 50 tareas correctamente',                    'GraduationCap','#0891b2','{"tareas_verificadas_minimo":50}', 75),
  ('madrugador',           'Madrugador',           'Completá 5 tareas antes de las 9 AM',                 'Sunrise',   '#fbbf24', '{"completadas_antes_9am":5}',      25),
  ('nocturno',             'Nocturno',             'Completá 5 tareas después de las 21 hs',              'Moon',      '#6366f1', '{"completadas_despues_21":5}',     25),
  ('limpieza_perfecta',    'Limpieza perfecta',    'Completá 30 tareas de la categoría limpieza',         'Sparkle',   '#06b6d4', '{"tareas_categoria":{"limpieza":30}}', 50),
  ('compliance',           'Compliance total',     'Completá todas las regulatorias del mes',             'FileCheck', '#ef4444', '{"compliance_mes":true}',          80)
on conflict (codigo) do nothing;
