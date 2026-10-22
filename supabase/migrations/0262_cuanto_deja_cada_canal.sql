-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0262 · CUANTO DEJA CADA CANAL                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El bloque que mas plata mueve, y el que mas cosas no puede saber. Las dos
-- afirmaciones conviven: cada numero lleva su punto de procedencia y los que
-- no se pueden calcular lo dicen en vez de aparecer en cero.
--
-- ── LO QUE SE PUDO MEDIR Y LO QUE NO ────────────────────────────────────────
--
-- `orders.items` es un jsonb de `{qty, name, price, product_id}` y
-- **`product_id` vale 0 en los 225 items**: es el id de WooCommerce, no el de
-- NORA. Asi que el costo de lo vendido no se puede sacar por id.
--
-- Se cruza por NOMBRE contra el catalogo del mismo canal, que es el unico
-- camino que hay: 209 de 225 cruzan (93%). Los 16 que no, se dicen.
--
-- ── EL IVA ──────────────────────────────────────────────────────────────────
--
-- No se puede desagregar. El catalogo no trae alicuota por producto y en
-- Argentina el precio publicado es final. Una venta de $16.766 puede tener
-- $2.910 de IVA al 21% o $1.519 al 10,5%, y la diferencia cambia el resultado.
--
-- **No se estima.** Todo el bloque trabaja con el precio final y lo declara.
-- Partir el IVA con una alicuota supuesta daria un resultado con dos decimales
-- construido sobre una adivinanza.

