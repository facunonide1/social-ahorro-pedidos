-- ============================================================================
-- 0084b · Normalización en lote (v0.54)
-- ============================================================================
-- Se aplicó junto con 0084; el archivo faltaba en el repo.
--
-- Existe para que el cliente NUNCA tenga excusa de reimplementar la lógica de
-- normalización por performance: normalizar 20k descripciones es un round-trip,
-- no 20k.
-- ============================================================================

create or replace function public.doc_normalizar_lote(txts text[])
returns text[]
language sql immutable parallel safe
set search_path = ''
as $$
  select array(select public.doc_normalizar_texto(t) from unnest(coalesce(txts, '{}')) as t)
$$;

comment on function public.doc_normalizar_lote(text[]) is
  'Normaliza N textos en una llamada usando doc_normalizar_texto. Para uso desde TypeScript por RPC.';
