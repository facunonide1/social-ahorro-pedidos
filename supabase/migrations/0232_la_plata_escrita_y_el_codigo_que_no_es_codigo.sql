-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0232 · DOS COSAS QUE APARECIERON AL CORRER LOS DETECTORES               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Los seis de B corrieron contra los datos reales y salieron dos cosas.
--
-- ── 1 · «$5,883» NO ES CINCO MIL OCHOCIENTOS OCHENTA Y TRES ─────────────────
--
-- `to_char(n, 'FM999G999G999')` usa el separador de miles de la base, que es
-- la coma. En un hecho escrito en castellano «$5,883» se lee como cinco pesos
-- con ochenta y tres, y el hallazgo pasa de 5.883 pesos a 5 pesos.
--
-- Los hechos de esta sesion se leen tal cual estan escritos —el informe
-- semanal del bloque E los copia— asi que no alcanza con que el cliente
-- formatee. Un ayudante y listo.
--
-- ── 2 · EL CODIGO DE BARRAS «1» ─────────────────────────────────────────────
--
-- B.6 encontro 22 casos y el primero era: codigo de barras «1», en dos
-- registros, «BUCAL TAC GREEN DENT BAMBOO» y «PACO R PURE XS FOR HER EDP».
--
-- No son el mismo producto con dos precios: son dos productos sin codigo,
-- donde alguien puso un 1 para salir del paso. Hay 3.298 asi.
--
-- Un codigo de barras de verdad tiene 8 digitos como minimo (EAN-8) o 13
-- (EAN-13). Se pide 8.

create or replace function public.plata_texto(p numeric)
returns text
language sql
immutable
as $$
  select replace(to_char(round(coalesce(p, 0)), 'FM999G999G999'), ',', '.');
$$;

comment on function public.plata_texto(numeric) is
  'Formatea plata para un hecho escrito en castellano: separador de miles con '
  'punto. to_char usa la coma de la base y «$5,883» se lee como cinco pesos.';

revoke all on function public.plata_texto(numeric) from public, anon;
grant execute on function public.plata_texto(numeric) to authenticated, service_role;

-- ── B.6, con el filtro del codigo de verdad ─────────────────────────────────

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
    format('El codigo de barras %s esta en %s registros del catalogo: «%s» a $%s y «%s» a $%s. Son %s veces de diferencia.',
           codigo_barras, registros, nombre_menor, plata_texto(menor),
           nombre_mayor, plata_texto(mayor), round(mayor / menor, 1)),
    -- La plata es la diferencia por lo que se vendio en tres meses: es lo que
    -- se cobro de mas o de menos segun cual registro salio al escanear.
    case when unidades_3m > 0 then round((mayor - menor) * unidades_3m, 2) end,
    case when unidades_3m > 0
         then format('la diferencia de $%s por las %s unidades vendidas en 3 meses entre los dos registros. Es lo que se cobro de mas o de menos segun cual salio al escanear.',
                     plata_texto(mayor - menor), round(unidades_3m))
         else format('no se puede costear: los dos registros juntos no registran ventas en 3 meses, asi que la diferencia de $%s no se multiplico por nada',
                     plata_texto(mayor - menor)) end,
    jsonb_build_object(
      'codigo_barras', codigo_barras, 'registros', registros,
      'menor', jsonb_build_object('id', id_menor, 'sku', sku_menor, 'nombre', nombre_menor, 'precio', menor),
      'mayor', jsonb_build_object('id', id_mayor, 'sku', sku_mayor, 'nombre', nombre_mayor, 'precio', mayor),
      'veces', round(mayor / menor, 1), 'unidades_3m', unidades_3m)
  from conventa;
$$;

comment on function public.detectar_barras_con_dos_precios(numeric) is
  'B.6 · Mismo codigo de barras (8 digitos o mas: los mas cortos son basura), '
  'precios que difieren 2 veces o mas. NO es `producto_duplicado`, que compara '
  'por nombre: dos registros con nombres distintos y el mismo codigo son el '
  'caso que mas plata mueve, porque el mostrador escanea y sale el precio del '
  'registro equivocado.';

