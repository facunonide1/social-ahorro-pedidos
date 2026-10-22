-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0244 · LOS HECHOS, ESCRITOS EN CASTELLANO                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El informe del bloque E salio asi:
--
--   «AME facturo $26.890.919 en septiembre de 2026... Arabia vendio 867
--    unidades en 2026-09, contra 1263 por mes...»
--
-- Las migraciones de este proyecto se escriben sin acentos para no depender
-- de la codificacion del archivo. Eso esta bien para los comentarios. Pero
-- los `hecho` NO son comentarios: son prosa que una persona lee, y el informe
-- semanal los copia tal cual.
--
-- «facturo» y «facturó» son dos palabras distintas, y la primera no es la que
-- el informe quiere decir. Un informe escrito como lo escribiria alguien que
-- mira el negocio no se escribe sin acentos.
--
-- Tambien se arregla «2026-09», que es un periodo de archivo y no una fecha
-- que alguien diga en voz alta. Y B.1 y C.1 suman el SKU al lado del nombre,
-- por lo mismo que C.2 en la 0235.
--
-- Los comentarios de las migraciones siguen sin acentos. Solo los textos que
-- se leen los llevan.

create or replace function public.periodo_texto(p text)
returns text
language sql
immutable
as $$
  select case when p ~ '^\d{4}-\d{2}$'
              then mes_texto((p || '-01')::date)
              else p end;
$$;

comment on function public.periodo_texto(text) is
  'Un periodo «2026-09» escrito como lo diria alguien: «septiembre de 2026». '
  'Los periodos son claves de archivo, no fechas que se digan en voz alta.';

revoke all on function public.periodo_texto(text) from public, anon;
grant execute on function public.periodo_texto(text) to authenticated, service_role;

