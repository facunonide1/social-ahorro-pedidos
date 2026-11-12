-- 0297 · El cerebro cada cinco minutos.
--
-- `cerebro_calcular()` (0293) corre por pg_cron cada minuto (0288) con tope de
-- 50 s. Recorre la cadena entera: `bandeja_unica(null, null, 100000)`, que
-- arrastra la vista `decisiones_pendientes`; otra lectura de esa vista para
-- contar por agente; `direccion_por_sucursal`, y group-by sobre
-- `producto_stock_sifaco`, `ventas_diarias` y `tareas`. Un minuto no le alcanza:
-- se pisa con la corrida siguiente, compite con los crons de Vercel y las
-- pantallas, y es la mayor parte de los timeouts por día.
--
-- Esto sólo cambia la frecuencia: 1.440 corridas por día pasan a 288. El cuerpo
-- de la función no se toca. La pantalla del cerebro ya dice «hace N min» y
-- refresca cada minuto contra el snapshot: va a mostrar un dato de hasta cinco.
--
-- NO SE APLICA DESDE ACÁ. Rollback en supabase/rollbacks/0297_….sql.

select cron.unschedule(jobid) from cron.job where jobname = 'cerebro-estado';

select cron.schedule('cerebro-estado', '*/5 * * * *', $cron$select public.cerebro_calcular()$cron$);

comment on function public.cerebro_calcular() is
  'v1.5-cerebro · A.4 · junta agentes, sucursales, lo que espera y la actividad '
  'en la fila de cerebro_snapshot. Lo corre pg_cron cada cinco minutos (0297). '
  'NO se llama desde una pantalla.';
