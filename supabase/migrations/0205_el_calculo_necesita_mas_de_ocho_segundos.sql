-- 0205 · El rol `authenticator` tiene statement_timeout = 8s y `service_role`
-- no lo pisa, así que el cálculo del resumen (~20 s) se cancelaba también para
-- el cron. El tope va en la función, que es donde se sabe cuánto tarda.
--
-- Lo que LEEN las pantallas sigue entrando holgado en los 8 s: leen una fila.
alter function public.agentes_resumen_calcular(uuid) set statement_timeout to '120s';
alter function public.agentes_resumen_refrescar() set statement_timeout to '300s';
