-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0268 · MIL FILAS EXACTAS ES EL CORTE, NO EL RESULTADO                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La prueba de C.5 dijo:
--
--   ok  las 1000 proyecciones dicen el supuesto que las hace válidas
--   --  1000 productos dejarían menos que en el mostrador; 1000 perderían plata
--
-- Mil redondo tres veces seguidas no es un resultado: es el corte de
-- PostgREST. La funcion devuelve **49.576** y por la API llegaron 1.000, sin
-- error y sin aviso.
--
-- Es el mismo error que este proyecto persigue desde la v0.98 y que tiene un
-- auditor dedicado — pero **el auditor mira el codigo TypeScript y no ve los
-- RPC**. Una funcion de la base que devuelve cincuenta mil filas se corta
-- igual, y ningun auditor lo estaba mirando.
--
-- ── LA SOLUCION NO ES PAGINAR ───────────────────────────────────────────────
--
-- Nadie va a mirar 49.576 filas. Lo que hace falta son las peores y el total
-- de verdad, que son dos cosas distintas y se piden por separado:
--
--   · `canal_producto_no_conviene(canal, limite)` · las peores, acotado, y
--     con `de_cuantos_es_este` en cada fila
--   · `canal_no_conviene_resumen()` · los totales, contados en la base
--
-- Un listado que no dice que esta cortado es la forma mas barata de que
-- alguien crea que vio todo.

drop function if exists public.canal_producto_no_conviene(text);

