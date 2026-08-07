-- ============================================================================
-- 0084 · Normalización única para el matching de items (v0.54)
-- ============================================================================
-- doc_items_alias.descripcion_norm existe para buscar por similitud con el
-- índice trigram. Si la normalización se implementa en dos lugares distintos
-- —uno al escribir, otro al buscar— y difieren en un solo detalle, EL ÍNDICE NO
-- SIRVE PARA NADA y el matching falla en silencio, sin dar error.
--
-- Por eso hay UNA sola implementación y vive en la base. TypeScript no
-- reimplementa esto: llama por RPC.
-- ============================================================================

create extension if not exists unaccent;

-- ----------------------------------------------------------------------------
-- doc_normalizar_texto(txt) — la única normalización válida del proyecto.
-- ----------------------------------------------------------------------------
--   1. minúsculas
--   2. quitar acentos (unaccent)
--   3. todo lo que no sea letra/número/espacio → espacio
--   4. colapsar espacios múltiples
--   5. trim
--
-- IMMUTABLE es lo que permite usarla en columnas generadas e índices. Requiere
-- que unaccent() se invoque de forma inmutable: se llama con el diccionario
-- explícito (regconfig-like) porque unaccent(text) a secas es STABLE.
create or replace function public.doc_normalizar_texto(txt text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(txt, ''))),
          '[^a-z0-9 ]+', ' ', 'g'
        ),
        ' {2,}', ' ', 'g'
      )
    ),
    ''
  )
$$;

comment on function public.doc_normalizar_texto(text) is
  'Única normalización de texto para matching de items. Se usa al ESCRIBIR '
  'descripcion_norm y al BUSCAR. No reimplementar en TypeScript: llamar por RPC.';

-- ----------------------------------------------------------------------------
-- descripcion_norm pasa a llenarse SIEMPRE con esa función.
-- ----------------------------------------------------------------------------
-- Se usa un trigger y no una columna generada porque una generated column
-- obligaría a recrear el índice GIN y a bloquear la tabla; además el trigger
-- deja escribir descripcion_norm explícitamente en un backfill si hiciera falta.
create or replace function public.doc_items_alias_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.descripcion_norm := public.doc_normalizar_texto(new.descripcion_tercero);
  return new;
end
$$;

drop trigger if exists doc_items_alias_norm on public.doc_items_alias;
create trigger doc_items_alias_norm
  before insert or update of descripcion_tercero on public.doc_items_alias
  for each row execute function public.doc_items_alias_normalizar();

-- La tabla está vacía hoy, pero el backfill deja la migración reejecutable y
-- correcta si alguna vez corre sobre datos existentes.
update public.doc_items_alias
set descripcion_norm = public.doc_normalizar_texto(descripcion_tercero)
where descripcion_norm is distinct from public.doc_normalizar_texto(descripcion_tercero);

-- ----------------------------------------------------------------------------
-- Búsqueda por similitud. El término entra por la MISMA función.
-- ----------------------------------------------------------------------------
-- Devuelve los alias de un tercero ordenados por similitud trigram. Si se pasa
-- p_tercero_id null, busca en todos los terceros (peor señal: cada uno escribe
-- distinto, por eso lo normal es acotar).
create or replace function public.doc_buscar_alias(
  p_texto      text,
  p_tercero_id uuid default null,
  p_limite     int  default 10,
  p_min_sim    real default 0.3
)
returns table (
  id            uuid,
  item_id       uuid,
  descripcion_tercero text,
  descripcion_norm    text,
  tercero_id    uuid,
  similitud     real
)
language sql
stable
set search_path = ''
as $$
  with q as (select public.doc_normalizar_texto(p_texto) as t)
  select a.id, a.item_id, a.descripcion_tercero, a.descripcion_norm, a.tercero_id,
         similarity(a.descripcion_norm, q.t) as similitud
  from public.doc_items_alias a, q
  where a.activo
    and a.tenant_id = public.doc_tenant_actual()
    and (p_tercero_id is null or a.tercero_id = p_tercero_id)
    and q.t is not null
    and similarity(a.descripcion_norm, q.t) >= p_min_sim
  order by similitud desc, a.veces_usado desc
  limit greatest(p_limite, 1)
$$;

comment on function public.doc_buscar_alias(text, uuid, int, real) is
  'Busca alias por similitud trigram. Normaliza el término con doc_normalizar_texto: '
  'misma función que llenó descripcion_norm, si no el índice no sirve.';
