-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0249 · «ENVIO ZONA 1» NO ES UN PRODUCTO                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La cola de descripciones, ordenada por venta, puso quinto a esto:
--
--   «Envío» · ENVIO ZONA 1 · 2.305 unidades en 3 meses
--
-- No es un producto: es un cargo de envio que SIFACO factura como si fuera un
-- articulo. Y el sistema ya lo sabia — `productos_catalogo.es_producto` y
-- `no_producto_motivo` existen desde antes, con el motivo escrito:
--
--   «concepto interno de SIFACO, no un articulo: el nombre es un movimiento
--    de caja o un servicio»
--
-- La cola no lo estaba mirando. Es la forma mas comun de error en este
-- proyecto: el dato existe, alguien ya resolvio el problema, y la consulta
-- nueva no lo consulta.
--
-- Describir un cargo de envio no es «no se puede»: es que no corresponde. Por
-- eso sale de la cola y no pasa a `no_se_puede` — la lista de lo que no se
-- pudo describir tiene que tener solo productos.
--
-- Este es el cuerpo final de `descripciones_cola`.

create or replace function public.descripciones_cola(p_limite integer default 50)
returns table (
  producto_id uuid, sku text, nombre_canal text, nombre_sifaco text,
  laboratorio text, presentacion text, rubro text, categoria text,
  unidades_3m numeric, stock numeric, plata_parada numeric,
  por_que_este text, estado text, texto text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with pub as (
    select distinct cp.producto_id, cp.nombre as nombre_canal, cp.sku
      from canal_publicaciones cp
     where cp.producto_id is not null
  ),
  con_datos as (
    select pub.*, p.nombre_comercial, p.laboratorio, p.presentacion,
           p.rubro, p.categoria::text as categoria, p.precio_costo_promedio,
           coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                      where v.producto_id = pub.producto_id
                        and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as unidades_3m,
           coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                      where ps.producto_id = pub.producto_id
                        and ps.sucursal_id is not null), 0)::numeric as stock
      from pub
      join productos_catalogo p on p.id = pub.producto_id
      -- `es_producto` ya existia y la cola no lo miraba. Un cargo de envio no
      -- se describe, y tampoco va a la lista de lo que no se pudo describir:
      -- esa lista tiene que tener solo productos.
     where coalesce(p.es_producto, true)
  )
  select c.producto_id, c.sku, c.nombre_canal, c.nombre_comercial,
         c.laboratorio, c.presentacion, c.rubro, c.categoria,
         c.unidades_3m, c.stock,
         case when c.precio_costo_promedio is not null
              then round(c.stock * c.precio_costo_promedio, 2) end,
         case when c.unidades_3m > 0
              then format('vendió %s unidades en 3 meses. No hay registro de vistas en el canal, así que el orden es por venta: un producto muy visto que no se vende sería el que más necesita una descripción, y eso no se puede saber todavía',
                          round(c.unidades_3m))
              when c.precio_costo_promedio is not null and c.stock > 0
              then format('no registra venta en 3 meses y tiene $%s de stock parado. Una descripción es lo más barato que se puede probar',
                          plata_texto(c.stock * c.precio_costo_promedio))
              else 'no registra venta ni stock. Va al final de la cola' end,
         coalesce(d.estado, 'sin_describir'),
         d.texto
    from con_datos c
    left join producto_descripciones d on d.producto_id = c.producto_id
   where d.producto_id is null or d.estado = 'propuesta'
   order by c.unidades_3m desc,
            coalesce(c.stock * c.precio_costo_promedio, 0) desc,
            c.nombre_canal
   limit p_limite;
$$;

comment on function public.descripciones_cola(integer) is
  'F.3 · Los que faltan describir, por los que más se venden, y sólo los que '
  'son productos: `es_producto` ya existía y la cola no lo miraba — «ENVIO '
  'ZONA 1» salía quinto con 2.305 unidades. El pedido decía «los más vistos» '
  'y no hay registro de vistas: el proxy es la venta y se dice.';

revoke all on function public.descripciones_cola(integer) from public, anon;
grant execute on function public.descripciones_cola(integer) to authenticated, service_role;
