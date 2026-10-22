-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0263 · UN PEDIDO DE $82 MILLONES NO ES UNA VENTA                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El primer desglose dio esto:
--
--   venta $82.133.989 · costo $661.613 · resultado 99,2%
--
-- Un margen del 99% no es un margen: es una señal de que algo no es lo que
-- parece. El pedido tiene **198 items** y el cliente se llama **«correccion
-- productos»**. Es una carga de correccion que alguien hizo desde la tienda,
-- no una venta. El segundo pedido mas grande es de $53.425.
--
-- ── POR QUE NO SE EXCLUYE POR EL NOMBRE ─────────────────────────────────────
--
-- Seria facil filtrar por «correccion» y seria una regla inventada para un
-- caso. La proxima carga de prueba se va a llamar distinto.
--
-- El criterio que se usa **ya existe en el proyecto**: es el de B.4 de la
-- v1.3 —mediana y rango intercuartil— que se escribio para los comprobantes
-- de proveedor por el mismo motivo.
--
-- ── Y NO SE BORRA NI SE ESCONDE ─────────────────────────────────────────────
--
-- Se marca. Los totales por mes se dan con y sin los extremos, y la
-- diferencia se ve. Excluir algo de un total sin decirlo es la forma mas
-- rapida de que nadie entienda un numero.

CREATE OR REPLACE FUNCTION public.canal_ventas_extremas()
 RETURNS TABLE(order_id uuid, canal_id text, canal text, fecha date, total numeric, items integer, cliente text, mediana_del_canal numeric, veces numeric, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select coalesce(o.canal_externo_id, o.origin::text) as canal_id,
           (percentile_cont(0.5) within group (order by o.total))::numeric as mediana,
           (percentile_cont(0.75) within group (order by o.total))::numeric as q3,
           (percentile_cont(0.25) within group (order by o.total))::numeric as q1,
           count(*) as n
      from orders o
     where o.total > 0
     group by 1
    having count(*) >= 5
  )
  select o.id, b.canal_id, coalesce(cv.nombre, b.canal_id),
         o.created_at::date, o.total::numeric,
         jsonb_array_length(o.items), o.customer_name,
         round(b.mediana, 2),
         case when b.mediana > 0 then round(o.total::numeric / b.mediana, 1) end,
         format('es %s veces la mediana de $%s de los %s pedidos de ese canal. El umbral es el tercer cuartil más tres veces el rango intercuartil ($%s): es el mismo criterio que usa el detector de montos de proveedor, y por el mismo motivo — con el promedio, un solo pedido grande hace que después nada parezca raro.',
                case when b.mediana > 0 then round(o.total::numeric / b.mediana, 1) else 0 end,
                plata_texto(b.mediana), b.n, plata_texto(b.q3 + 3 * (b.q3 - b.q1)))
    from orders o
    join base b on b.canal_id = coalesce(o.canal_externo_id, o.origin::text)
    left join canales_venta cv on cv.id = b.canal_id
   where b.q3 > b.q1
     and o.total > b.q3 + 3 * (b.q3 - b.q1)
   order by o.total desc;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_resultado_por_mes(p_meses integer DEFAULT 12)
 RETURNS TABLE(canal_id text, canal text, mes text, pedidos integer, venta numeric, comision numeric, costo numeric, resultado numeric, resultado_pct numeric, pedidos_extremos integer, venta_de_los_extremos numeric, que_no_se_sabe text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with extremos as (select order_id from canal_ventas_extremas()),
  pedidos as (
    select o.id,
           coalesce(o.canal_externo_id, o.origin::text) as canal_id,
           to_char(o.created_at, 'YYYY-MM') as mes,
           o.total::numeric as total,
           (o.id in (select order_id from extremos)) as es_extremo,
           -- El costo de lo vendido, cruzando por nombre como en C.1.
           (select sum(coalesce((it ->> 'qty')::numeric, 1) *
                       coalesce((select p.precio_costo_promedio::numeric
                                   from canal_publicaciones cp
                                   join productos_catalogo p on p.id = cp.producto_id
                                  where cp.canal_id = coalesce(o.canal_externo_id, o.origin::text)
                                    and upper(btrim(cp.nombre)) = upper(btrim(it ->> 'name'))
                                  limit 1), 0))
              from jsonb_array_elements(o.items) it) as costo
      from orders o
     where o.created_at >= date_trunc('month', current_date) - make_interval(months => p_meses)
       and o.total > 0
  ),
  agrupado as (
    select p.canal_id, p.mes,
           count(*) filter (where not p.es_extremo)::integer as n,
           sum(p.total) filter (where not p.es_extremo) as venta,
           sum(p.costo) filter (where not p.es_extremo) as costo,
           count(*) filter (where p.es_extremo)::integer as n_extremos,
           sum(p.total) filter (where p.es_extremo) as venta_extremos
      from pedidos p
     group by 1, 2
  )
  select a.canal_id, coalesce(cv.nombre, a.canal_id), a.mes,
         a.n, round(coalesce(a.venta, 0), 2),
         round(coalesce(a.venta, 0) * coalesce(cv.comision_pct, 0) / 100.0, 2),
         round(coalesce(a.costo, 0), 2),
         round(coalesce(a.venta, 0)
               - coalesce(a.venta, 0) * coalesce(cv.comision_pct, 0) / 100.0
               - coalesce(a.costo, 0), 2),
         case when coalesce(a.venta, 0) > 0 then round(100.0 * (
           coalesce(a.venta, 0)
           - coalesce(a.venta, 0) * coalesce(cv.comision_pct, 0) / 100.0
           - coalesce(a.costo, 0)) / a.venta, 1) end,
         a.n_extremos, round(coalesce(a.venta_extremos, 0), 2),
         nullif(concat_ws(' · ',
           case when a.n_extremos > 0 then
             format('%s pedidos por $%s quedaron afuera por salirse de lo habitual del canal. No se borraron: están acá al lado',
                    a.n_extremos, plata_texto(a.venta_extremos)) end,
           'el IVA no se separa: el catálogo no trae alícuota por producto',
           case when not coalesce(cv.comision_confirmada, false)
                then format('la comisión del %s%% no está confirmada', coalesce(cv.comision_pct, 0)) end
         ), '')
    from agrupado a
    left join canales_venta cv on cv.id = a.canal_id
   order by a.mes desc, a.canal_id;
$function$
;
revoke all on function public.canal_ventas_extremas() from public, anon, authenticated;
revoke all on function public.canal_resultado_por_mes(integer) from public, anon, authenticated;
grant execute on function public.canal_ventas_extremas() to service_role;
grant execute on function public.canal_resultado_por_mes(integer) to service_role;