create or replace function public.detectar_barras_con_dos_precios(p_veces numeric default 2.0)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with g as (
    select p.codigo_barras,
           count(*) as registros,
           min(p.precio_sugerido)::numeric as menor,
           max(p.precio_sugerido)::numeric as mayor,
           (array_agg(p.id order by p.precio_sugerido))[1] as id_menor,
           (array_agg(p.id order by p.precio_sugerido desc))[1] as id_mayor,
           (array_agg(p.nombre order by p.precio_sugerido))[1] as nombre_menor,
           (array_agg(p.nombre order by p.precio_sugerido desc))[1] as nombre_mayor,
           (array_agg(p.sku order by p.precio_sugerido))[1] as sku_menor,
           (array_agg(p.sku order by p.precio_sugerido desc))[1] as sku_mayor
      from productos_catalogo p
     where p.activo and not p.es_demo
       and p.codigo_barras is not null
       -- Un codigo de verdad tiene 8 digitos (EAN-8) o 13 (EAN-13). Los 3.298
       -- de menos de 8 son productos sin codigo donde alguien puso un numero
       -- para salir del paso, y no son el mismo producto.
       and length(btrim(p.codigo_barras)) >= 8
       and btrim(p.codigo_barras) ~ '^[0-9]+$'
       and p.precio_sugerido is not null and p.precio_sugerido >= 1
     group by p.codigo_barras
    having count(*) > 1
       and max(p.precio_sugerido) / min(p.precio_sugerido) >= p_veces
  ),
  conventa as (
    select g.*,
      coalesce((select sum(v.unidades)::numeric from producto_ventas_sucursal v
                 where v.producto_id in (g.id_menor, g.id_mayor)
                   and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0) as unidades_3m
    from g
  )
  select
    'barras_2precios:' || codigo_barras,
    null::uuid, id_mayor,
    format('El código de barras %s está en %s registros del catálogo: «%s» a $%s y «%s» a $%s. Son %s veces de diferencia.',
           codigo_barras, registros, nombre_menor, plata_texto(menor),
           nombre_mayor, plata_texto(mayor), round(mayor / menor, 1)),
    -- La plata es la diferencia por lo que se vendio en tres meses: es lo que
    -- se cobro de mas o de menos segun cual registro salio al escanear.
    case when unidades_3m > 0 then round((mayor - menor) * unidades_3m, 2) end,
    case when unidades_3m > 0
         then format('la diferencia de $%s por las %s unidades vendidas en 3 meses entre los dos registros. Es lo que se cobró de más o de menos según cuál salió al escanear.',
                     plata_texto(mayor - menor), round(unidades_3m))
         else format('no se puede costear: los dos registros juntos no registran ventas en 3 meses, así que la diferencia de $%s no se multiplicó por nada',
                     plata_texto(mayor - menor)) end,
    jsonb_build_object(
      'codigo_barras', codigo_barras, 'registros', registros,
      'menor', jsonb_build_object('id', id_menor, 'sku', sku_menor, 'nombre', nombre_menor, 'precio', menor),
      'mayor', jsonb_build_object('id', id_mayor, 'sku', sku_mayor, 'nombre', nombre_mayor, 'precio', mayor),
      'veces', round(mayor / menor, 1), 'unidades_3m', unidades_3m)
  from conventa;
$$;

create or replace function public.detectar_comprobante_duplicado()
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with pares as (
    select f.proveedor_id, p.razon_social, f.numero_factura,
           count(*) as veces,
           min(f.total) as menor, max(f.total) as mayor,
           min(f.fecha_emision) as primera, max(f.fecha_emision) as ultima,
           array_agg(f.id order by f.created_at) as ids,
           (array_agg(f.sucursal_id order by f.created_at))[1] as suc
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
     where not f.es_demo
       and f.numero_factura is not null and btrim(f.numero_factura) <> ''
     group by f.proveedor_id, p.razon_social, f.numero_factura
    having count(*) > 1
       and max(f.total) > 0
       and (max(f.total) - min(f.total)) / max(f.total) <= 0.05
  )
  select
    'dup_comprobante:' || proveedor_id::text || ':' || numero_factura,
    suc, null::uuid,
    format('El comprobante %s de %s está cargado %s veces, con montos que difieren menos del 5%%. El primero es del %s y el último del %s.',
           numero_factura, razon_social, veces, primera, ultima),
    round((veces - 1) * mayor, 2),
    format('%s copia(s) de más × $%s cada una. Es lo que está cargado de más, no necesariamente lo que se pagó de más.',
           veces - 1, plata_texto(mayor)),
    jsonb_build_object(
      'proveedor', razon_social, 'numero', numero_factura, 'veces', veces,
      'menor', menor, 'mayor', mayor, 'ids', ids,
      'primera_carga', primera, 'ultima_carga', ultima)
  from pares;
$$;

create or replace function public.detectar_monto_fuera_de_lo_habitual()
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select f.proveedor_id, p.razon_social,
           (percentile_cont(0.5) within group (order by f.total))::numeric as mediana,
           (percentile_cont(0.75) within group (order by f.total))::numeric as q3,
           (percentile_cont(0.25) within group (order by f.total))::numeric as q1,
           count(*) as n
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
     where not f.es_demo and f.total > 0
     group by f.proveedor_id, p.razon_social
    having count(*) >= 5
  ),
  raras as (
    select f.id, b.razon_social, f.numero_factura, f.total::numeric as total,
           f.fecha_emision, f.sucursal_id, b.mediana, b.n,
           b.q3 + 3 * (b.q3 - b.q1) as techo
      from facturas_proveedor f
      join base b on b.proveedor_id = f.proveedor_id
     where not f.es_demo
       and b.q3 > b.q1
       and f.total > b.q3 + 3 * (b.q3 - b.q1)
       and f.fecha_emision >= current_date - 90
  )
  select
    'monto_raro:' || id::text,
    sucursal_id, null::uuid,
    format('El comprobante %s de %s es de $%s. Las %s facturas de ese proveedor tienen una mediana de $%s.',
           coalesce(numero_factura, 'sin número'), razon_social,
           plata_texto(total), n, plata_texto(mediana)),
    round(total - mediana, 2),
    format('$%s de este comprobante menos la mediana de $%s de las %s facturas de ese proveedor. El umbral es el tercer cuartil más tres veces el rango intercuartil ($%s): se usa la mediana y no el promedio porque un solo pedido grande corre el promedio y después nada parece raro.',
           plata_texto(total), plata_texto(mediana), n, plata_texto(techo)),
    jsonb_build_object(
      'factura_id', id, 'proveedor', razon_social, 'numero', numero_factura,
      'total', total, 'mediana', round(mediana, 2), 'techo', round(techo, 2),
      'facturas_del_proveedor', n, 'fecha', fecha_emision)
  from raras;
