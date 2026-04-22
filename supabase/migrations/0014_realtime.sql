-- =====================================================================
-- Habilitar Supabase Realtime en orders para push-notifications en vivo
-- =====================================================================
-- Agregamos la tabla a la publication usada por Realtime.
-- Si ya estaba (p.ej. por configuración previa), do nothing.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
