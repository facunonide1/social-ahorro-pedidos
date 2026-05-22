-- ============================================================================
-- 0034_ia_prompt_verificacion.sql · F6.5.6 Diferencial 1 — verificación visual
--
-- Agrega columnas a tipos_tareas para habilitar verificación visual por IA
-- y seedea prompts para los tipos con foto (limpieza, cadena de frío, apertura).
-- ============================================================================

alter table public.tipos_tareas
  add column if not exists ia_prompt_verificacion text,
  add column if not exists verificacion_ia boolean not null default false;

-- Seed: cada tipo con foto recibe su prompt de evaluación visual
update public.tipos_tareas set verificacion_ia = true,
  ia_prompt_verificacion = 'Analizá esta foto del baño. Aprobada si: 1) el piso está limpio sin rastros visibles, 2) el lavabo no tiene manchas, 3) el espejo está sin manchas. Rechazada si hay basura visible, líquidos derramados, o evidente suciedad.'
where codigo = 'limpieza_banos' or nombre ilike '%limpieza de baños%';

update public.tipos_tareas set verificacion_ia = true,
  ia_prompt_verificacion = 'Analizá la foto del local. Aprobada si: góndolas ordenadas, piso limpio, sin productos fuera de lugar. Rechazada si hay desorden evidente, productos caídos, o suciedad.'
where codigo = 'limpieza_local' or nombre ilike '%limpieza del local%';

update public.tipos_tareas set verificacion_ia = true,
  ia_prompt_verificacion = 'Analizá la foto del termómetro. Detectá la temperatura mostrada. Aprobada si está entre 2°C y 8°C. Rechazada si está fuera del rango.'
where codigo = 'control_cadena_frio' or nombre ilike '%cadena de frío%';

update public.tipos_tareas set verificacion_ia = true,
  ia_prompt_verificacion = 'Verificá que la foto muestra el frente del local abierto, con cartel de horario visible o luces encendidas.'
where codigo = 'apertura_sucursal' or nombre ilike '%apertura de sucursal%';
