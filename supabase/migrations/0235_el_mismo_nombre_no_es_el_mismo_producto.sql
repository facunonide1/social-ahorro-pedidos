-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0235 · EL MISMO NOMBRE NO ES EL MISMO PRODUCTO                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Al mirar los hallazgos de C salio esto, uno al lado del otro:
--
--   C.1 · «En Guzman, FABOGESIC 600 RAPIDA ACCION ca vendio 139 unidades en
--          los 2 meses cerrados anteriores y 0 unidades en 2026-09.»
--   C.2 · «En Guzman, FABOGESIC 600 RAPIDA ACCION ca vendia 18 unidades por
--          mes y en 2026-09 vendio 188: 10,4 veces mas.»
--
-- Dejo de venderse y acelero, el mismo producto, la misma sucursal, el mismo
-- mes. Se verifico: **son dos `producto_id` distintos** con el mismo nombre
-- —SIFACO corta los nombres a 30 caracteres— y no hay ni un solo caso de
-- superposicion real entre los dos detectores.
--
-- Asi que los detectores estan bien y el problema es de lectura: el informe
-- semanal del bloque E copia estas frases, y dos frases que se contradicen
-- hacen que no se le crea a ninguna.
--
-- El SKU al lado del nombre lo resuelve. Y de paso es el dato con el que se
-- busca el producto en SIFACO.
--
-- (Que haya dos registros con el mismo nombre ya lo reporta
--  `producto_duplicado`, con sus 4.829 casos. No es trabajo de C arreglarlo.)

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
    format('En %s, %s (%s) vendio %s unidades en los %s meses cerrados anteriores y %s unidades en %s. Quedan %s en stock.',
           sucursal, nombre, sku, round(antes), n_previos, round(ahora), mes_cero, round(stock)),
    case when precio is not null then round(promedio_mes * precio, 2) end,
    case when precio is not null
         then format('las %s unidades por mes que vendia, por el precio de $%s. Es la venta que dejo de entrar en un mes, no una perdida acumulada. Son %s meses cerrados de historia: alcanza para decir que un mes quedo en cero, no para decir que se dejo de vender para siempre.',
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
    format('En %s, %s (%s) vendia %s unidades por mes y en %s vendio %s: %s veces mas. Quedan %s en stock, que al ritmo nuevo son %s.',
           sucursal, nombre, sku, round(promedio_mes, 1), mes, round(ahora),
           round(ahora / promedio_mes, 1), round(stock),
           case when ahora = 0 then 'indefinidos'
                when stock / ahora >= 6 then 'mas de 6 meses'
                when stock / ahora < 1 then format('menos de un mes (%s dias)', round(stock / ahora * 30))
                else format('%s meses', round(stock / ahora, 1)) end),
    case when precio is not null and ahora > 0 and stock / ahora < 1
         then round(greatest(ahora - stock, 0) * precio, 2) end,
    case when precio is null then 'no se puede costear: este producto no tiene precio cargado'
         when ahora = 0 or stock / ahora >= 1
         then format('no se estima plata: al ritmo nuevo el stock alcanza para %s meses, asi que no hay venta en riesgo todavia. El hallazgo es el cambio de ritmo.',
                     case when ahora = 0 then 'muchos' else round(stock / ahora, 1)::text end)
         else format('las %s unidades que el stock no alcanza a cubrir este mes, por el precio de $%s. Es la venta en riesgo si no se repone, no la venta de mas: lo que ya acelero ya se cobro.',
                     round(greatest(ahora - stock, 0)), plata_texto(precio)) end,
    jsonb_build_object(
      'antes_por_mes', round(promedio_mes, 2), 'ahora', ahora,
      'veces', round(ahora / promedio_mes, 2), 'stock', stock,
      'meses_cobertura_al_ritmo_nuevo', case when ahora > 0 then round(stock / ahora, 2) end,
      'mes', mes, 'meses_previos', n_previos, 'sucursal', sucursal, 'sku', sku)
  from acelero;
$$;

-- ── LAS COMPUERTAS DE C.5 Y C.6 ─────────────────────────────────────────────
--
-- Sin esto los dos decian «puede correr» porque el `else` del case es `true`.
-- C.6 estaba explicitamente prohibido correr, y una compuerta que dice que si
-- es peor que no tener compuerta.

create or replace function public.deteccion_estado(p_detector text default null)
returns table (
  clave text, nombre text, familia text, historia_minima text,
  puede_correr boolean, por_que_no text, lo_que_hay text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with h as (
    select
      (select count(distinct importacion_id) from producto_stock_sifaco
        where sucursal_id is not null) as fotos_stock,
      (select count(*) from arqueos_caja where not es_demo) as arqueos_reales,
      (select count(*) from facturas_proveedor where not es_demo) as facturas,
      (select count(*) from facturas_proveedor
        where not es_demo and faltantes_texto is not null
          and btrim(faltantes_texto) <> '') as faltantes,
      (select count(*) from productos_catalogo where activo and not es_demo) as productos,
      -- C · la historia que hay para lo que cambio.
      (select count(*) from deteccion_meses_cerrados()) as meses_cerrados,
      (select count(distinct date_trunc('month', fecha_emision))
         from facturas_proveedor
        where not es_demo and fecha_emision < date_trunc('month', current_date)
          and fecha_emision > current_date - interval '1 year') as meses_factura,
      (select count(*) from canales) as canales,
      (select count(*) from clientes where not es_demo) as clientes_reales,
      (select count(*) from clientes) as clientes
  )
  select d.clave, d.nombre, d.familia::text, d.historia_minima,
    case d.clave
      when 'stock_no_cuadra' then h.fotos_stock >= 2
      when 'caja_diferencias_repetidas' then h.arqueos_reales >= 5
      when 'comprobante_duplicado' then h.facturas > 0
      when 'monto_fuera_de_lo_habitual' then h.facturas >= 5
      when 'faltante_sin_nota_credito' then h.faltantes > 0
      when 'dejo_de_venderse' then h.meses_cerrados >= 3
      when 'empezo_a_vender_mas' then h.meses_cerrados >= 3
      when 'proveedor_cambio' then h.meses_factura >= 5
      when 'sucursal_bajo' then h.meses_cerrados >= 3
      when 'canal_cambio' then h.canales > 0
      when 'cliente_no_volvio' then h.clientes_reales > 0
      else true
    end,
    case d.clave
      when 'stock_no_cuadra' then
        case when h.fotos_stock < 2 then
          format('hay %s foto de stock por sucursal y hacen falta 2 para comparar. El maestro de agosto no trae apertura por sucursal: la primera con apertura es la del 14/10', h.fotos_stock)
        end
      when 'caja_diferencias_repetidas' then
        case when h.arqueos_reales < 5 then
          format('hay %s arqueos reales. Los que estan cargados son de demostracion', h.arqueos_reales)
        end
      when 'comprobante_duplicado' then
        case when h.facturas = 0 then 'no hay comprobantes cargados' end
      when 'monto_fuera_de_lo_habitual' then
        case when h.facturas < 5 then 'hacen falta al menos 5 facturas para saber que es lo habitual' end
      when 'faltante_sin_nota_credito' then
        case when h.faltantes = 0 then 'ningun comprobante declaro un faltante' end
      when 'dejo_de_venderse' then
        case when h.meses_cerrados < 3 then
          format('hay %s meses cerrados de venta y hacen falta 3. Octubre esta parcial y no cuenta', h.meses_cerrados) end
      when 'empezo_a_vender_mas' then
        case when h.meses_cerrados < 3 then
          format('hay %s meses cerrados de venta y hacen falta 3', h.meses_cerrados) end
      when 'proveedor_cambio' then
        case when h.meses_factura < 5 then
          format('hay %s meses con facturas y hacen falta 5', h.meses_factura) end
      when 'sucursal_bajo' then
        case when h.meses_cerrados < 3 then
          format('hay %s meses cerrados de venta y hacen falta 3', h.meses_cerrados) end
      when 'canal_cambio' then
        case when h.canales = 0 then
          'no hay ningun canal cargado, asi que no hay nada que comparar' end
      when 'cliente_no_volvio' then
        case when h.clientes_reales = 0 then
          format('los %s clientes cargados son de demostracion. Un detector corriendo sobre eso inventa %s clientes perdidos que no existen',
                 h.clientes, h.clientes) end
    end,
    case d.clave
      when 'stock_no_cuadra' then format('%s foto(s) de stock por sucursal', h.fotos_stock)
      when 'caja_diferencias_repetidas' then format('%s arqueos reales', h.arqueos_reales)
      when 'comprobante_duplicado' then format('%s comprobantes', h.facturas)
      when 'monto_fuera_de_lo_habitual' then format('%s comprobantes', h.facturas)
      when 'faltante_sin_nota_credito' then
        format('%s comprobantes con un faltante escrito a mano', h.faltantes)
      when 'dejo_de_venderse' then format('%s meses cerrados de venta', h.meses_cerrados)
      when 'empezo_a_vender_mas' then format('%s meses cerrados de venta', h.meses_cerrados)
      when 'proveedor_cambio' then format('%s meses con facturas', h.meses_factura)
      when 'sucursal_bajo' then format('%s meses cerrados de venta', h.meses_cerrados)
      when 'canal_cambio' then format('%s canales cargados', h.canales)
      when 'cliente_no_volvio' then
        format('%s clientes cargados, %s reales', h.clientes, h.clientes_reales)
      else format('%s productos en el catalogo', h.productos)
    end
  from detectores d, h
  where d.activo and (p_detector is null or d.clave = p_detector)
  order by d.orden;
$$;

comment on function public.deteccion_estado(text) is
  'C.7 · Si cada detector tiene con que hablar. Cada compuerta cuenta en la '
  'misma tabla donde busca su detector, y ninguna cae en el else: una '
  'compuerta que dice que si por descuido es peor que no tener compuerta.';

revoke all on function public.deteccion_estado(text) from public, anon;
revoke all on function public.detectar_dejo_de_venderse(numeric) from public, anon;
revoke all on function public.detectar_empezo_a_vender_mas(numeric, numeric) from public, anon;
grant execute on function public.deteccion_estado(text) to authenticated, service_role;
grant execute on function public.detectar_dejo_de_venderse(numeric) to service_role;
grant execute on function public.detectar_empezo_a_vender_mas(numeric, numeric) to service_role;
