-- ============================================================================
-- 0095 · FÁBRICA NORA · lector de esquema para el comparador (v0.58)
-- ============================================================================
-- El comparador de espejo tiene que poder responder dos preguntas sobre el
-- código real, no sobre lo que la declaración dice:
--
--   1. ¿Existen las tablas que el manifiesto declara?
--   2. ¿Hay tablas del sector que el manifiesto NO declara?
--
-- Sin la segunda pregunta el comparador sólo verifica en un sentido, y una
-- declaración incompleta pasa todas las verificaciones. Ese es el modo de falla
-- más caro: la fábrica cree que sabe y no sabe.
--
-- FRONTERA: estas funciones LEEN el catálogo de Postgres. No escriben nada, no
-- alteran nada, y viven en el namespace fab_*. La fábrica lee Social Ahorro;
-- jamás le escribe.
-- ============================================================================

/** Cuáles de estos nombres existen como tabla o vista en public. */
create or replace function public.fab_tablas_existentes(p_nombres text[])
returns table (tabla text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','v','m','p')
    and c.relname = any(p_nombres);
$$;

/** Todas las tablas de public que empiezan con alguno de estos prefijos. */
create or replace function public.fab_tablas_con_prefijo(p_prefijos text[])
returns table (tabla text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and exists (select 1 from unnest(p_prefijos) p where c.relname like p || '%')
  order by 1;
$$;

-- Postgres otorga EXECUTE a PUBLIC por default; sobre SECURITY DEFINER eso es
-- una puerta abierta. Se cierra y se abre sólo para authenticated, que es quien
-- corre el comparador desde el portal.
revoke all on function public.fab_tablas_existentes(text[])  from public, anon, authenticated;
revoke all on function public.fab_tablas_con_prefijo(text[]) from public, anon, authenticated;
grant execute on function public.fab_tablas_existentes(text[])  to authenticated;
grant execute on function public.fab_tablas_con_prefijo(text[]) to authenticated;
