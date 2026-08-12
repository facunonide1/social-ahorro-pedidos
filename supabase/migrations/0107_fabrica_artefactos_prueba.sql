-- ═══════════════════════════════════════════════════════════════════════════
-- ARTEFACTOS DE PRUEBA — v0.75
--
-- Segunda vez que hubo que limpiar con SQL a mano lo que generaron las propias
-- pruebas: los 14 eventos 'FALLBACK' de v0.70, y las propuestas rechazadas de
-- las corridas fallidas de v0.74, que además bloqueaban el cambio real por la
-- regla de dos rechazos con la misma huella.
--
-- Un sistema que no puede limpiar lo que sus pruebas crean acumula ruido que
-- después alguien lee como dato. Y el ruido de una prueba es peor que otro
-- ruido: tiene la misma forma que el dato real, porque lo generó el mismo
-- código.
--
-- LA MARCA VA AL CREAR, NO AL TERMINAR. Una corrida que se muere a la mitad
-- nunca llega al final, y esas son justamente las que dejan huérfanos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.fab_propuestas            add column if not exists es_prueba boolean not null default false;
alter table public.fab_procedencia           add column if not exists es_prueba boolean not null default false;
alter table public.fab_lector_eventos        add column if not exists es_prueba boolean not null default false;
alter table public.fab_lector_cambios        add column if not exists es_prueba boolean not null default false;
alter table public.fab_verificaciones        add column if not exists es_prueba boolean not null default false;
alter table public.fab_defectos_pieza        add column if not exists es_prueba boolean not null default false;
alter table public.fab_pedidos_construccion  add column if not exists es_prueba boolean not null default false;
alter table public.fab_chat_turnos           add column if not exists es_prueba boolean not null default false;
alter table public.fab_pool_versiones        add column if not exists es_prueba boolean not null default false;
alter table public.fab_instalacion_versiones add column if not exists es_prueba boolean not null default false;

comment on column public.fab_propuestas.es_prueba is
  'La creó un script de prueba. Nunca cuenta como dato real y se puede borrar.';
comment on column public.fab_pool_versiones.es_prueba is
  'La escribió un script de prueba. Se puede borrar SALVO que sea es_actual: '
  'una versión vigente no se borra aunque haya nacido de una prueba, porque es '
  'la que gobierna.';

-- Los índices son parciales: lo marcado es la minoría y lo que se busca.
create index if not exists fab_propuestas_prueba_idx  on public.fab_propuestas(es_prueba) where es_prueba;
create index if not exists fab_procedencia_prueba_idx on public.fab_procedencia(es_prueba) where es_prueba;
create index if not exists fab_versiones_prueba_idx   on public.fab_pool_versiones(es_prueba) where es_prueba;

-- ── Los dos escritores aceptan la marca ────────────────────────────────────
-- Se recrean con el parámetro al final y con default false: todo lo que ya
-- llamaba a estas funciones sigue llamando igual y sigue escribiendo dato real.

