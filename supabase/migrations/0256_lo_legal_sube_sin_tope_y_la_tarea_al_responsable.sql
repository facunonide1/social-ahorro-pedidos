-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0256 · LAS COMPUERTAS DE LOS SEIS NUEVOS                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Sin esto los seis detectores de canal caian en el `else true` de
-- `deteccion_estado()`, que es justamente lo que la v1.3 arreglo en 0235: una
-- compuerta que dice que si por descuido es peor que no tener compuerta.
--
-- B.4 es la unica que no puede correr, y **el motivo no es falta de
-- historia**: ninguna plataforma esta informando rechazos. Es una distincion
-- que importa, porque «falta historia» se arregla esperando y esto se arregla
-- subiendo un archivo.

CREATE OR REPLACE FUNCTION public.deteccion_estado(p_detector text DEFAULT NULL::text)
 RETURNS TABLE(clave text, nombre text, familia text, historia_minima text, puede_correr boolean, por_que_no text, lo_que_hay text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (select count(*) from deteccion_meses_cerrados()) as meses_cerrados,
      (select count(distinct date_trunc('month', fecha_emision))
         from facturas_proveedor
        where not es_demo and fecha_emision < date_trunc('month', current_date)
          and fecha_emision > current_date - interval '1 year') as meses_factura,
      (select count(*) from canales) as canales,
      (select count(*) from clientes where not es_demo) as clientes_reales,
      (select count(*) from clientes) as clientes,
      -- v1.4 · los canales con catalogo cargado y los rechazos informados.
      (select count(*) from canal_publicaciones cp
        join canales_venta cv on cv.id = cp.canal_id
       where cv.tipo <> 'mostrador') as publicaciones,
      (select count(*) from canal_rechazos) as rechazos
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
      when 'canal_legal_publicado' then h.publicaciones > 0
      when 'canal_apagado_con_stock' then h.publicaciones > 0
      when 'canal_sin_stock' then h.publicaciones > 0
      when 'canal_no_actualiza' then h.publicaciones > 0
      when 'canal_mal_cargado' then h.publicaciones > 0
      when 'canal_rechazado' then h.rechazos > 0
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
      when 'canal_rechazado' then
        case when h.rechazos = 0 then
          'ninguna plataforma está informando rechazos al sistema. No es falta de historia: se enciende subiendo un archivo de errores por el importador, no esperando' end
      when 'canal_legal_publicado' then
        case when h.publicaciones = 0 then 'ningún canal tiene publicaciones cargadas' end
      when 'canal_apagado_con_stock' then
        case when h.publicaciones = 0 then 'ningún canal tiene publicaciones cargadas' end
      when 'canal_sin_stock' then
        case when h.publicaciones = 0 then 'ningún canal tiene publicaciones cargadas' end
      when 'canal_no_actualiza' then
        case when h.publicaciones = 0 then 'ningún canal tiene publicaciones cargadas' end
      when 'canal_mal_cargado' then
        case when h.publicaciones = 0 then 'ningún canal tiene publicaciones cargadas' end
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
      when 'canal_rechazado' then format('%s rechazos informados', h.rechazos)
      when 'canal_legal_publicado' then format('%s publicaciones en canales abiertos', h.publicaciones)
      when 'canal_apagado_con_stock' then format('%s publicaciones en canales abiertos', h.publicaciones)
      when 'canal_sin_stock' then format('%s publicaciones en canales abiertos', h.publicaciones)
      when 'canal_no_actualiza' then format('%s publicaciones en canales abiertos', h.publicaciones)
      when 'canal_mal_cargado' then format('%s publicaciones en canales abiertos', h.publicaciones)
      else format('%s productos en el catálogo', h.productos)
    end
  from detectores d, h
  where d.activo and (p_detector is null or d.clave = p_detector)
  order by d.orden;
$function$
;
comment on function public.deteccion_estado(text) is
  'C.7 · Si cada detector tiene con que hablar. Cada compuerta cuenta en la '
  'misma tabla donde busca su detector, y ninguna cae en el else. B.4 '
  'distingue «falta historia» de «nadie esta informando»: lo primero se '
  'arregla esperando, lo segundo subiendo un archivo.';

revoke all on function public.deteccion_estado(text) from public, anon, authenticated;
grant execute on function public.deteccion_estado(text) to service_role;
