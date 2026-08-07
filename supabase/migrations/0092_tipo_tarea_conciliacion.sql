-- ============================================================================
-- 0092 · Tipo de tarea para el control de conciliaciones (v0.57)
-- ============================================================================
-- Regla de oro 5: lo que queda abierto tiene que llegarle a alguien. Sin este
-- tipo, la función que genera la tarea de control no encuentra a qué tipo
-- asociarla y devuelve 0 en silencio — la bandeja se convertiría en un
-- cementerio de casos que nadie mira.
-- ============================================================================

insert into public.tipos_tareas (
  codigo, nombre, categoria, prioridad_default, requiere_aprobacion,
  niveles_workflow, evidencia_requerida, campos_custom, es_auto_generable,
  permite_recurrencia, notificar_creacion, notificar_vencimiento,
  dias_alerta_previa, puntos_completar, activo, verificacion_ia, alcance,
  verificacion_humana
)
select
  'CONTROL_CONCILIACION',
  'Resolver diferencia de conciliación',
  'compras', 'alta', false,
  1, '[]'::jsonb, '[]'::jsonb, true,
  false, true, true,
  1, 0, true, false, 'global',
  -- No pide verificación de un tercero: se cierra cuando se reclama o se cierra
  -- la conciliación, y eso ya queda auditado del lado de Compras.
  false
where not exists (select 1 from public.tipos_tareas where codigo = 'CONTROL_CONCILIACION');