create or replace function public.fab_escribir_version(
  p_pool_id     uuid,
  p_manifiesto  jsonb,
  p_motivo      text,
  p_autor       uuid,
  p_revierte_a  uuid default null,
  p_prueba      boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero  int;
  v_nueva   uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Un cambio de declaración necesita un motivo escrito.';
  end if;
  if p_manifiesto is null or p_manifiesto = '{}'::jsonb then
    raise exception 'El manifiesto está vacío.';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from public.fab_pool_versiones where pool_id = p_pool_id;

  update public.fab_pool_versiones
  set es_actual = false, updated_at = now()
  where pool_id = p_pool_id and es_actual;

  insert into public.fab_pool_versiones
    (pool_id, version, numero, manifiesto, estado, modo, notas_cambio,
     es_actual, revierte_a, publicada_at, created_by, es_prueba)
  values
    (p_pool_id, 'v' || v_numero, v_numero, p_manifiesto, 'publicada', 'espejo',
     p_motivo, true, p_revierte_a, now(), p_autor, coalesce(p_prueba, false))
  returning id into v_nueva;

  update public.fab_instalaciones
  set version_id = v_nueva, updated_at = now()
  where pool_id = p_pool_id;

  return v_nueva;
end;
$$;

create or replace function public.fab_escribir_override(
  p_instalacion_id uuid,
  p_overrides      jsonb,
  p_motivo         text,
  p_autor          uuid,
  p_revierte_a     uuid default null,
  p_prueba         boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero int;
  v_nueva  uuid;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Un cambio de instalación necesita un motivo escrito.';
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from public.fab_instalacion_versiones where instalacion_id = p_instalacion_id;

  update public.fab_instalacion_versiones
  set es_actual = false
  where instalacion_id = p_instalacion_id and es_actual;

  insert into public.fab_instalacion_versiones
    (instalacion_id, numero, overrides, es_actual, notas_cambio, revierte_a,
     created_by, es_prueba)
  values
    (p_instalacion_id, v_numero, coalesce(p_overrides, '{}'::jsonb), true,
     p_motivo, p_revierte_a, p_autor, coalesce(p_prueba, false))
  returning id into v_nueva;

  update public.fab_instalaciones set updated_at = now() where id = p_instalacion_id;
  return v_nueva;
end;
$$;

-- Las viejas firmas de 5 argumentos quedarían como sobrecarga y una llamada
-- posicional podría caer en cualquiera de las dos. Se borran.
drop function if exists public.fab_escribir_version(uuid, jsonb, text, uuid, uuid);
drop function if exists public.fab_escribir_override(uuid, jsonb, text, uuid, uuid);

revoke all on function public.fab_escribir_version(uuid, jsonb, text, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.fab_escribir_override(uuid, jsonb, text, uuid, uuid, boolean) from public, anon, authenticated;

-- ── La limpieza ────────────────────────────────────────────────────────────
--
-- Borra lo marcado. Devuelve cuántas filas por tabla, para que quien la corra
-- pueda decir qué borró en vez de "listo".
--
-- REGLA: no se borra nada que esté vigente. Una versión `es_actual` o un
-- override `es_actual` gobiernan hoy; borrarlos dejaría al pool sin declaración
-- y al lector cayendo al código sin que nadie lo haya decidido. Se informan
-- aparte como "marcadas y vigentes".

create or replace function public.fab_limpiar_pruebas()
returns table (tabla text, borradas bigint, vigentes bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n bigint;
  v bigint;
begin
  delete from public.fab_procedencia where es_prueba;          get diagnostics n = row_count;
  tabla := 'fab_procedencia';          borradas := n; vigentes := 0; return next;

  delete from public.fab_propuestas where es_prueba;           get diagnostics n = row_count;
  tabla := 'fab_propuestas';           borradas := n; vigentes := 0; return next;

  delete from public.fab_lector_eventos where es_prueba;       get diagnostics n = row_count;
  tabla := 'fab_lector_eventos';       borradas := n; vigentes := 0; return next;

  delete from public.fab_lector_cambios where es_prueba;       get diagnostics n = row_count;
  tabla := 'fab_lector_cambios';       borradas := n; vigentes := 0; return next;

  delete from public.fab_verificaciones where es_prueba;       get diagnostics n = row_count;
  tabla := 'fab_verificaciones';       borradas := n; vigentes := 0; return next;

  delete from public.fab_defectos_pieza where es_prueba;       get diagnostics n = row_count;
  tabla := 'fab_defectos_pieza';       borradas := n; vigentes := 0; return next;

  delete from public.fab_pedidos_construccion where es_prueba; get diagnostics n = row_count;
  tabla := 'fab_pedidos_construccion'; borradas := n; vigentes := 0; return next;

  delete from public.fab_chat_turnos where es_prueba;          get diagnostics n = row_count;
  tabla := 'fab_chat_turnos';          borradas := n; vigentes := 0; return next;

  select count(*) into v from public.fab_pool_versiones where es_prueba and es_actual;
  delete from public.fab_pool_versiones where es_prueba and not es_actual;
  get diagnostics n = row_count;
  tabla := 'fab_pool_versiones';       borradas := n; vigentes := v; return next;

  select count(*) into v from public.fab_instalacion_versiones where es_prueba and es_actual;
  delete from public.fab_instalacion_versiones where es_prueba and not es_actual;
  get diagnostics n = row_count;
  tabla := 'fab_instalacion_versiones'; borradas := n; vigentes := v; return next;
end;
$$;

revoke all on function public.fab_limpiar_pruebas() from public, anon, authenticated;

comment on function public.fab_limpiar_pruebas is
  'Borra los artefactos marcados como de prueba. No toca lo vigente: una '
  'versión es_actual gobierna, aunque haya nacido de una prueba.';
