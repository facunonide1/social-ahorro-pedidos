-- ============================================================================
-- 0091 · Tipos de aviso de conciliación (v0.57)
-- ============================================================================
-- Mismo criterio que 0089: tipos propios en vez de meterlos dentro de
-- 'sugerencia_general'. Una diferencia de conciliación se va a querer filtrar
-- y medir aparte — cuántas veces avisamos y cuántas se recuperó la plata.
-- ============================================================================

do $$
declare
  v text;
  nuevos text[] := array['conciliacion_diferencia','conciliacion_nc_pendiente'];
begin
  foreach v in array nuevos loop
    if not exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'nora_aviso_tipo' and e.enumlabel = v
    ) then
      execute format('alter type public.nora_aviso_tipo add value %L', v);
    end if;
  end loop;
end $$;
