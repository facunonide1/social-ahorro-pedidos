-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0258 · UNA PUBLICACION SIN SKU IGUAL TIENE QUE TENER CLAVE              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La primera corrida con los detectores de canal se cayo:
--
--   null value in column "clave" of relation "anomalias"
--   PANTENE PRO-V MAX HIDRATACION 200 ML esta publicado en Tienda propia...
--
-- La clave se armaba con `canal_id || ':' || sku`, y **hay una publicacion sin
-- SKU**: una de 7.737. Concatenar con null da null, y la corrida entera se
-- cayo por una fila.
--
-- Dos cosas se arreglan, y la segunda importa mas:
--
--   1 · la clave usa `externo_id` cuando no hay SKU. `externo_id` no es null
--       en ninguna de las 7.737 — es el id que le puso el canal.
--   2 · **un producto publicado sin SKU es el peor caso de B.3**, no un caso
--       de borde. Uno con un SKU que no cruza al menos se puede buscar en
--       SIFACO; este no se puede ni buscar. El hecho lo dice distinto.
--
-- Y la leccion de forma: una clave armada con concatenacion se rompe con un
-- null en cualquiera de sus partes, y se rompe entera, no en la fila mala.
--
-- (Los cuerpos de los cuatro detectores afectados quedaron escritos en 0255 y
--  los finales estan aca. Se vuelcan de la base para no divergir.)

CREATE OR REPLACE FUNCTION public.detectar_canal_legal_publicado()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    'canal_legal:' || cp.canal_id || ':' || coalesce(cp.sku, 'ext-' || cp.externo_id),
    cv.sucursal_despacho_id, cp.producto_id,
    format('%s está publicado en %s y SIFACO lo declara %s. Es un canal abierto al público.',
           coalesce(p.nombre_comercial, cp.nombre), cv.nombre,
           case
             when p.es_psicotropico then 'psicotrópico'
             when p.es_controlado then 'controlado'
             when p.condicion_venta = 'estupefaciente_psico_ii' then 'estupefaciente o psicotrópico II'
             when p.condicion_venta = 'receta_archivada' then 'de receta archivada'
             else 'con receta' end),
    null::numeric,
    'no se puede costear: lo que está en juego es una sanción y eso no tiene un número. Sube igual porque la regla de oro 9 está por encima del presupuesto de interrupción.',
    jsonb_build_object(
      'canal', cv.nombre, 'sku', cp.sku, 'permalink', cp.permalink,
      'requiere_receta', p.requiere_receta,
      'condicion_venta', p.condicion_venta,
      'es_controlado', p.es_controlado,
      'es_psicotropico', p.es_psicotropico,
      'lista_controlado', p.lista_controlado,
      'los_dos_campos_coinciden',
        (p.requiere_receta and p.condicion_venta in ('requiere_receta','receta_archivada')))
  from canal_publicaciones cp
  join canales_venta cv on cv.id = cp.canal_id
  join productos_catalogo p on p.id = cp.producto_id
  where cp.estado = 'publish'
    and cv.tipo <> 'mostrador'
    and (p.requiere_receta or p.es_controlado or p.es_psicotropico
         or p.condicion_venta in ('requiere_receta', 'receta_archivada',
                                  'estupefaciente_psico_ii'));
$function$
;

