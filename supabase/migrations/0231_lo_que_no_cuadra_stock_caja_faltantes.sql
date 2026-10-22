-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0231 · B.1, B.2 y B.5                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── B.5 · UN FALTANTE SIN NOTA DE CREDITO ───────────────────────────────────
--
-- ── DONDE ESTAN LOS FALTANTES DE VERDAD ─────────────────────────────────────
--
-- `avisos_faltante` existe y tiene 10 filas: las 10 son de demostracion. Los
-- faltantes reales estan en otro lado — en `facturas_proveedor.faltantes_texto`,
-- 56 facturas donde quien recibio escribio a mano lo que no llego:
--
--   «FALTANTE DE RAQUIFEROL 11774,41»
--   «DEVOLUCION 2) URSOMAX X 60 (MAL PEDIDO) 91811,90»
--   «RASAQUIT COMP X12 Y IBU EVANOL FORTE CAP X20»
--
-- Se usa eso. Un detector que lee la tabla prolija y vacia no encuentra nada y
-- parece que no hay faltantes.
--
-- ── Y DE DONDE SALE LA PLATA ────────────────────────────────────────────────
--
-- En 14 de las 56 el monto esta escrito al final del texto. En las otras 42 no.
--
-- Entonces: las 14 se pueden cruzar contra las notas de credito del proveedor
-- y llevan plata al lado. Las 42 **no se pueden cruzar**, porque sin monto no
-- hay con que comparar — y se dicen igual, con el motivo. Es exactamente D.1:
-- lo que no se puede estimar no va arriba, va a la lista larga.
--
-- Las dos palabras —faltante y devolucion— esperan lo mismo: una nota de
-- credito. Por eso van juntas y el hecho no decide cual fue.

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
           -- El monto suele estar al final, con coma decimal.
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
      -- Se cruza por monto, no por fecha sola: este proveedor manda notas de
      -- credito todo el tiempo y «hubo alguna despues» no prueba nada.
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
             to_char(round(monto), 'FM999G999G999'), dias, left(faltantes_texto, 120))
    end,
    monto,
    case when monto is null
         then 'no se puede costear: el faltante se escribio a mano y sin monto. Tampoco se puede verificar si llego la nota de credito, porque no hay con que compararla.'
         else format('los $%s que dice el texto del faltante. Se busco una nota de credito de %s por ese monto (con 2%% de tolerancia) emitida despues del %s y no hay ninguna.',
                     to_char(round(monto), 'FM999G999G999'), razon_social, fecha_emision) end,
    jsonb_build_object(
      'factura_id', id, 'proveedor', razon_social, 'numero', numero_factura,
      'dias', dias, 'umbral_dias', p_dias, 'texto', faltantes_texto,
      'monto_leido', monto, 'se_pudo_cruzar', monto is not null)
  from juzgado
  where monto is null or not llego_nc;
$$;

comment on function public.detectar_faltante_sin_nota_credito(integer) is
  'B.5 · Lee facturas_proveedor.faltantes_texto, que es donde estan los '
  'faltantes reales: avisos_faltante tiene 10 filas y las 10 son demo. Cuando '
  'el texto trae el monto se cruza contra las notas de credito del proveedor; '
  'cuando no, se dice que no se puede cruzar.';

-- ── B.1 · STOCK QUE NO CUADRA ───────────────────────────────────────────────
--
-- **Hoy no puede correr.** Necesita dos fotos de stock por sucursal del mismo
-- producto y hay una sola: el maestro del 28/08 no trae apertura por sucursal
-- y la primera que la trae es la del 14/10. `deteccion_estado` lo dice.
--
-- La funcion queda escrita y lista: cuando entre el segundo maestro con
-- apertura, corre sin que nadie la toque.
--
-- ── EL MARGEN DE ERROR DECLARADO ────────────────────────────────────────────
--
-- El stock es una foto y las ventas vienen por MES. Entre dos fotos hay un mes
-- y medio de ventas que se conocen a nivel mensual, y la ultima fila de cada
-- mes en curso esta marcada `parcial`. La cuenta no puede ser exacta.
--
-- Entonces el rango normal es ancho a proposito: se marca solo lo que se sale
-- de +-20% de lo vendido en el periodo, con un piso de 5 unidades. Un detector
-- que marca 2 unidades de diferencia sobre 40 vendidas avisa de nada, y lo
-- unico que logra es que dejen de mirarlo.

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
      -- Las ventas del periodo entre las dos fotos, que vienen por mes.
      coalesce((select sum(pv.unidades)::numeric from producto_ventas_sucursal pv
                 where pv.producto_id = n.producto_id and pv.sucursal_id = n.sucursal_id
                   and pv.periodo >= to_char(d.leido_vieja, 'YYYY-MM')
                   and pv.periodo <= to_char(d.leido_nueva, 'YYYY-MM')), 0) as vendido,
      -- Lo que entro y lo que salio por transferencia en el periodo.
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
                     round(abs(diferencia)), to_char(round(costo), 'FM999G999G999'),
                     round(rango), p_tolerancia_pct, round(vendido), p_piso_unidades)
         else 'no se puede costear: este producto no tiene costo cargado' end,
    jsonb_build_object(
      'antes', antes, 'ahora', ahora, 'deberia', deberia, 'diferencia', diferencia,
      'vendido', vendido, 'entro', entro, 'salio', salio, 'rango_normal', rango,
      'foto_vieja', leido_vieja, 'foto_nueva', leido_nueva)
  from dif
  where abs(diferencia) > rango;
