-- ============================================================================
-- 0059 · CENTRO DE DATOS — agregación de ventas diarias (fuente fina)
-- Funciones para ranking de más vendidos y comparativa entre sucursales,
-- consumidas por Ventas diarias, Operaciones/Análisis y Compras/faltantes.
-- ============================================================================

-- Ranking de más vendidos en un rango (opcionalmente por sucursal).
create or replace function public.cd_ranking_vendidos(
  p_sucursal uuid default null,
  p_desde date default null,
  p_hasta date default null,
  p_limit int default 50
)
returns table (
  sku text, descripcion text, producto_id uuid,
  cantidad numeric, monto numeric, dias bigint
)
language sql stable as $$
  select v.sku,
         max(v.descripcion) as descripcion,
         (array_agg(v.producto_id) filter (where v.producto_id is not null))[1] as producto_id,
         sum(v.cantidad) as cantidad,
         sum(v.monto) as monto,
         count(distinct v.fecha) as dias
  from public.ventas_diarias v
  where (p_sucursal is null or v.sucursal_id = p_sucursal)
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
  group by v.sku
  order by sum(v.cantidad) desc
  limit greatest(p_limit, 1);
$$;

-- Totales por sucursal en un rango (comparativa).
create or replace function public.cd_totales_sucursal(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  sucursal_id uuid, nombre text,
  unidades numeric, monto numeric, lineas bigint, dias bigint
)
language sql stable as $$
  select v.sucursal_id,
         max(s.nombre) as nombre,
         sum(v.cantidad) as unidades,
         sum(v.monto) as monto,
         count(*) as lineas,
         count(distinct v.fecha) as dias
  from public.ventas_diarias v
  join public.sucursales s on s.id = v.sucursal_id
  where (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
  group by v.sucursal_id
  order by sum(v.monto) desc;
$$;

-- Resumen general en un rango (KPIs).
create or replace function public.cd_resumen_ventas(
  p_sucursal uuid default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (
  unidades numeric, monto numeric, productos bigint, lineas bigint, dias bigint
)
language sql stable as $$
  select coalesce(sum(v.cantidad),0) as unidades,
         coalesce(sum(v.monto),0) as monto,
         count(distinct v.sku) as productos,
         count(*) as lineas,
         count(distinct v.fecha) as dias
  from public.ventas_diarias v
  where (p_sucursal is null or v.sucursal_id = p_sucursal)
    and (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta);
$$;

grant execute on function public.cd_ranking_vendidos(uuid, date, date, int) to authenticated;
grant execute on function public.cd_totales_sucursal(date, date) to authenticated;
grant execute on function public.cd_resumen_ventas(uuid, date, date) to authenticated;

-- search_path fijo (advisor function_search_path_mutable). No son SECURITY
-- DEFINER → respetan la RLS de ventas_diarias.
alter function public.cd_ranking_vendidos(uuid, date, date, int) set search_path = public;
alter function public.cd_totales_sucursal(date, date) set search_path = public;
alter function public.cd_resumen_ventas(uuid, date, date) set search_path = public;
