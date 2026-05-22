-- ============================================================================
-- 0033_niveles_rpg.sql · F6.5.6 Diferencial 3 — sistema de niveles RPG
--
-- Niveles narrativos por puntos acumulados (empleados.score_total).
-- recalcular_nivel_empleado() se llama cada vez que un empleado suma puntos.
-- ============================================================================

create table if not exists public.niveles_empleados (
  id                  uuid primary key default gen_random_uuid(),
  nivel               integer not null unique,
  nombre              text not null,
  titulo_profesional  text not null,
  puntos_necesarios   integer not null,
  icono               text,
  color               text,
  beneficios          jsonb not null default '[]'::jsonb,
  descripcion         text
);

create table if not exists public.empleados_historial_niveles (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   uuid not null references public.empleados(id) on delete cascade,
  nivel_id      uuid not null references public.niveles_empleados(id) on delete restrict,
  nivel         integer not null,
  alcanzado_at  timestamptz not null default now()
);

create index if not exists hist_niveles_empleado_idx
  on public.empleados_historial_niveles(empleado_id, alcanzado_at desc);

alter table public.empleados
  add column if not exists nivel_actual_id uuid references public.niveles_empleados(id) on delete set null;

-- Seed de 9 niveles (re-runnable) -------------------------------------------
insert into public.niveles_empleados (nivel, nombre, titulo_profesional, puntos_necesarios, icono, color, beneficios, descripcion) values
  (1, 'Aprendiz',            'Aprendiz',             0,     'Sprout',   '#94a3b8', '[]'::jsonb, 'Estás empezando tu camino'),
  (2, 'Asistente',           'Asistente',            100,   'UserPlus', '#22c55e', '[]'::jsonb, 'Ya agarraste el ritmo'),
  (3, 'Empleado calificado', 'Empleado calificado',  300,   'BadgeCheck','#10b981', '["Puede aprobar tareas de pares"]'::jsonb, 'Tu trabajo es referencia'),
  (4, 'Especialista',        'Especialista',         700,   'Star',     '#06b6d4', '["Puede aprobar tareas de pares"]'::jsonb, 'Dominás tu área'),
  (5, 'Senior',              'Senior',               1500,  'Award',    '#3b82f6', '["Puede aprobar tareas de pares","Aparece en el hall of fame mensual"]'::jsonb, 'Sos un pilar del equipo'),
  (6, 'Líder',               'Líder',                3000,  'Flame',    '#8b5cf6', '["Aprobar tareas de pares","Hall of fame mensual"]'::jsonb, 'Otros te siguen'),
  (7, 'Mentor',              'Mentor',               5500,  'Compass',  '#a855f7', '["Hall of fame mensual","Puede ser verificador de tareas críticas"]'::jsonb, 'Formás a los demás'),
  (8, 'Maestro',             'Maestro',              9000,  'Crown',    '#d946ef', '["Verificador de tareas críticas","Hall of fame mensual"]'::jsonb, 'Excelencia constante'),
  (9, 'Leyenda',             'Leyenda',              15000, 'Trophy',   '#f59e0b', '["Verificador de tareas críticas","Leyenda permanente del hall of fame anual"]'::jsonb, 'Leyenda de Social Ahorro')
on conflict (nivel) do update set
  nombre = excluded.nombre,
  titulo_profesional = excluded.titulo_profesional,
  puntos_necesarios = excluded.puntos_necesarios,
  icono = excluded.icono,
  color = excluded.color,
  beneficios = excluded.beneficios,
  descripcion = excluded.descripcion;

-- Recálculo de nivel --------------------------------------------------------
create or replace function public.recalcular_nivel_empleado(p_empleado uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score    integer;
  v_actual   uuid;
  v_target   public.niveles_empleados%rowtype;
  v_subio    boolean := false;
begin
  select score_total, nivel_actual_id into v_score, v_actual
  from public.empleados where id = p_empleado;
  if not found then
    return jsonb_build_object('error', 'empleado inexistente');
  end if;

  select * into v_target
  from public.niveles_empleados
  where puntos_necesarios <= coalesce(v_score, 0)
  order by nivel desc
  limit 1;

  if not found then
    return jsonb_build_object('subio', false);
  end if;

  if v_actual is distinct from v_target.id then
    update public.empleados set nivel_actual_id = v_target.id where id = p_empleado;
    -- ¿es una subida (no un recálculo lateral)?
    if not exists (
      select 1 from public.empleados_historial_niveles
      where empleado_id = p_empleado and nivel_id = v_target.id
    ) then
      insert into public.empleados_historial_niveles (empleado_id, nivel_id, nivel)
      values (p_empleado, v_target.id, v_target.nivel);
      v_subio := true;
    end if;
  end if;

  return jsonb_build_object(
    'subio', v_subio,
    'nivel', v_target.nivel,
    'nivel_id', v_target.id,
    'nombre', v_target.nombre,
    'titulo', v_target.titulo_profesional,
    'beneficios', v_target.beneficios
  );
end $$;

grant execute on function public.recalcular_nivel_empleado(uuid) to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.niveles_empleados enable row level security;
alter table public.empleados_historial_niveles enable row level security;

drop policy if exists niveles_read on public.niveles_empleados;
create policy niveles_read on public.niveles_empleados
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );

drop policy if exists hist_niveles_read on public.empleados_historial_niveles;
create policy hist_niveles_read on public.empleados_historial_niveles
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo)
  );
