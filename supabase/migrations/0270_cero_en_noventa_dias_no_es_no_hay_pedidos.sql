-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0270 · «CERO EN 90 DIAS» NO ES «NO HAY PEDIDOS»                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `canal_salud()` dio 0 pedidos en los cuatro canales. Y hay 21 — son de
-- abril y mayo, hace seis meses, y la ventana por defecto es de 90 dias.
--
-- El numero era correcto y la lectura era falsa. Un tablero de salud que dice
-- «0 pedidos» sin decir que mira 90 dias hace pensar que el canal esta muerto
-- cuando lo que pasa es que la ventana no los alcanza.
--
-- Es la misma distincion de siempre, un paso mas adentro: **cero dentro de
-- una ventana no es cero**. La ventana es parte del numero y tiene que
-- viajar con el.

drop function if exists public.canal_salud(integer);

CREATE OR REPLACE FUNCTION public.canal_salud(p_dias integer DEFAULT 90)
 RETURNS TABLE(canal_id text, canal text, sucursal text, pedidos integer, cancelados integer, cancelados_pct numeric, cancelados_por_stock integer, cancelados_sin_motivo integer, minutos_preparacion numeric, promete_minutos integer, cumple boolean, rating numeric, cerrado_hasta timestamp with time zone, cerrado_motivo text, responsable text, dias_mirados integer, pedidos_fuera_de_la_ventana integer, que_no_se_puede_medir text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (
    select coalesce(o.canal_externo_id, o.origin::text) as canal_id,
           count(*) filter (where o.created_at >= now() - make_interval(days => p_dias))::integer as pedidos,
           count(*) filter (where o.created_at < now() - make_interval(days => p_dias))::integer as fuera,
           count(*) filter (where o.status = 'cancelado'
                              and o.created_at >= now() - make_interval(days => p_dias))::integer as cancelados,
           count(*) filter (where o.cancelacion_motivo = 'sin_stock'
                              and o.created_at >= now() - make_interval(days => p_dias))::integer as por_stock,
           count(*) filter (where o.status = 'cancelado'
                              and o.cancelacion_motivo = 'sin_declarar'
                              and o.created_at >= now() - make_interval(days => p_dias))::integer as sin_motivo,
           avg(extract(epoch from (o.ready_at - o.confirmed_at)) / 60.0)
             filter (where o.ready_at is not null and o.confirmed_at is not null) as minutos,
           count(*) filter (where o.ready_at is not null and o.confirmed_at is not null)::integer as medibles,
           max(o.created_at) as ultimo
      from orders o
     group by 1
  )
  select cv.id, cv.nombre, s.nombre,
         coalesce(p.pedidos, 0), coalesce(p.cancelados, 0),
         case when coalesce(p.pedidos, 0) > 0
              then round(100.0 * p.cancelados / p.pedidos, 1) end,
         coalesce(p.por_stock, 0), coalesce(p.sin_motivo, 0),
         round(p.minutos, 1), cv.promete_minutos,
         case when p.minutos is not null and cv.promete_minutos is not null
              then p.minutos <= cv.promete_minutos end,
         cv.rating_informado, cv.cerrado_hasta, cv.cerrado_motivo,
         (select e.nombre_completo from empleados e
           where e.user_id = cv.responsable_user_id and e.activo limit 1),
         p_dias, coalesce(p.fuera, 0),
         nullif(concat_ws(' · ',
           -- Primero lo que explica el cero: sin eso lo demas no se lee.
           case when coalesce(p.pedidos, 0) = 0 and coalesce(p.fuera, 0) > 0 then
             format('no hay pedidos en los últimos %s días, pero sí %s más viejos: el último fue el %s. El cero es de la ventana, no del canal',
                    p_dias, p.fuera, p.ultimo::date) end,
           case when coalesce(p.pedidos, 0) = 0 and coalesce(p.fuera, 0) = 0 then
             'este canal no tiene ningún pedido registrado, ni dentro ni fuera de la ventana' end,
           case when coalesce(p.medibles, 0) = 0 then
             'el tiempo de preparación no se puede medir: ningún pedido tiene marcados los dos momentos (cuándo se confirmó y cuándo quedó listo). No es que sea lento, es que nadie los marca' end,
           case when coalesce(p.sin_motivo, 0) > 0 then
             format('%s de las %s cancelaciones no dicen por qué, así que no se puede separar lo que se cayó por falta de stock',
                    p.sin_motivo, p.cancelados) end,
           case when cv.rating_informado is null then
             'el rating no lo informa el canal' end,
           case when cv.horarios is null then
             'no hay horario declarado, así que no se puede decir si estuvo abierto cuando debía' end,
           case when cv.promete_minutos is null then
             'el canal no tiene un tiempo prometido cargado: sin eso el tiempo medido no se puede juzgar' end,
           case when cv.responsable_user_id is null then
             'no tiene responsable declarado: los errores del catálogo quedan sin dueño' end
         ), '')
    from canales_venta cv
    left join p on p.canal_id = cv.id
    left join sucursales s on s.id = cv.sucursal_despacho_id
   where cv.activo
   order by (cv.tipo = 'mostrador') desc, cv.nombre;
$function$
;
comment on function public.canal_salud(integer) is
  'D · La ventana viaja con el numero: «0 pedidos en 90 dias» y «no hay '
  'pedidos» son dos cosas distintas, y la primera sin la ventana se lee como '
  'la segunda. Las cuatro cosas del bloque que hoy no se pueden medir lo '
  'dicen en vez de aparecer vacias.';

revoke all on function public.canal_salud(integer) from public, anon, authenticated;
grant execute on function public.canal_salud(integer) to service_role;