$$;

create or replace function public.detectar_faltante_sin_nota_credito(p_dias integer default 15)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with decl as (
    select f.id, f.proveedor_id, p.razon_social, f.numero_factura,
           f.sucursal_id, f.fecha_emision, f.faltantes_texto,
           (current_date - f.fecha_emision) as dias,
           (regexp_match(f.faltantes_texto,
             '([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+),([0-9]{2})\s*$'))[1:2] as m
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
     where not f.es_demo
       and f.faltantes_texto is not null and btrim(f.faltantes_texto) <> ''
       and f.tipo_documento <> 'nota_credito'
       and f.fecha_emision <= current_date - p_dias
  ),
  conmonto as (
    select d.*,
      case when d.m is not null
           then (replace(d.m[1], '.', '') || '.' || d.m[2])::numeric end as monto
    from decl d
  ),
  juzgado as (
    select c.*,
      case when c.monto is null then null
           else exists (
             select 1 from facturas_proveedor nc
              where nc.proveedor_id = c.proveedor_id
                and nc.tipo_documento = 'nota_credito'
                and nc.fecha_emision >= c.fecha_emision
                and abs(abs(nc.total) - c.monto) <= c.monto * 0.02
           ) end as llego_nc
    from conmonto c
  )
  select
    'faltante_sin_nc:' || id::text,
    sucursal_id, null::uuid,
    case when monto is null then
      format('El comprobante %s de %s declaró un faltante hace %s días: «%s». No tiene el monto escrito, así que no se puede cruzar con las notas de crédito.',
             coalesce(numero_factura, 'sin número'), razon_social, dias,
             left(faltantes_texto, 120))
    else
      format('El comprobante %s de %s declaró un faltante de $%s hace %s días y no entró ninguna nota de crédito de ese proveedor por ese monto: «%s».',
             coalesce(numero_factura, 'sin número'), razon_social,
             plata_texto(monto), dias, left(faltantes_texto, 120))
    end,
    monto,
    case when monto is null
         then 'no se puede costear: el faltante se escribió a mano y sin monto. Tampoco se puede verificar si llegó la nota de crédito, porque no hay con qué compararla.'
         else format('los $%s que dice el texto del faltante. Se buscó una nota de crédito de %s por ese monto (con 2%% de tolerancia) emitida después del %s y no hay ninguna.',
                     plata_texto(monto), razon_social, fecha_emision) end,
    jsonb_build_object(
      'factura_id', id, 'proveedor', razon_social, 'numero', numero_factura,
      'dias', dias, 'umbral_dias', p_dias, 'texto', faltantes_texto,
      'monto_leido', monto, 'se_pudo_cruzar', monto is not null)
  from juzgado
  where monto is null or not llego_nc;
$$;

