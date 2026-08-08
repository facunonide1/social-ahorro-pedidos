-- ============================================================================
-- 0098 · FÁBRICA NORA · el escritor (v0.63)
-- ============================================================================
-- Hasta acá la fábrica gobernaba pero no se podía arreglar en caliente. Un
-- título mal declarado exigía un deploy: el manifiesto vivía en código y la
-- tabla se sembraba con un script. El flag apagaba, pero no corregía.
--
-- Esta migración invierte la relación: LA TABLA MANDA. El código conserva una
-- copia como semilla del arranque en frío, nada más.
--
-- Las tres reglas del versionado, y por qué son innegociables:
--
--   1. NUNCA se edita una versión en lugar. Cada escritura crea una nueva.
--      Editar en lugar destruye la única prueba de qué decía antes.
--   2. La versión anterior queda intacta y consultable.
--   3. Revertir CREA una versión nueva con el contenido de la vieja. No borra.
--      Si revertir borrara la versión mala, se pierde el registro de que
--      existió y de qué rompió — que es justo lo que hay que mirar después.
--
-- FRONTERA: sólo tablas fab_*.
-- ============================================================================

alter table public.fab_pool_versiones
  add column if not exists numero int,
  add column if not exists es_actual boolean not null default false,
  /** Si esta versión nació de un revert, a cuál volvió. */
  add column if not exists revierte_a uuid references public.fab_pool_versiones(id) on delete set null;

comment on column public.fab_pool_versiones.numero is
  'Correlativo por pool. Es el número que se muestra; `version` queda como etiqueta.';
comment on column public.fab_pool_versiones.es_actual is
  'La que gobierna hoy. Exactamente una por pool.';
comment on column public.fab_pool_versiones.revierte_a is
  'Si nació de un revert, a qué versión volvió. Revertir es avanzar hacia atrás, no deshacer.';

-- Las declaraciones que ya existían pasan a ser la versión 1 y la actual.
update public.fab_pool_versiones set numero = 1 where numero is null;
update public.fab_pool_versiones v set es_actual = true
where v.estado = 'publicada'
  and not exists (
    select 1 from public.fab_pool_versiones o
    where o.pool_id = v.pool_id and o.es_actual
  );

-- UNA sola versión actual por pool. Es una invariante del modelo, no una
-- convención: dos versiones actuales significan que el lector elige al azar.
create unique index if not exists fab_pool_versiones_actual_unica
  on public.fab_pool_versiones(pool_id) where es_actual;

create index if not exists fab_pool_versiones_historial_idx
  on public.fab_pool_versiones(pool_id, numero desc);

-- ============================================================================
-- El escritor
-- ============================================================================
-- Escribir la versión nueva, bajar la anterior y apuntar la instalación es UNA
-- transacción. Si fuera tres updates desde la aplicación, una caída en el medio
-- dejaría al pool sin versión actual — y el lector caería al código sin que
-- nadie hubiera pedido eso.
--
-- El motivo es obligatorio ACÁ, no sólo en la interfaz: un cambio sin motivo
-- escrito no se puede entender seis meses después, y la interfaz no es el único
-- camino a esta función.

create or replace function public.fab_escribir_version(
  p_pool_id     uuid,
  p_manifiesto  jsonb,
  p_motivo      text,
  p_autor       uuid,
  p_revierte_a  uuid default null
)
returns uuid
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

  -- Primero se baja la anterior: el índice único no admite dos actuales, así
  -- que el orden importa.
  update public.fab_pool_versiones
  set es_actual = false, updated_at = now()
  where pool_id = p_pool_id and es_actual;

  insert into public.fab_pool_versiones
    (pool_id, version, numero, manifiesto, estado, modo, notas_cambio,
     es_actual, revierte_a, publicada_at, created_by)
  values
    (p_pool_id, 'v' || v_numero, v_numero, p_manifiesto, 'publicada', 'espejo',
     p_motivo, true, p_revierte_a, now(), p_autor)
  returning id into v_nueva;

  -- La instalación apunta a la versión que gobierna. Que quede desincronizada
  -- haría que el portal muestre una versión y el lector use otra.
  update public.fab_instalaciones
  set version_id = v_nueva, updated_at = now()
  where pool_id = p_pool_id;

  return v_nueva;
end;
$$;

revoke all on function public.fab_escribir_version(uuid, jsonb, text, uuid, uuid)
  from public, anon, authenticated;

comment on function public.fab_escribir_version is
  'Crea una versión nueva y la deja como actual, en una sola transacción. Nunca edita en lugar. Motivo obligatorio.';
