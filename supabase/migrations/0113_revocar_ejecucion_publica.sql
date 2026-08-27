-- 0113 · Las funciones de v0.81 no son de acceso público (v0.81)
--
-- Las tres funciones de 0111 y 0112 son SECURITY DEFINER, y en este proyecto
-- eso las publica como RPC para `anon` y `authenticated`. Dos de ellas leen
-- cualquier tabla por nombre; la tercera ESCRIBE `crons_calculo` al evaluar.
-- Nadie tiene que poder llamarlas desde afuera: a `demo_heredar` la invoca un
-- trigger, y a las otras dos el cliente admin, que va con `service_role`.
--
-- El linter lo marcó como seis WARN nuevos en la misma sesión que las creó.
-- Salieron en la corrida de cierre, no en una auditoría de dentro de tres meses.

revoke execute on function public.demo_heredar() from public, anon, authenticated;
revoke execute on function public.demo_fuente_es_demo(text, uuid) from public, anon, authenticated;
revoke execute on function public.cron_calculo_puede_correr(text) from public, anon, authenticated;

grant execute on function public.demo_fuente_es_demo(text, uuid) to service_role;
grant execute on function public.cron_calculo_puede_correr(text) to service_role;
