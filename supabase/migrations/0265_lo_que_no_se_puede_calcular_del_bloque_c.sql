-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0265 · C.7 · LO QUE NO SE PUEDE CALCULAR                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Un solo lugar que junta todo lo que este bloque no puede saber, con cuantos
-- casos y que lo encenderia. Sin esto, cada funcion dice lo suyo y nadie ve
-- el conjunto — y el conjunto es lo que contesta «¿cuanto de esto puedo
-- creer?».

CREATE OR REPLACE FUNCTION public.canal_lo_que_no_se_puede_calcular()
 RETURNS TABLE(que text, cuantos integer, el_numero text, que_lo_enciende text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'El IVA no se puede separar',
         null::integer,
         'el catálogo no trae alícuota por producto y el precio publicado es final',
         'cargar la alícuota por producto o por rubro. Mientras tanto todo el bloque trabaja con el precio final y lo dice'

  union all
  select 'Productos sin costo cargado',
         (select count(*)::integer from productos_catalogo
           where activo and not es_demo and precio_costo_promedio is null),
         'sin costo no hay resultado: esos productos no entran en ninguna cuenta de margen',
         'que el costo entre con el maestro de SIFACO o con las facturas de compra'

  union all
  select 'Comisiones sin confirmar',
         (select count(*)::integer from canales_venta where activo and not comision_confirmada),
         (select string_agg(format('%s %s%%', nombre, comision_pct), ' · ')
            from canales_venta where activo and not comision_confirmada),
         'una liquidación real de cada plataforma. Hasta entonces el número se usa y se dice que no está confirmado'

  union all
  select 'El costo del envío',
         (select count(*)::integer from zonas),
         case when (select count(*) from zonas) = 0
              then 'no hay zonas de reparto cargadas, así que el envío es un número declarado del canal y no el real'
              else format('hay %s zonas cargadas, pero ningún pedido tiene costo real de envío registrado',
                          (select count(*) from zonas)) end,
         'registrar el costo real por envío en el pedido, o cargar el costo por zona'

  union all
  select 'Pedidos que no son ventas',
         (select count(*)::integer from canal_ventas_extremas()),
         (select coalesce(string_agg(format('%s por $%s', cliente, plata_texto(total)), ' · '), 'ninguno')
            from canal_ventas_extremas()),
         'nada: se marcan solos con el criterio de la mediana y quedan separados de los totales, no borrados'

  union all
  select 'Items que no cruzan con el catálogo',
         (select count(*)::integer from (
            select 1 from orders o, jsonb_array_elements(o.items) it
             where not exists (
               select 1 from canal_publicaciones cp
                where cp.canal_id = coalesce(o.canal_externo_id, o.origin::text)
                  and upper(btrim(cp.nombre)) = upper(btrim(it ->> 'name')))) z),
         'orders.items trae product_id en 0 (es el id de Woo, no el de NORA), así que el cruce es por nombre',
         'que el canal informe el SKU en cada línea del pedido'

  union all
  select 'Canales sin catálogo cargado',
         (select count(*)::integer from canales_venta where activo and not catalogo_cargado),
         (select coalesce(string_agg(nombre, ' · '), 'ninguno')
            from canales_venta where activo and not catalogo_cargado),
         'subir el catálogo de cada plataforma por el importador del bloque H';
$function$
;
revoke all on function public.canal_lo_que_no_se_puede_calcular() from public, anon, authenticated;
grant execute on function public.canal_lo_que_no_se_puede_calcular() to service_role;