create or replace function public.detectar_stock_no_cuadra(
  p_tolerancia_pct numeric default 20,
  p_piso_unidades numeric default 5
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with fotos as (
    select importacion_id, min(leido_at) as leido
      from producto_stock_sifaco where sucursal_id is not null
     group by importacion_id order by min(leido_at) desc limit 2
  ),
  dos as (
    select (array_agg(importacion_id order by leido desc))[1] as nueva,
           (array_agg(importacion_id order by leido desc))[2] as vieja,
           (array_agg(leido order by leido desc))[1] as leido_nueva,
           (array_agg(leido order by leido desc))[2] as leido_vieja
      from fotos
  ),
  comparado as (
    select
      n.producto_id, n.sucursal_id,
      v.stock::numeric as antes, n.stock::numeric as ahora,
      d.leido_vieja, d.leido_nueva,
      coalesce((select sum(pv.unidades)::numeric from producto_ventas_sucursal pv
                 where pv.producto_id = n.producto_id and pv.sucursal_id = n.sucursal_id
                   and pv.periodo >= to_char(d.leido_vieja, 'YYYY-MM')
                   and pv.periodo <= to_char(d.leido_nueva, 'YYYY-MM')), 0) as vendido,
      coalesce((select sum(coalesce(ti.cantidad_recibida, ti.cantidad_enviada,
                                   ti.cantidad_solicitada))::numeric
                  from transferencia_items ti
                  join transferencias_sucursal t on t.id = ti.transferencia_id
                 where ti.producto_id = n.producto_id
                   and t.sucursal_destino_id = n.sucursal_id
                   and t.estado::text in ('recibida', 'completada')
                   and t.fecha_recepcion between d.leido_vieja and d.leido_nueva), 0) as entro,
      coalesce((select sum(coalesce(ti.cantidad_enviada, ti.cantidad_solicitada))::numeric
                  from transferencia_items ti
                  join transferencias_sucursal t on t.id = ti.transferencia_id
                 where ti.producto_id = n.producto_id
                   and t.sucursal_origen_id = n.sucursal_id
                   and t.estado::text in ('recibida', 'completada')
                   and t.fecha_recepcion between d.leido_vieja and d.leido_nueva), 0) as salio
    from dos d
    join producto_stock_sifaco n on n.importacion_id = d.nueva and n.sucursal_id is not null
    join producto_stock_sifaco v on v.importacion_id = d.vieja
                                and v.producto_id = n.producto_id
                                and v.sucursal_id = n.sucursal_id
    where d.vieja is not null
  ),
  dif as (
    select c.*, p.nombre, p.sku, p.precio_costo_promedio::numeric as costo,
           s.nombre as sucursal,
           (c.antes - c.vendido + c.entro - c.salio) as deberia,
           c.ahora - (c.antes - c.vendido + c.entro - c.salio) as diferencia,
           greatest(c.vendido * p_tolerancia_pct / 100.0, p_piso_unidades) as rango
      from comparado c
      join productos_catalogo p on p.id = c.producto_id
      join sucursales s on s.id = c.sucursal_id
  )
  select
    'stock_no_cuadra:' || producto_id::text || ':' || sucursal_id::text,
    sucursal_id, producto_id,
    format('En %s el modelo dice que deberían quedar %s de %s (%s) y hay %s: una diferencia de %s unidades. Había %s el %s, se vendieron %s y %s.',
           sucursal, round(deberia), nombre, sku, round(ahora), round(abs(diferencia)),
           round(antes), leido_vieja::date, round(vendido),
           case when entro = 0 and salio = 0 then 'no hubo transferencias registradas'
                else format('entraron %s y salieron %s por transferencia', round(entro), round(salio)) end),
    case when costo is not null then round(abs(diferencia) * costo, 2) end,
    case when costo is not null
         then format('%s unidades de diferencia × $%s de costo. El rango normal para este producto es ±%s unidades (%s%% de las %s vendidas, con un piso de %s): el stock es una foto y las ventas vienen por mes, así que la cuenta no puede ser exacta.',
                     round(abs(diferencia)), plata_texto(costo),
                     round(rango), p_tolerancia_pct, round(vendido), p_piso_unidades)
         else 'no se puede costear: este producto no tiene costo cargado' end,
    jsonb_build_object(
      'antes', antes, 'ahora', ahora, 'deberia', deberia, 'diferencia', diferencia,
      'vendido', vendido, 'entro', entro, 'salio', salio, 'rango_normal', rango,
      'foto_vieja', leido_vieja, 'foto_nueva', leido_nueva)
  from dif
  where abs(diferencia) > rango;
$$;

create or replace function public.detectar_caja_diferencias_repetidas(
  p_dias integer default 90,
  p_minimo integer default 3
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with a as (
    select ar.sucursal_id, s.nombre as sucursal,
           ct.turno_id,
           coalesce(ts.nombre, 'sin turno declarado') as turno,
           count(*) as veces,
           sum(abs(ar.diferencia_cierre))::numeric as plata,
           avg(abs(ar.diferencia_cierre))::numeric as promedio,
           min(ar.fecha) as desde, max(ar.fecha) as hasta,
           count(*) filter (where ar.diferencia_cierre < 0) as en_menos,
           count(*) filter (where ar.diferencia_cierre > 0) as en_mas
      from arqueos_caja ar
      join sucursales s on s.id = ar.sucursal_id
      left join caja_turnos ct on ct.id = ar.caja_turno_id
      left join turnos_sucursal ts on ts.id = ct.turno_id
     where not ar.es_demo
       and ar.fecha >= current_date - p_dias
       and ar.diferencia_cierre is not null and ar.diferencia_cierre <> 0
     group by ar.sucursal_id, s.nombre, ct.turno_id, ts.nombre
    having count(*) >= p_minimo
  )
  select
    'caja_repite:' || sucursal_id::text || ':' || coalesce(turno_id::text, 'sin_turno'),
    sucursal_id, null::uuid,
    format('En %s, turno %s, hubo %s arqueos con diferencia en los últimos %s días: %s en menos y %s en más, por $%s en total. El primero fue el %s y el último el %s.',
           sucursal, turno, veces, p_dias, en_menos, en_mas,
           plata_texto(plata), desde, hasta),
    round(plata, 2),
    format('la suma de los valores absolutos de las %s diferencias. El promedio es $%s por arqueo. Se suman en absoluto porque una de más y una de menos no se compensan: son dos cierres que no cuadraron.',
           veces, plata_texto(promedio)),
    jsonb_build_object(
      'sucursal', sucursal, 'turno', turno, 'veces', veces,
      'en_menos', en_menos, 'en_mas', en_mas,
      'desde', desde, 'hasta', hasta, 'dias_mirados', p_dias)
  from a;
$$;

create or replace function public.detectar_dejo_de_venderse(p_minimo_unidades numeric default 3)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  base as (
    select v.producto_id, v.sucursal_id,
           sum(v.unidades) filter (where v.periodo in (select periodo from previos))::numeric as antes,
           count(distinct v.periodo) filter (
             where v.periodo in (select periodo from previos) and v.unidades > 0) as meses_con_venta,
           coalesce(sum(v.unidades) filter (where v.periodo = (select periodo from ultimo)), 0)::numeric as ahora
      from producto_ventas_sucursal v
     where v.periodo in (select periodo from m)
     group by v.producto_id, v.sucursal_id
  ),
  cayo as (
    select b.*, p.nombre, p.sku, p.precio_sugerido::numeric as precio,
           s.nombre as sucursal,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes_cero,
           b.antes / nullif((select count(*) from previos), 0) as promedio_mes,
           coalesce((select ps.stock from producto_stock_sifaco ps
                      where ps.producto_id = b.producto_id
                        and ps.sucursal_id = b.sucursal_id
                      order by ps.leido_at desc limit 1), 0) as stock
      from base b
      join productos_catalogo p on p.id = b.producto_id
      join sucursales s on s.id = b.sucursal_id
     where b.ahora = 0
       and b.meses_con_venta = (select count(*) from previos)
       and b.antes >= p_minimo_unidades
  )
  select
    'dejo_de_venderse:' || producto_id::text || ':' || sucursal_id::text,
    sucursal_id, producto_id,
    format('En %s, %s (%s) vendió %s unidades en los %s meses cerrados anteriores y ninguna en %s. Quedan %s en stock.',
           sucursal, nombre, sku, round(antes), n_previos,
           periodo_texto(mes_cero), round(stock)),
    case when precio is not null then round(promedio_mes * precio, 2) end,
    case when precio is not null
         then format('las %s unidades por mes que vendía, por el precio de $%s. Es la venta que dejó de entrar en un mes, no una pérdida acumulada. Son %s meses cerrados de historia: alcanza para decir que un mes quedó en cero, no para decir que se dejó de vender para siempre.',
                     round(promedio_mes, 1), plata_texto(precio), n_previos + 1)
         else 'no se puede costear: este producto no tiene precio cargado' end,
    jsonb_build_object(
      'antes', antes, 'ahora', ahora, 'promedio_mes', round(promedio_mes, 2),
      'meses_previos', n_previos, 'mes_en_cero', mes_cero, 'stock', stock,
      'sucursal', sucursal, 'sku', sku)
  from cayo;
$$;

create or replace function public.detectar_empezo_a_vender_mas(
  p_veces numeric default 2.0,
  p_minimo_unidades numeric default 5
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  base as (
    select v.producto_id, v.sucursal_id,
           sum(v.unidades) filter (where v.periodo in (select periodo from previos))::numeric as antes,
           coalesce(sum(v.unidades) filter (where v.periodo = (select periodo from ultimo)), 0)::numeric as ahora
      from producto_ventas_sucursal v
     where v.periodo in (select periodo from m)
     group by v.producto_id, v.sucursal_id
  ),
  acelero as (
    select b.*, p.nombre, p.sku, p.precio_sugerido::numeric as precio,
           s.nombre as sucursal,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes,
           b.antes / nullif((select count(*) from previos), 0) as promedio_mes,
           coalesce((select ps.stock from producto_stock_sifaco ps
                      where ps.producto_id = b.producto_id
                        and ps.sucursal_id = b.sucursal_id
                      order by ps.leido_at desc limit 1), 0)::numeric as stock
      from base b
      join productos_catalogo p on p.id = b.producto_id
      join sucursales s on s.id = b.sucursal_id
     where b.ahora >= p_minimo_unidades
       and b.antes > 0
       and b.ahora >= (b.antes / nullif((select count(*) from previos), 0)) * p_veces
  )
  select
    'acelero:' || producto_id::text || ':' || sucursal_id::text,
    sucursal_id, producto_id,
    format('En %s, %s (%s) vendía %s unidades por mes y en %s vendió %s: %s veces más. Quedan %s en stock, que al ritmo nuevo son %s.',
           sucursal, nombre, sku, round(promedio_mes, 1), periodo_texto(mes), round(ahora),
           round(ahora / promedio_mes, 1), round(stock),
           case when ahora = 0 then 'indefinidos'
                when stock / ahora >= 6 then 'más de 6 meses'
                when stock / ahora < 1 then format('menos de un mes (%s días)', round(stock / ahora * 30))
                else format('%s meses', round(stock / ahora, 1)) end),
    case when precio is not null and ahora > 0 and stock / ahora < 1
         then round(greatest(ahora - stock, 0) * precio, 2) end,
    case when precio is null then 'no se puede costear: este producto no tiene precio cargado'
         when ahora = 0 or stock / ahora >= 1
         then format('no se estima plata: al ritmo nuevo el stock alcanza para %s meses, así que no hay venta en riesgo todavía. El hallazgo es el cambio de ritmo.',
                     case when ahora = 0 then 'muchos' else round(stock / ahora, 1)::text end)
         else format('las %s unidades que el stock no alcanza a cubrir este mes, por el precio de $%s. Es la venta en riesgo si no se repone, no la venta de más: lo que ya aceleró ya se cobró.',
                     round(greatest(ahora - stock, 0)), plata_texto(precio)) end,
    jsonb_build_object(
      'antes_por_mes', round(promedio_mes, 2), 'ahora', ahora,
      'veces', round(ahora / promedio_mes, 2), 'stock', stock,
      'meses_cobertura_al_ritmo_nuevo', case when ahora > 0 then round(stock / ahora, 2) end,
      'mes', mes, 'meses_previos', n_previos, 'sucursal', sucursal, 'sku', sku)
  from acelero;
$$;

create or replace function public.detectar_proveedor_cambio(
  p_meses integer default 6,
  p_veces numeric default 2.0
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cerrado as (
    select max(date_trunc('month', fecha_emision))::date as mes
      from facturas_proveedor
     where not es_demo
       and fecha_emision < date_trunc('month', current_date)
       and fecha_emision <= current_date
  ),
  por_mes as (
    select f.proveedor_id, p.razon_social,
           date_trunc('month', f.fecha_emision)::date as mes,
           count(*) as facturas, sum(f.total)::numeric as total
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
      cross join cerrado c
     where not f.es_demo
       and f.fecha_emision > (c.mes - make_interval(months => p_meses))
       and f.fecha_emision < (c.mes + interval '1 month')
     group by 1, 2, 3
  ),
  hist as (
    select pm.proveedor_id, pm.razon_social,
           (select mes from cerrado) as mes_cerrado,
           count(*) filter (where pm.mes < (select mes from cerrado)) as meses_con_factura,
           avg(pm.total) filter (where pm.mes < (select mes from cerrado)) as promedio,
           sum(pm.total) filter (where pm.mes = (select mes from cerrado)) as ultimo,
           sum(pm.facturas) filter (where pm.mes = (select mes from cerrado)) as facturas_ultimo
      from por_mes pm
     group by 1, 2
    having count(*) filter (where pm.mes < (select mes from cerrado)) >= 4
  )
  select
    'prov_cambio:' || proveedor_id::text || ':' || to_char(mes_cerrado, 'YYYY-MM'),
    null::uuid, null::uuid,
    case when ultimo is null then
      format('%s facturó en %s de los %s meses anteriores y en %s no facturó nada. Venía facturando $%s por mes.',
             razon_social, meses_con_factura, p_meses - 1,
             mes_texto(mes_cerrado), plata_texto(promedio))
    when ultimo > promedio * p_veces then
      format('%s facturó $%s en %s, contra $%s por mes en los %s meses anteriores: %s veces más, en %s comprobantes.',
             razon_social, plata_texto(ultimo), mes_texto(mes_cerrado),
             plata_texto(promedio), meses_con_factura,
             round(ultimo / promedio, 1), facturas_ultimo)
    else
      format('%s facturó $%s en %s, contra $%s por mes en los %s meses anteriores: un %s%% menos.',
             razon_social, plata_texto(ultimo), mes_texto(mes_cerrado),
             plata_texto(promedio), meses_con_factura,
             round((1 - ultimo / promedio) * 100))
    end,
    round(abs(coalesce(ultimo, 0) - promedio), 2),
    format('la diferencia entre los $%s del mes y los $%s que facturaba por mes en los %s meses anteriores. Es cuánto se movió el total del proveedor, no un cambio de precio: no hay precios de compra por producto cargados para poder decir eso.',
           plata_texto(coalesce(ultimo, 0)), plata_texto(promedio), meses_con_factura),
    jsonb_build_object(
      'proveedor', razon_social, 'mes', to_char(mes_cerrado, 'YYYY-MM'),
      'total_mes', coalesce(ultimo, 0), 'promedio_anterior', round(promedio, 2),
      'meses_con_factura', meses_con_factura, 'facturas_del_mes', coalesce(facturas_ultimo, 0),
      'ventana_meses', p_meses)
  from hist
  where ultimo is null
     or ultimo > promedio * p_veces
     or ultimo < promedio / p_veces;
$$;

create or replace function public.detectar_sucursal_bajo(p_caida_pct numeric default 15)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with m as (select periodo, orden from deteccion_meses_cerrados()),
  ultimo as (select periodo from m where orden = 1),
  previos as (select periodo from m where orden > 1),
  por_suc as (
    select v.sucursal_id, s.nombre as sucursal, v.periodo,
           sum(v.unidades)::numeric as unidades,
           sum(v.unidades * coalesce(p.precio_sugerido, 0))::numeric as plata
      from producto_ventas_sucursal v
      join sucursales s on s.id = v.sucursal_id
      join productos_catalogo p on p.id = v.producto_id
     where v.periodo in (select periodo from m)
     group by 1, 2, 3
  ),
  comparado as (
    select sucursal_id, sucursal,
           avg(unidades) filter (where periodo in (select periodo from previos)) as antes_u,
           avg(plata) filter (where periodo in (select periodo from previos)) as antes_p,
           sum(unidades) filter (where periodo = (select periodo from ultimo)) as ahora_u,
           sum(plata) filter (where periodo = (select periodo from ultimo)) as ahora_p,
           (select count(*) from previos) as n_previos,
           (select periodo from ultimo) as mes
      from por_suc
     group by 1, 2
  )
  select
    'suc_bajo:' || sucursal_id::text || ':' || mes,
    sucursal_id, null::uuid,
    format('%s vendió %s unidades en %s, contra %s por mes en los %s meses cerrados anteriores: un %s%% menos. Es contra su propia historia, no contra las otras sucursales.',
           sucursal, round(ahora_u), periodo_texto(mes), round(antes_u), n_previos,
           round((1 - ahora_u / antes_u) * 100)),
    round(antes_p - ahora_p, 2),
    format('los $%s que vendió de menos: $%s en el mes contra $%s por mes en los %s meses anteriores, valuado a precio de lista. Es mensual y no por día: las ventas de SIFACO vienen por mes.',
           plata_texto(antes_p - ahora_p), plata_texto(ahora_p),
           plata_texto(antes_p), n_previos),
    jsonb_build_object(
      'sucursal', sucursal, 'mes', mes,
      'unidades_mes', ahora_u, 'unidades_promedio_anterior', round(antes_u, 1),
      'plata_mes', round(ahora_p, 2), 'plata_promedio_anterior', round(antes_p, 2),
      'caida_pct', round((1 - ahora_u / antes_u) * 100, 1),
      'meses_previos', n_previos, 'comparado_contra', 'su propia historia')
  from comparado
  where antes_u > 0 and ahora_u is not null
    and ahora_u < antes_u * (1 - p_caida_pct / 100.0);
$$;

revoke all on function public.detectar_comprobante_duplicado() from public, anon;
revoke all on function public.detectar_monto_fuera_de_lo_habitual() from public, anon;
revoke all on function public.detectar_barras_con_dos_precios(numeric) from public, anon;
revoke all on function public.detectar_faltante_sin_nota_credito(integer) from public, anon;
revoke all on function public.detectar_stock_no_cuadra(numeric, numeric) from public, anon;
revoke all on function public.detectar_caja_diferencias_repetidas(integer, integer) from public, anon;
revoke all on function public.detectar_dejo_de_venderse(numeric) from public, anon;
revoke all on function public.detectar_empezo_a_vender_mas(numeric, numeric) from public, anon;
revoke all on function public.detectar_proveedor_cambio(integer, numeric) from public, anon;
revoke all on function public.detectar_sucursal_bajo(numeric) from public, anon;
grant execute on function public.detectar_comprobante_duplicado() to service_role;
grant execute on function public.detectar_monto_fuera_de_lo_habitual() to service_role;
grant execute on function public.detectar_barras_con_dos_precios(numeric) to service_role;
grant execute on function public.detectar_faltante_sin_nota_credito(integer) to service_role;
grant execute on function public.detectar_stock_no_cuadra(numeric, numeric) to service_role;
grant execute on function public.detectar_caja_diferencias_repetidas(integer, integer) to service_role;
grant execute on function public.detectar_dejo_de_venderse(numeric) to service_role;
grant execute on function public.detectar_empezo_a_vender_mas(numeric, numeric) to service_role;
grant execute on function public.detectar_proveedor_cambio(integer, numeric) to service_role;
grant execute on function public.detectar_sucursal_bajo(numeric) to service_role;
