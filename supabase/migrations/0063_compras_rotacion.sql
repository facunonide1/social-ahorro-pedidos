-- ============================================================================
-- 0063 · FIX COMPRAS — motor de rotación desde ventas reales (ventas_diarias)
-- ----------------------------------------------------------------------------
-- Compras recomienda QUÉ comprar usando las ventas diarias por SKU del Centro
-- de Datos (ventas_diarias) + el stock actual (stock_items) + el catálogo. Es
-- on-demand (siempre fresco) y respeta el selector de sucursal (p_sucursal null
-- = consolidado de todas).
--
-- Devuelve el universo de productos que vendieron en la ventana O tienen stock,
-- con los agregados crudos. La clasificación / cantidad sugerida / tendencia se
-- calculan en TS (lib/compras/recomendaciones.ts).
-- ============================================================================

create or replace function public.compras_rotacion(
  p_sucursal uuid default null,
  p_dias int default 14
)
returns table (
  producto_id uuid,
  sku text,
  nombre text,
  rubro text,
  vendido numeric,            -- unidades vendidas en la ventana
  dias_con_venta bigint,      -- días distintos con venta
  ultima_venta date,
  stock_actual numeric,       -- stock total (en scope)
  precio_costo numeric,
  precio_venta numeric,
  ventas_mensuales jsonb      -- {mes_act, ant_1..6} para la tendencia
)
language sql stable as $$
  with v as (
    select pc.id as producto_id,
           sum(vd.cantidad) as vendido,
           count(distinct vd.fecha) as dias_con_venta,
           max(vd.fecha) as ultima_venta
    from public.ventas_diarias vd
    join public.productos_catalogo pc on pc.sku = vd.sku
    where (p_sucursal is null or vd.sucursal_id = p_sucursal)
      and vd.fecha >= current_date - greatest(p_dias, 1)
    group by pc.id
  ),
  s as (
    select producto_id, sum(cantidad) as stock_actual
    from public.stock_items
    where (p_sucursal is null or sucursal_id = p_sucursal)
    group by producto_id
  )
  select pc.id, pc.sku, pc.nombre, pc.rubro,
         coalesce(v.vendido, 0) as vendido,
         coalesce(v.dias_con_venta, 0) as dias_con_venta,
         v.ultima_venta,
         coalesce(s.stock_actual, 0) as stock_actual,
         coalesce(pc.precio_costo_promedio, pc.precio_sugerido, 0) as precio_costo,
         coalesce(pc.precio_sugerido, 0) as precio_venta,
         pc.ventas_mensuales
  from public.productos_catalogo pc
  left join v on v.producto_id = pc.id
  left join s on s.producto_id = pc.id
  where pc.activo
    and (coalesce(v.vendido, 0) > 0 or coalesce(s.stock_actual, 0) > 0);
$$;

grant execute on function public.compras_rotacion(uuid, int) to authenticated;
alter function public.compras_rotacion(uuid, int) set search_path = public;