CREATE OR REPLACE FUNCTION public.canal_desglose_pedido(p_order uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (select * from orders where id = p_order),
  canal as (
    select cv.* from canales_venta cv, o
     where cv.id = coalesce(o.canal_externo_id, o.origin::text)
        or (o.canal_externo_id is null and cv.id = o.origin::text)
     limit 1
  ),
  items as (
    select (it ->> 'name') as nombre,
           coalesce((it ->> 'qty')::numeric, 1) as qty,
           coalesce((it ->> 'price')::numeric, 0) as precio
      from o, jsonb_array_elements(o.items) it
  ),
  -- El cruce por nombre contra el catalogo del canal: `product_id` viene en 0.
  costeado as (
    select i.*,
           (select p.precio_costo_promedio::numeric
              from canal_publicaciones cp
              join productos_catalogo p on p.id = cp.producto_id
             where cp.canal_id = (select id from canal)
               and upper(btrim(cp.nombre)) = upper(btrim(i.nombre))
             limit 1) as costo_unitario
      from items i
  ),
  n as (
    select
      sum(qty * precio) as venta,
      sum(qty * costo_unitario) filter (where costo_unitario is not null) as costo,
      count(*) as items,
      count(*) filter (where costo_unitario is not null) as items_costeados,
      sum(qty * precio) filter (where costo_unitario is null) as venta_sin_costear
    from costeado
  )
  select jsonb_build_object(
    'pedido', (select id from o),
    'canal', (select nombre from canal),
    'canal_id', (select id from canal),

    'venta', round(coalesce(n.venta, 0), 2),
    'comision_pct', (select comision_pct from canal),
    'comision', round(coalesce(n.venta, 0) * (select comision_pct from canal) / 100.0, 2),
    'impuesto_pct', (select impuesto_pct from canal),
    'impuesto', round(coalesce(n.venta, 0) * (select impuesto_pct from canal) / 100.0, 2),

    -- El envio: lo cobrado menos lo que costo. Si el costo real no esta, se
    -- usa el del canal y se declara que es el declarado, no el real.
    'envio_lo_paga', (select envio_lo_paga from canal),
    'envio_cobrado', coalesce((select envio_cobrado from o), 0),
    'envio_costo', coalesce((select envio_costo_real from o), (select costo_envio from canal), 0),
    'envio_de_donde', case
      when (select envio_costo_real from o) is not null then 'el costo real de este envio'
      when (select costo_envio from canal) > 0 then 'el costo declarado del canal, no el real de este envio'
      else 'no hay costo de envio cargado para este canal' end,

    'costo_de_lo_vendido', round(coalesce(n.costo, 0), 2),
    'items', n.items,
    'items_costeados', n.items_costeados,

    'resultado', round(
      coalesce(n.venta, 0)
      - coalesce(n.venta, 0) * (select comision_pct from canal) / 100.0
      - coalesce(n.venta, 0) * (select impuesto_pct from canal) / 100.0
      - coalesce(n.costo, 0)
      + coalesce((select envio_cobrado from o), 0)
      - coalesce((select envio_costo_real from o), (select costo_envio from canal), 0), 2),
    'resultado_pct', case when coalesce(n.venta, 0) > 0 then round(100.0 * (
      coalesce(n.venta, 0)
      - coalesce(n.venta, 0) * (select comision_pct from canal) / 100.0
      - coalesce(n.venta, 0) * (select impuesto_pct from canal) / 100.0
      - coalesce(n.costo, 0)
      + coalesce((select envio_cobrado from o), 0)
      - coalesce((select envio_costo_real from o), (select costo_envio from canal), 0)
    ) / n.venta, 1) end,

    -- C.7 · cada cosa que no se puede saber, dicha.
    'que_no_se_sabe', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select 'el IVA no se puede separar: el catálogo no trae alícuota por producto y el precio publicado es final. Todo este desglose trabaja con el precio final' as x
        union all
        select format('%s de los %s items no se pudieron costear (por $%s de venta): el nombre no cruza con ningún producto del catálogo del canal',
                      n.items - n.items_costeados, n.items,
                      plata_texto(coalesce(n.venta_sin_costear, 0)))
         where n.items_costeados < n.items
        union all
        select format('la comisión del %s%% no está confirmada contra una liquidación: %s',
                      (select comision_pct from canal),
                      coalesce((select comision_de_donde from canal), 'no quedó dicho de dónde sale'))
         where not (select comision_confirmada from canal)
        union all
        select 'el costo del envío es el declarado del canal, no el real de este envío'
         where (select envio_costo_real from o) is null
           and (select costo_envio from canal) > 0
      ) z)
  )
  from n;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_mismo_pedido_en_otros(p_order uuid)
 RETURNS TABLE(canal_id text, canal text, es_el_canal_real boolean, venta numeric, comision numeric, costo numeric, envio_costo numeric, resultado numeric, resultado_pct numeric, contra_el_mostrador numeric, que_no_se_sabe text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (select * from orders where id = p_order),
  canal_real as (select coalesce((select canal_externo_id from o), (select origin::text from o)) as id),
  items as (
    select (it ->> 'name') as nombre,
           coalesce((it ->> 'qty')::numeric, 1) as qty
      from o, jsonb_array_elements(o.items) it
  ),
  -- El precio de mostrador y el costo, una sola vez: son del producto, no del
  -- canal. Lo que cambia por canal es el recargo.
  base as (
    select i.nombre, i.qty,
           (select p.precio_sugerido::numeric
              from canal_publicaciones cp join productos_catalogo p on p.id = cp.producto_id
             where cp.canal_id = (select id from canal_real)
               and upper(btrim(cp.nombre)) = upper(btrim(i.nombre)) limit 1) as mostrador,
           (select p.precio_costo_promedio::numeric
              from canal_publicaciones cp join productos_catalogo p on p.id = cp.producto_id
             where cp.canal_id = (select id from canal_real)
               and upper(btrim(cp.nombre)) = upper(btrim(i.nombre)) limit 1) as costo
      from items i
  ),
  por_canal as (
    select cv.id, cv.nombre, cv.comision_pct, cv.impuesto_pct,
           cv.margen_extra_pct, cv.costo_envio, cv.envio_lo_paga,
           cv.comision_confirmada, cv.comision_de_donde,
           sum(b.qty * b.mostrador * (1 + cv.margen_extra_pct / 100.0)) as venta,
           sum(b.qty * b.costo) as costo,
           count(*) as items,
           count(b.mostrador) as con_precio,
           count(b.costo) as con_costo
      from canales_venta cv cross join base b
     where cv.activo
     group by cv.id, cv.nombre, cv.comision_pct, cv.impuesto_pct,
              cv.margen_extra_pct, cv.costo_envio, cv.envio_lo_paga,
              cv.comision_confirmada, cv.comision_de_donde
  ),
  calculado as (
    select pc.*,
           round(coalesce(pc.venta, 0) * pc.comision_pct / 100.0, 2) as comision_m,
           case when pc.envio_lo_paga = 'negocio' then coalesce(pc.costo_envio, 0) else 0 end as envio_m
      from por_canal pc
  ),
  con_resultado as (
    select c.*,
      round(coalesce(c.venta, 0) - c.comision_m
            - coalesce(c.venta, 0) * c.impuesto_pct / 100.0
            - coalesce(c.costo, 0) - c.envio_m, 2) as res
      from calculado c
  )
  select
    cr.id, cr.nombre, cr.id = (select id from canal_real),
    round(coalesce(cr.venta, 0), 2), cr.comision_m, round(coalesce(cr.costo, 0), 2),
    cr.envio_m, cr.res,
    case when coalesce(cr.venta, 0) > 0 then round(100.0 * cr.res / cr.venta, 1) end,
    -- Contra el mostrador: el numero que contesta «conviene o no».
    cr.res - (select res from con_resultado where id = 'mostrador'),
    nullif(concat_ws(' · ',
      case when cr.con_precio < cr.items
           then format('%s de %s items sin precio de mostrador: no se pueden valuar en ningún canal',
                       cr.items - cr.con_precio, cr.items) end,
      case when cr.con_costo < cr.items
           then format('%s de %s items sin costo cargado', cr.items - cr.con_costo, cr.items) end,
      case when not cr.comision_confirmada
           then format('la comisión del %s%% no está confirmada: %s',
                       cr.comision_pct, coalesce(cr.comision_de_donde, 'sin origen declarado')) end,
      case when cr.envio_lo_paga = 'negocio' and coalesce(cr.costo_envio, 0) = 0
           then 'el envío lo paga el negocio y no hay costo de envío cargado: el resultado está sobreestimado' end
    ), '')
  from con_resultado cr
  order by cr.res desc;
$function$
;
revoke all on function public.canal_desglose_pedido(uuid) from public, anon, authenticated;
revoke all on function public.canal_mismo_pedido_en_otros(uuid) from public, anon, authenticated;
grant execute on function public.canal_desglose_pedido(uuid) to service_role;
grant execute on function public.canal_mismo_pedido_en_otros(uuid) to service_role;