$$;

comment on function public.detectar_stock_no_cuadra(numeric, numeric) is
  'B.1 · Dos fotos de stock por sucursal contra las ventas del periodo. El '
  'rango normal es ancho a proposito: el stock es una foto y las ventas vienen '
  'por mes. Hoy no puede correr — hay una sola foto con apertura por sucursal.';

-- ── B.2 · DIFERENCIAS DE CAJA QUE SE REPITEN ────────────────────────────────
--
-- Una no dice nada. Varias en la misma sucursal y el mismo turno, si.
--
-- ── Y NUNCA POR PERSONA EN UN LISTADO ───────────────────────────────────────
--
-- `arqueos_caja` guarda `cajero_id` y `cajero_nombre`. El dato existe y lo
-- puede ver quien tenga permiso de verlo, en la pantalla del arqueo.
--
-- **Pero no entra aca.** Ni en el `hecho`, ni en la `evidencia`, ni en el
-- agrupamiento. Un listado con nombres al lado de la palabra «diferencia» es
-- una acusacion, y el sistema no sabe la causa: puede ser un vuelto mal dado,
-- un precio mal cargado, un cliente que volvio a devolver algo, o nada.
--
-- Se agrupa por sucursal y turno porque eso es lo accionable: un turno que
-- repite es un procedimiento para revisar, no una persona para investigar.
--
-- Hoy tampoco puede correr: los 48 arqueos cargados son de demostracion.

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
           to_char(round(plata), 'FM999G999G999'), desde, hasta),
    round(plata, 2),
    format('la suma de los valores absolutos de las %s diferencias. El promedio es $%s por arqueo. Se suman en absoluto porque una de mas y una de menos no se compensan: son dos cierres que no cuadraron.',
           veces, to_char(round(promedio), 'FM999G999G999')),
    -- Sin cajero_id ni cajero_nombre. Ver el encabezado.
    jsonb_build_object(
      'sucursal', sucursal, 'turno', turno, 'veces', veces,
      'en_menos', en_menos, 'en_mas', en_mas,
      'desde', desde, 'hasta', hasta, 'dias_mirados', p_dias)
  from a;
$$;

comment on function public.detectar_caja_diferencias_repetidas(integer, integer) is
  'B.2 · Por sucursal y turno. NUNCA por persona: arqueos_caja guarda cajero_id '
  'y cajero_nombre y lo ve quien tenga permiso en la pantalla del arqueo, pero '
  'no entra en el hecho, ni en la evidencia, ni en el agrupamiento. Un listado '
  'con nombres al lado de «diferencia» es una acusacion, y el sistema no sabe '
  'la causa.';

revoke all on function public.deteccion_estado(text) from public, anon;
revoke all on function public.detectar_comprobante_duplicado() from public, anon;
revoke all on function public.detectar_monto_fuera_de_lo_habitual() from public, anon;
revoke all on function public.detectar_barras_con_dos_precios(numeric) from public, anon;
revoke all on function public.detectar_faltante_sin_nota_credito(integer) from public, anon;
revoke all on function public.detectar_stock_no_cuadra(numeric, numeric) from public, anon;
revoke all on function public.detectar_caja_diferencias_repetidas(integer, integer) from public, anon;
grant execute on function public.deteccion_estado(text) to authenticated, service_role;
grant execute on function public.detectar_comprobante_duplicado() to service_role;
grant execute on function public.detectar_monto_fuera_de_lo_habitual() to service_role;
grant execute on function public.detectar_barras_con_dos_precios(numeric) to service_role;
grant execute on function public.detectar_faltante_sin_nota_credito(integer) to service_role;
grant execute on function public.detectar_stock_no_cuadra(numeric, numeric) to service_role;
grant execute on function public.detectar_caja_diferencias_repetidas(integer, integer) to service_role;
