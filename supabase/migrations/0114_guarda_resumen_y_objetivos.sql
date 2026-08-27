-- 0114 · Dos crons más que guardaban histórico sobre datos inventados (v0.81)
--
-- 0112 frenó los cuatro que decía el informe. Al revisar los otros doce con el
-- mismo criterio —¿produce un número que se GUARDA?— aparecieron dos más:
--
--   · resumen-diario le pasa las métricas a Claude con la frase "estas son las
--     métricas reales del ERP de hoy" y archiva el markdown por fecha. Sobre
--     7.620 ventas que no ocurrieron, eso es un relato ejecutivo falso, escrito
--     con seguridad y guardado con fecha. Es el peor de los seis.
--   · calcular-objetivos califica a cada empleado por sus tareas y guarda el
--     score por período. Doce de las veinte tareas son de demostración.
--
-- El resto de los doce no guarda histórico, o depende de tablas de
-- configuración vacías y no hace nada. Está clasificado en el reporte de v0.81.

insert into public.crons_calculo (cron, fuentes, motivo) values
  ('resumen-diario', array['ventas_diarias','facturas_proveedor','irregularidades_stock'],
   'Le pasa las metricas a Claude con el texto "estas son las metricas reales del ERP" y guarda el markdown por fecha. Sobre 7620 ventas inventadas, produce un relato ejecutivo falso, firmado y archivado.'),
  ('calcular-objetivos', array['tareas'],
   'Calcula el score de objetivos de cada empleado a partir de sus tareas y lo guarda por periodo. Con tareas de demostracion en el medio, califica gente con trabajo que no hizo.')
on conflict (cron) do nothing;
