-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0245 · EL INFORME Y LAS COMPUERTAS, EN CASTELLANO                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La otra mitad de 0244. Los motivos de «no puedo correrlo» van dentro del
-- informe, asi que tambien se leen.
--
-- Y de paso se arregla una cosa del informe que se vio al leerlo completo: la
-- seccion «Lo que no puedo explicar» decia «De los 17 cambios de arriba, no
-- encuentro el motivo de ninguno», y eso es una frase hecha, no un hecho.
--
-- El sistema no busco el motivo de los 17 y no lo encontro: **no tiene con
-- que buscarlo.** Lo que llega de SIFACO son unidades por mes y por sucursal,
-- y ahi no hay ningun campo que diga por que. La frase honesta dice cual es
-- la diferencia, porque si no, «no encuentro el motivo» suena a que lo
-- intento.
--
-- (El informe final queda en 0246, que separa «no hay nada» de «no hay nada
--  tuyo». Aca van la compuerta y los textos del catalogo.)

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
          format('hay %s arqueos reales. Los que están cargados son de demostración', h.arqueos_reales)
        end
      when 'comprobante_duplicado' then
        case when h.facturas = 0 then 'no hay comprobantes cargados' end
      when 'monto_fuera_de_lo_habitual' then
        case when h.facturas < 5 then 'hacen falta al menos 5 facturas para saber qué es lo habitual' end
      when 'faltante_sin_nota_credito' then
        case when h.faltantes = 0 then 'ningún comprobante declaró un faltante' end
      when 'dejo_de_venderse' then
        case when h.meses_cerrados < 3 then
          format('hay %s meses cerrados de venta y hacen falta 3. El mes en curso está parcial y no cuenta', h.meses_cerrados) end
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
          'no hay ningún canal cargado, así que no hay nada que comparar' end
      when 'cliente_no_volvio' then
        case when h.clientes_reales = 0 then
          format('los %s clientes cargados son de demostración. Un detector corriendo sobre eso inventa %s clientes perdidos que no existen',
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
      else format('%s productos en el catálogo', h.productos)
    end
  from detectores d, h
  where d.activo and (p_detector is null or d.clave = p_detector)
  order by d.orden;
$$;

comment on function public.deteccion_estado(text) is
  'C.7 · Si cada detector tiene con qué hablar. Cada compuerta cuenta en la '
  'misma tabla donde busca su detector, y ninguna cae en el else: una '
  'compuerta que dice que sí por descuido es peor que no tener compuerta.';

revoke all on function public.deteccion_estado(text) from public, anon;
grant execute on function public.deteccion_estado(text) to authenticated, service_role;

-- ── EL CATALOGO, EN CASTELLANO ──────────────────────────────────────────────
--
-- `que_no_dice` se muestra al lado de cada hallazgo y va dentro del aviso.
-- Es la mitad de la honestidad de esta sesion: no se puede leer a medias.

update public.detectores set que_no_dice = m.q, historia_minima = m.h
  from (values
  ('stock_no_cuadra',
   'No dice por qué ni quién. Una diferencia puede ser un error de carga, una venta que SIFACO registró tarde, una merma que nadie anotó, o un faltante.',
   'dos fotos de stock POR SUCURSAL del mismo producto, y las ventas del período entre las dos'),
  ('caja_diferencias_repetidas',
   'No dice quién cerró. El dato existe para quien pueda verlo; en el listado aparece la sucursal y el turno, no la persona.',
   '90 días de arqueos cerrados y al menos 5 arqueos reales en esa sucursal'),
  ('comprobante_duplicado',
   'No dice si se pagó dos veces: dice que está cargado dos veces.',
   'ninguna: es un hecho de hoy'),
  ('monto_fuera_de_lo_habitual',
   'No dice que esté mal. Un pedido grande es un monto distinto y puede estar perfecto.',
   '5 facturas del mismo proveedor para saber qué es «lo habitual»'),
  ('faltante_sin_nota_credito',
   'No dice que el proveedor no la vaya a mandar: dice cuántos días pasaron.',
   'ninguna: cuenta días desde que el comprobante declaró el faltante'),
  ('barras_con_dos_precios',
   'No dice cuál de los dos precios está bien. SIFACO es la autoridad de precio (regla de oro 1).',
   'ninguna: es un hecho de hoy'),
  ('dejo_de_venderse',
   'No dice por qué. Puede ser un competidor, un faltante que nadie registró, un cambio de marca o una moda que pasó.',
   '3 meses cerrados de venta del mismo producto en la misma sucursal. El mes en curso está parcial y no cuenta'),
  ('empezo_a_vender_mas',
   'No dice que vaya a seguir. Dice que pasó, y cuánto stock queda a ese ritmo.',
   '3 meses cerrados de venta del mismo producto en la misma sucursal'),
  ('proveedor_cambio',
   'NO dice que subió el precio de un producto: no hay precios de compra por producto cargados para comparar. Dice que el total mensual cambió.',
   '6 meses de facturas del mismo proveedor, de los cuales 4 con facturas'),
  ('sucursal_bajo',
   'No se compara con las otras sucursales a propósito: una sucursal chica siempre vende menos que una grande y eso no es una caída. Y es mensual, no por día: las ventas de SIFACO vienen por mes.',
   '3 meses cerrados de venta de esa sucursal'),
  ('canal_cambio',
   'Hoy no dice nada: no hay canales cargados.',
   'canales cargados y 2 meses de pedidos por canal'),
  ('cliente_no_volvio',
   'Hoy no corre y no va a correr hasta que exista un padrón de clientes real. Los 150 cargados son de demostración: un detector corriendo sobre eso inventa 150 clientes perdidos que no existen.',
   'un padrón de clientes real con historia de compras. Hoy hay 150 clientes y los 150 son demo'),
  ('sin_costo_cargado',
   'No dice cuánto es el costo. Dice que no está.',
   'ninguna: es un hecho de hoy'),
  ('producto_duplicado',
   'No dice cuál hay que dar de baja. Propone el que más vendió y deja decidir.',
   'los meses cerrados de venta, para saber cuál de los dos vendió'),
  ('oferta_bajo_costo',
   'No dice que sea un error: una liquidación de vencimiento se hace a pérdida a propósito.',
   'ninguna: es un hecho de hoy'),
  ('precio_lista_bajo_costo',
   'No dice cuál de los dos está mal. SIFACO es la autoridad de precio.',
   'ninguna: es un hecho de hoy'),
  ('descuento_imposible',
   'No dice que no se pueda hacer: dice cuánto cuesta hacerlo.',
   'ninguna: es un hecho de hoy'),
  ('descuento_sin_vencimiento',
   'No dice que haya que cortarla hoy: dice que no tiene fecha.',
   'ninguna: es un hecho de hoy')
) as m(c, q, h) where detectores.clave = m.c;

update public.detectores set nombre = m.n from (values
  ('stock_no_cuadra', 'Stock que no cuadra'),
  ('caja_diferencias_repetidas', 'Diferencias de caja que se repiten'),
  ('comprobante_duplicado', 'Un comprobante cargado dos veces'),
  ('monto_fuera_de_lo_habitual', 'Un monto muy distinto del habitual'),
  ('faltante_sin_nota_credito', 'Un faltante sin nota de crédito'),
  ('barras_con_dos_precios', 'Un producto en dos lugares con precio distinto'),
  ('dejo_de_venderse', 'Un producto que dejó de venderse'),
  ('empezo_a_vender_mas', 'Un producto que aceleró'),
  ('proveedor_cambio', 'Un proveedor que cambió'),
  ('sucursal_bajo', 'Una sucursal que bajó contra lo suyo'),
  ('canal_cambio', 'Un canal que cambió'),
  ('cliente_no_volvio', 'Un cliente que no volvió'),
  ('sin_costo_cargado', 'Un producto sin costo'),
  ('producto_duplicado', 'El mismo producto en dos registros'),
  ('oferta_bajo_costo', 'Una oferta por debajo del costo'),
  ('precio_lista_bajo_costo', 'Un precio de lista por debajo del costo'),
  ('descuento_imposible', 'Un descuento que no se puede sostener'),
  ('descuento_sin_vencimiento', 'Un descuento sin fecha de fin')
) as m(c, n) where detectores.clave = m.c;

update public.deteccion_motivos set ayuda = m.a from (values
  ('es_a_proposito', 'Esto está así porque alguien lo decidió. El detector no lo sabía.'),
  ('dato_mal_cargado', 'El hallazgo sale de un dato equivocado, no de algo que pase en el negocio.'),
  ('no_es_asi', 'Lo que dice no es lo que pasa.'),
  ('ya_lo_resolvi', 'Era real y ya se actuó. El detector acertó.'),
  ('no_ahora', 'Es real pero no es el momento. Vuelve a aparecer más adelante.'),
  ('no_entiendo', 'La frase no se entiende. Eso es un problema de cómo está escrita, no del detector: no lo silencia.')
) as m(c, a) where deteccion_motivos.clave = m.c;
