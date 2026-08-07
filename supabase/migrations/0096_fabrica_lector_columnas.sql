-- ============================================================================
-- 0096 · FÁBRICA NORA · lector de columnas para el comparador (v0.59)
-- ============================================================================
-- El manifiesto declara `campos_sensibles`: qué columnas de una entidad tienen
-- dato personal, para que quien exporta sepa qué tapar.
--
-- Una lista de columnas sensibles que nombra una columna inexistente es PEOR
-- que no tener lista: da la confianza de haber cubierto el campo sin cubrirlo.
-- Al declarar Clientes, tres de los seis nombres que puse a ojo no existían.
--
-- FRONTERA: lee el catálogo de Postgres. No escribe nada, no altera nada, vive
-- en el namespace fab_*.
-- ============================================================================

create or replace function public.fab_columnas(p_tablas text[])
returns table (tabla text, columna text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = any(p_tablas);
$$;

revoke all on function public.fab_columnas(text[]) from public, anon, authenticated;
grant execute on function public.fab_columnas(text[]) to authenticated;