CREATE OR REPLACE FUNCTION public.detectar_canal_apagado_con_stock()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    select cp.canal_id, coalesce(cp.sku, 'ext-' || cp.externo_id) as clave_sku,
           cp.sku, cp.producto_id, cv.nombre as canal,
           cv.sucursal_despacho_id,
           p.nombre_comercial, p.precio_costo_promedio::numeric as costo,
           coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                      where ps.producto_id = cp.producto_id
                        and ps.sucursal_id is not null), 0)::numeric as stock
      from canal_publicaciones cp
      join canales_venta cv on cv.id = cp.canal_id
      join productos_catalogo p on p.id = cp.producto_id
     where cp.estado = 'draft' and cv.tipo <> 'mostrador'
  )
  select
    'canal_apagado:' || x.canal_id || ':' || x.clave_sku,
    x.sucursal_despacho_id, x.producto_id,
    format('%s está apagado en %s y hay %s unidades en stock. Nadie lo puede comprar ahí.',
           x.nombre_comercial, x.canal, round(x.stock)),
    case when x.costo is not null then round(x.stock * x.costo, 2) end,
    case when x.costo is not null
         then format('%s unidades × $%s de costo. Se valúa a costo y no a precio de venta: es plata que ya se pagó y está quieta, no una venta perdida.',
                     round(x.stock), plata_texto(x.costo))
         else 'no se puede costear: este producto no tiene costo cargado' end,
    jsonb_build_object('canal', x.canal, 'sku', x.sku, 'stock', x.stock, 'costo', x.costo)
  from x
  where x.stock > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.detectar_canal_sin_stock()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with x as (
    select cp.canal_id, coalesce(cp.sku, 'ext-' || cp.externo_id) as clave_sku,
           cp.sku, cp.producto_id, cv.nombre as canal,
           cv.sucursal_despacho_id, p.nombre_comercial,
           cp.precio::numeric as precio_publicado,
           coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                      where ps.producto_id = cp.producto_id
                        and ps.sucursal_id is not null), 0)::numeric as stock,
           coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                      where v.producto_id = cp.producto_id
                        and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vendio_3m
      from canal_publicaciones cp
      join canales_venta cv on cv.id = cp.canal_id
      join productos_catalogo p on p.id = cp.producto_id
     where cp.estado = 'publish' and cv.tipo <> 'mostrador'
  )
  select
    'canal_sin_stock:' || x.canal_id || ':' || x.clave_sku,
    x.sucursal_despacho_id, x.producto_id,
    format('%s está publicado en %s y SIFACO no declara unidades en ninguna sucursal. %s',
           x.nombre_comercial, x.canal,
           case when x.vendio_3m > 0
                then format('Vendió %s unidades en 3 meses.', round(x.vendio_3m))
                else 'No registra venta en 3 meses.' end),
    case when x.vendio_3m > 0 and x.precio_publicado is not null
         then round(x.vendio_3m / 3.0 * x.precio_publicado, 2) end,
    case when x.vendio_3m = 0
         then 'no se estima plata: no registra venta en 3 meses, así que no hay venta en riesgo. El hallazgo es que está publicado sin nada atrás.'
         when x.precio_publicado is null
         then 'no se puede costear: la publicación no trae precio'
         else format('las %s unidades por mes que vende, por el precio publicado de $%s. Es la venta de un mes en riesgo, no una pérdida ya ocurrida.',
                     round(x.vendio_3m / 3.0, 1), plata_texto(x.precio_publicado)) end,
    jsonb_build_object('canal', x.canal, 'sku', x.sku,
                       'stock_sifaco', x.stock, 'vendio_3m', x.vendio_3m,
                       'precio_publicado', x.precio_publicado)
  from x
  where x.stock = 0;
$function$
;

CREATE OR REPLACE FUNCTION public.detectar_canal_no_actualiza()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    'canal_no_actualiza:' || cp.canal_id || ':' || coalesce(cp.sku, 'ext-' || cp.externo_id),
    cv.sucursal_despacho_id, null::uuid,
    case when cp.sku is null or btrim(cp.sku) = '' then
      format('%s está publicado en %s SIN NINGÚN SKU. No es que el código no cruce: no hay código. A este no se lo puede ni buscar en SIFACO.',
             cp.nombre, cv.nombre)
    else
      format('%s está publicado en %s con el SKU %s y ese código no cruza con el maestro de SIFACO. Ninguna actualización de precio o de stock le llega. %s',
             cp.nombre, cv.nombre, cp.sku,
             case
               when cp.sku ~ '^-[0-9]+$' then
                 'El código es negativo: en SIFACO eso es el código alternativo, y el que manda es el principal.'
               when exists (select 1 from productos_catalogo p where p.sku = cp.sku) then
                 'El código existe en el catálogo y aun así no cruzó, así que el problema es del cruce y no del código.'
               else
                 'El código no está en el catálogo: puede ser un producto dado de baja en SIFACO.'
             end)
    end,
    null::numeric,
    'no se puede costear, y eso es el hallazgo: sin cruce no hay precio de mostrador ni costo, así que no hay con qué calcular nada. Inventar una plata acá sería inventar justamente el dato que falta.',
    jsonb_build_object(
      'canal', cv.nombre, 'sku', cp.sku, 'externo_id', cp.externo_id,
      'nombre_en_el_canal', cp.nombre,
      'estado', cp.estado, 'precio_publicado', cp.precio,
      'stock_publicado', cp.stock, 'permalink', cp.permalink,
      'sin_sku', cp.sku is null or btrim(cp.sku) = '',
      'codigo_negativo', cp.sku ~ '^-[0-9]+$',
      'el_sku_existe_en_el_catalogo',
        cp.sku is not null and exists (select 1 from productos_catalogo p where p.sku = cp.sku))
  from canal_publicaciones cp
  join canales_venta cv on cv.id = cp.canal_id
  where cp.producto_id is null and cv.tipo <> 'mostrador';
$function$
;
comment on function public.detectar_canal_no_actualiza() is
  'B.3 · Los que no cruzan con el maestro, con tres casos distintos: sin SKU '
  '(el peor: no se puede ni buscar), con codigo negativo (el alternativo de '
  'SIFACO), y con un codigo que existe y aun asi no cruzo. La plata es null y '
  'el motivo ES el hallazgo.';

revoke all on function public.detectar_canal_legal_publicado() from public, anon, authenticated;
revoke all on function public.detectar_canal_apagado_con_stock() from public, anon, authenticated;
revoke all on function public.detectar_canal_sin_stock() from public, anon, authenticated;
revoke all on function public.detectar_canal_no_actualiza() from public, anon, authenticated;
grant execute on function public.detectar_canal_legal_publicado() to service_role;
grant execute on function public.detectar_canal_apagado_con_stock() to service_role;
grant execute on function public.detectar_canal_sin_stock() to service_role;
grant execute on function public.detectar_canal_no_actualiza() to service_role;