-- ── Los otros cinco, con la plata bien escrita ──────────────────────────────

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
    format('El comprobante %s de %s esta cargado %s veces, con montos que difieren menos del 5%%. El primero es del %s y el ultimo del %s.',
           numero_factura, razon_social, veces, primera, ultima),
    round((veces - 1) * mayor, 2),
    format('%s copia(s) de mas x $%s cada una. Es lo que esta cargado de mas, no necesariamente lo que se pago de mas.',
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
           coalesce(numero_factura, 'sin numero'), razon_social,
           plata_texto(total), n, plata_texto(mediana)),
    round(total - mediana, 2),
    format('$%s de este comprobante menos la mediana de $%s de las %s facturas de ese proveedor. El umbral es el tercer cuartil mas tres veces el rango intercuartil ($%s): se usa la mediana y no el promedio porque un solo pedido grande corre el promedio y despues nada parece raro.',
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
      format('El comprobante %s de %s declaro un faltante hace %s dias: «%s». No tiene el monto escrito, asi que no se puede cruzar con las notas de credito.',
             coalesce(numero_factura, 'sin numero'), razon_social, dias,
             left(faltantes_texto, 120))
    else
      format('El comprobante %s de %s declaro un faltante de $%s hace %s dias y no entro ninguna nota de credito de ese proveedor por ese monto: «%s».',
             coalesce(numero_factura, 'sin numero'), razon_social,
             plata_texto(monto), dias, left(faltantes_texto, 120))
    end,
    monto,
    case when monto is null
         then 'no se puede costear: el faltante se escribio a mano y sin monto. Tampoco se puede verificar si llego la nota de credito, porque no hay con que compararla.'
         else format('los $%s que dice el texto del faltante. Se busco una nota de credito de %s por ese monto (con 2%% de tolerancia) emitida despues del %s y no hay ninguna.',
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
    format('En %s el modelo dice que deberian quedar %s de %s y hay %s: una diferencia de %s unidades. Habia %s el %s, se vendieron %s y %s.',
           sucursal, round(deberia), nombre, round(ahora), round(abs(diferencia)),
           round(antes), leido_vieja::date, round(vendido),
           case when entro = 0 and salio = 0 then 'no hubo transferencias registradas'
                else format('entraron %s y salieron %s por transferencia', round(entro), round(salio)) end),
    case when costo is not null then round(abs(diferencia) * costo, 2) end,
    case when costo is not null
         then format('%s unidades de diferencia x $%s de costo. El rango normal para este producto es +-%s unidades (%s%% de las %s vendidas, con un piso de %s): el stock es una foto y las ventas vienen por mes, asi que la cuenta no puede ser exacta.',
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
    format('En %s, turno %s, hubo %s arqueos con diferencia en los ultimos %s dias: %s en menos y %s en mas, por $%s en total. El primero fue el %s y el ultimo el %s.',
           sucursal, turno, veces, p_dias, en_menos, en_mas,
           plata_texto(plata), desde, hasta),
    round(plata, 2),
    format('la suma de los valores absolutos de las %s diferencias. El promedio es $%s por arqueo. Se suman en absoluto porque una de mas y una de menos no se compensan: son dos cierres que no cuadraron.',
           veces, plata_texto(promedio)),
    jsonb_build_object(
      'sucursal', sucursal, 'turno', turno, 'veces', veces,
      'en_menos', en_menos, 'en_mas', en_mas,
      'desde', desde, 'hasta', hasta, 'dias_mirados', p_dias)
  from a;
$$;

revoke all on function public.detectar_comprobante_duplicado() from public, anon;
revoke all on function public.detectar_monto_fuera_de_lo_habitual() from public, anon;
revoke all on function public.detectar_barras_con_dos_precios(numeric) from public, anon;
revoke all on function public.detectar_faltante_sin_nota_credito(integer) from public, anon;
revoke all on function public.detectar_stock_no_cuadra(numeric, numeric) from public, anon;
revoke all on function public.detectar_caja_diferencias_repetidas(integer, integer) from public, anon;
grant execute on function public.detectar_comprobante_duplicado() to service_role;
grant execute on function public.detectar_monto_fuera_de_lo_habitual() to service_role;
grant execute on function public.detectar_barras_con_dos_precios(numeric) to service_role;
grant execute on function public.detectar_faltante_sin_nota_credito(integer) to service_role;
grant execute on function public.detectar_stock_no_cuadra(numeric, numeric) to service_role;
grant execute on function public.detectar_caja_diferencias_repetidas(integer, integer) to service_role;