CREATE OR REPLACE FUNCTION public.canal_producto_no_conviene(p_canal text DEFAULT NULL::text, p_limite integer DEFAULT 200)
 RETURNS TABLE(canal_id text, canal text, producto_id uuid, sku text, nombre text, precio_mostrador numeric, costo numeric, precio_en_el_canal numeric, queda_para_el_negocio numeric, resultado_mostrador numeric, diferencia numeric, vende_3m numeric, plata_al_ano_si_se_vendiera_todo_ahi numeric, pierde_plata boolean, medido_o_proyectado text, hecho text, el_supuesto text, de_cuantos_es_este integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cv as (
    select * from canales_venta
     where activo and tipo <> 'mostrador'
       and (p_canal is null or id = p_canal)
  ),
  universo as (
    select cv.id as canal_id, cv.nombre as canal, cv.comision_pct,
           cv.margen_extra_pct, cv.costo_envio, cv.envio_lo_paga,
           cv.catalogo_cargado, cv.comision_confirmada,
           p.id as producto_id, p.sku, p.nombre_comercial,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo
      from cv
      join productos_catalogo p
        on p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
     where (not cv.catalogo_cargado)
        or exists (select 1 from canal_publicaciones cp
                    where cp.canal_id = cv.id and cp.producto_id = p.id
                      and cp.estado = 'publish')
  ),
  calc as (
    select u.*,
      coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                 where v.producto_id = u.producto_id
                   and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m,
      round(u.mostrador * (1 + u.margen_extra_pct / 100.0), 2) as precio_canal,
      round(u.mostrador * (1 + u.margen_extra_pct / 100.0) * (1 - u.comision_pct / 100.0)
            - u.costo
            - case when u.envio_lo_paga = 'negocio' then coalesce(u.costo_envio, 0) else 0 end, 2) as queda,
      round(u.mostrador - u.costo, 2) as en_mostrador
      from universo u
  ),
  peores as (
    select c.* from calc c where c.queda < c.en_mostrador
  )
  select p.canal_id, p.canal, p.producto_id, p.sku, p.nombre_comercial,
         p.mostrador, p.costo, p.precio_canal, p.queda, p.en_mostrador,
         round(p.queda - p.en_mostrador, 2),
         p.vende_3m,
         case when p.vende_3m > 0
              then round((p.queda - p.en_mostrador) * p.vende_3m / 3.0 * 12, 2) end,
         p.queda < 0,
         case when p.catalogo_cargado then 'medido' else 'proyectado' end,
         format('%s%s en %s: se cobraría $%s y quedarían $%s después de la comisión del %s%% y el costo de $%s, contra $%s en el mostrador. Son $%s menos por unidad.%s',
                case when p.catalogo_cargado then '' else 'PROYECTADO — ' end,
                p.nombre_comercial, p.canal,
                plata_texto(p.precio_canal), plata_texto(p.queda),
                p.comision_pct, plata_texto(p.costo), plata_texto(p.en_mostrador),
                plata_texto(abs(p.queda - p.en_mostrador)),
                case when p.queda < 0
                     then ' Y no es que deje menos: pierde plata en cada unidad.' else '' end),
         case when p.vende_3m > 0 then
           format('la plata al año supone que las %s unidades que este producto vende cada 3 meses pasarían a venderse POR ESTE CANAL. Hoy no pasa: la tienda propia tiene 7.737 productos publicados y 21 pedidos. Lo que sí se puede afirmar sin supuestos son los $%s menos por unidad%s',
                  round(p.vende_3m), plata_texto(abs(p.queda - p.en_mostrador)),
                  case when p.queda < 0 then ' y que el resultado es negativo' else '' end)
         else
           'no se proyecta plata al año: este producto no registra venta en 3 meses'
         end,
         -- De cuantos es este. Sin esto, un listado cortado se lee como completo.
         (select count(*)::integer from peores)
    from peores p
   order by case when p.queda < 0 then 0 else 1 end,
            case when p.vende_3m > 0
                 then (p.queda - p.en_mostrador) * p.vende_3m else 0 end,
            p.queda - p.en_mostrador
   limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_no_conviene_resumen()
 RETURNS TABLE(canal_id text, canal text, medido_o_proyectado text, productos integer, pierden_plata integer, peor_diferencia_por_unidad numeric, plata_al_ano_si_se_vendiera_todo_ahi numeric, el_supuesto text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cv as (select * from canales_venta where activo and tipo <> 'mostrador'),
  universo as (
    select cv.id as canal_id, cv.nombre as canal, cv.comision_pct,
           cv.margen_extra_pct, cv.costo_envio, cv.envio_lo_paga,
           cv.catalogo_cargado,
           p.id as producto_id,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo
      from cv
      join productos_catalogo p
        on p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
     where (not cv.catalogo_cargado)
        or exists (select 1 from canal_publicaciones cp
                    where cp.canal_id = cv.id and cp.producto_id = p.id
                      and cp.estado = 'publish')
  ),
  calc as (
    select u.*,
      coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                 where v.producto_id = u.producto_id
                   and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m,
      round(u.mostrador * (1 + u.margen_extra_pct / 100.0) * (1 - u.comision_pct / 100.0)
            - u.costo
            - case when u.envio_lo_paga = 'negocio' then coalesce(u.costo_envio, 0) else 0 end, 2) as queda,
      round(u.mostrador - u.costo, 2) as en_mostrador
      from universo u
  )
  select c.canal_id, c.canal,
         case when c.catalogo_cargado then 'medido' else 'proyectado' end,
         count(*)::integer,
         count(*) filter (where c.queda < 0)::integer,
         round(min(c.queda - c.en_mostrador), 2),
         round(sum((c.queda - c.en_mostrador) * c.vende_3m / 3.0 * 12)
                 filter (where c.vende_3m > 0), 2),
         case when c.catalogo_cargado
              then 'medido sobre lo que está publicado'
              else 'PROYECTADO: el canal no tiene catálogo cargado y el total supone que toda la venta de hoy pasaría a ese canal. No va a pasar — la tienda propia tiene 7.737 productos publicados y 21 pedidos'
         end
    from calc c
   where c.queda < c.en_mostrador
   group by c.canal_id, c.canal, c.catalogo_cargado
   order by 7;
$function$
;
revoke all on function public.canal_producto_no_conviene(text, integer) from public, anon, authenticated;
revoke all on function public.canal_no_conviene_resumen() from public, anon, authenticated;
grant execute on function public.canal_producto_no_conviene(text, integer) to service_role;
grant execute on function public.canal_no_conviene_resumen() to service_role;
