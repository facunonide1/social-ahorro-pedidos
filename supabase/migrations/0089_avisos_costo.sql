-- ============================================================================
-- 0089 · Tipos de aviso para las alertas de costo (v0.56)
-- ============================================================================
-- `nora_avisos.tipo` es un enum, no texto libre. Las tres reglas de costo
-- necesitan su propio tipo: si se colaran dentro de 'sugerencia_general' no se
-- podrían filtrar en el feed ni medir aparte, que es justo lo que se quiere
-- (cuántas veces avisamos de un aumento y cuántas se actuó).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'nora_aviso_tipo' and e.enumlabel = 'costo_aumento') then
    alter type public.nora_aviso_tipo add value 'costo_aumento';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'nora_aviso_tipo' and e.enumlabel = 'costo_sobre_lista') then
    alter type public.nora_aviso_tipo add value 'costo_sobre_lista';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'nora_aviso_tipo' and e.enumlabel = 'costo_mejor_proveedor') then
    alter type public.nora_aviso_tipo add value 'costo_mejor_proveedor';
  end if;
end $$;
