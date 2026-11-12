-- Rollback de 0297: el cerebro vuelve a correr cada minuto, como en la 0288.

select cron.unschedule(jobid) from cron.job where jobname = 'cerebro-estado';

select cron.schedule('cerebro-estado', '* * * * *', $cron$select public.cerebro_calcular()$cron$);

comment on function public.cerebro_calcular() is
  'v1.5-cerebro · A.4 · junta agentes, sucursales, lo que espera y la actividad '
  'en la fila de cerebro_snapshot. Lo corre pg_cron cada minuto. NO se llama '
  'desde una pantalla.';
