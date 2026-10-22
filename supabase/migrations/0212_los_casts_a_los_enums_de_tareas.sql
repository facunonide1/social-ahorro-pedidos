-- 0212 · Nota de corrección, sin cuerpo propio.
--
-- Las dos funciones que crean tareas (`convenio_presentacion_enviar` en 0209 y
-- `convenio_debito_tarea` en 0210) armaban el estado, la prioridad y el tipo
-- de asignación con un `case ... end`, que devuelve text. Las columnas de
-- `tareas` son enums y Postgres no castea un `case` implícitamente:
--
--   column "estado" is of type tarea_estado but expression is of type text
--
-- Lo encontró `scripts/prueba-convenios.ts` en su primera corrida: el envío de
-- la presentación devolvía undefined y la tarea de control no se creaba. Sin
-- esa prueba, el circuito se habría visto entero hasta que alguien intentara
-- enviar una presentación de verdad.
--
-- **Los casts están corregidos dentro de 0209 y 0210**, que son
-- `create or replace`: una reproducción desde cero aplica la versión buena.
-- Este archivo existe sólo porque la corrección se aplicó a la base como una
-- migración aparte y los números no se reusan.
--
-- Lo único que ejecuta son los revokes, que nunca están de más: es la cuarta
-- vez en este proyecto que un `create or replace` restituye EXECUTE a PUBLIC.

revoke all on function public.convenio_presentacion_enviar(uuid, date) from public, anon;
revoke all on function public.convenio_debito_tarea(uuid) from public, anon;
grant execute on function public.convenio_presentacion_enviar(uuid, date) to authenticated, service_role;
grant execute on function public.convenio_debito_tarea(uuid) to authenticated, service_role;
