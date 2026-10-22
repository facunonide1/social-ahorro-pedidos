-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0255 · LOS SEIS DETECTORES DE CANAL                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Los seis errores del bloque B, como detectores de la v1.3. Medidos en la
-- primera corrida:
--
--   B.1 legal publicado      ·    20 · sin plata a proposito
--   B.6 apagado con stock    · 1.790 · $57.780.179 ← el que mas plata mueve
--   B.2 publicado sin stock  · 1.027 · $7.224.360 (311 costeables)
--   B.3 no le llegan cambios ·   137 · sin plata, y el motivo ES el hallazgo
--   B.5 mal cargado          ·     3 · una fila por canal y carencia
--   B.4 rechazado            ·     0 · y no por falta de historia
--
-- Tres decisiones que hay que poder discutir:
--
--   · **B.6 se valua a COSTO y no a precio de venta.** Es plata que ya se
--     pago y esta quieta, no una venta perdida. Valuarla a precio seria
--     contar una ganancia que todavia no existe.
--   · **B.3 no tiene plata y eso es el hallazgo.** Sin cruce con el maestro
--     no hay precio de mostrador ni costo: inventar una plata aca seria
--     inventar justamente el dato que falta.
--   · **B.5 reporta el conjunto y no cada producto.** Ninguno de los 7.600
--     publicados tiene foto —`foto_url` esta vacio en todo el catalogo— y
--     seis mil filas que dicen «este no tiene foto» no son seis mil
--     hallazgos: son uno.
--
-- (Los cuerpos finales de B.1, B.2, B.3 y B.6 quedan en 0258, que arregla la
--  clave cuando no hay SKU.)

create table if not exists public.canal_rechazos (
  id            uuid primary key default gen_random_uuid(),
  canal_id      text not null references public.canales_venta(id) on delete cascade,
  sku           text,
  producto_id   uuid references public.productos_catalogo(id) on delete set null,
  motivo        text not null,
  detalle       text,
  rechazado_at  timestamptz,
  importacion_id uuid,
  registrado_at timestamptz not null default now()
);

comment on table public.canal_rechazos is
  'B.4 · Lo que la plataforma rechazo y por que, cuando el canal lo informa. '
  'La llena el importador del bloque H: hoy esta vacia porque ninguna '
  'plataforma esta informando rechazos.';

create index if not exists canal_rechazos_canal on public.canal_rechazos (canal_id, rechazado_at desc);
alter table public.canal_rechazos enable row level security;
drop policy if exists rechazos_ver on public.canal_rechazos;
create policy rechazos_ver on public.canal_rechazos
  for select to authenticated using (true);

insert into public.detectores
  (clave, familia, nombre, que_detecta, que_no_dice, historia_minima,
   tope_diario, orden, siempre_arriba, funcion, aviso_tipo, aviso_href, roles)
values
  ('canal_legal_publicado', 'canal', 'Publicado con receta o controlado',
   'Un producto de condicion legal visible en un canal abierto.',
   'No dice cual de los dos campos de SIFACO tiene razon: se contradicen en 12.746 productos y se usa el criterio conservador. Tampoco dice que haya una sancion: dice que esta publicado.',
   'ninguna: es un hecho de hoy',
   500, 1, true,
   'detectar_canal_legal_publicado', 'datos_sin_actualizar', '/admin/canales',
   array['super_admin','gerente','comprador','administrativo','auditor']),

  ('canal_apagado_con_stock', 'canal', 'Apagado con stock',
   'Esta en borrador en el canal y hay unidades en la sucursal: plata parada que nadie puede comprar.',
   'No dice que haya que publicarlo. Puede estar apagado a proposito — por eso el descarte con «es a proposito» calla al detector para ese producto.',
   'ninguna: el stock de la ultima foto de SIFACO',
   5, 10, false,
   'detectar_canal_apagado_con_stock', 'stock_dormido', '/admin/canales',
   array['super_admin','gerente','comprador','administrativo']),

  ('canal_sin_stock', 'canal', 'Publicado sin stock real',
   'Esta publicado y SIFACO no declara unidades en ninguna sucursal.',
   'No dice que el cliente vaya a cancelar: dice que si compra, no hay con que despachar. Y el stock es una foto diaria.',
   'la ultima foto de stock de SIFACO y los meses cerrados de venta para poder costear',
   5, 20, false,
   'detectar_canal_sin_stock', 'stock_por_agotarse', '/admin/canales',
   array['super_admin','gerente','comprador','encargado_sucursal','administrativo']),

  ('canal_no_actualiza', 'canal', 'No le llegan los cambios',
   'El SKU publicado no cruza con el maestro, asi que ninguna actualizacion de precio o de stock lo alcanza.',
   'No dice que el precio este mal: dice que no se puede saber, porque no hay contra que compararlo.',
   'ninguna: es un hecho de hoy',
   5, 30, false,
   'detectar_canal_no_actualiza', 'datos_sin_actualizar', '/admin/canales',
   array['super_admin','gerente','comprador','administrativo']),

  ('canal_mal_cargado', 'canal', 'Mal cargado para vender',
   'Sin foto, sin descripcion o con la unidad sin declarar.',
   'No dice cuanta venta se pierde por eso: un producto sin foto se vende menos y cuanto menos no esta en los datos.',
   'ninguna: es un hecho de hoy',
   5, 40, false,
   'detectar_canal_mal_cargado', 'datos_sin_actualizar', '/admin/descripciones',
   array['super_admin','gerente','comprador','marketing','administrativo']),

  ('canal_rechazado', 'canal', 'Rechazado por la plataforma',
   'La plataforma no acepto la publicacion y dijo por que.',
   'Hoy no dice nada: ninguna plataforma esta informando rechazos al sistema.',
   'un archivo de errores de la plataforma, subido por el importador del bloque H',
   5, 50, false,
   'detectar_canal_rechazado', 'datos_sin_actualizar', '/admin/canales',
   array['super_admin','gerente','comprador','administrativo'])
on conflict (clave) do update set
  familia = excluded.familia, nombre = excluded.nombre,
  que_detecta = excluded.que_detecta, que_no_dice = excluded.que_no_dice,
  historia_minima = excluded.historia_minima, tope_diario = excluded.tope_diario,
  orden = excluded.orden, siempre_arriba = excluded.siempre_arriba,
  funcion = excluded.funcion, aviso_tipo = excluded.aviso_tipo,
  aviso_href = excluded.aviso_href, roles = excluded.roles;

-- Los seis cuerpos, tal como quedaron aplicados.
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

CREATE OR REPLACE FUNCTION public.detectar_canal_mal_cargado()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pub as (
    select cp.canal_id, cv.nombre as canal, cv.sucursal_despacho_id,
           cp.sku, cp.producto_id, p.nombre_comercial,
           (p.foto_url is null or btrim(p.foto_url) = '') as sin_foto,
           (p.descripcion is null or btrim(p.descripcion) = '')
             and not exists (select 1 from producto_descripciones d
                              where d.producto_id = p.id and d.estado = 'aprobada') as sin_descripcion,
           (p.unidades_por_envase is null or p.tipo_unidad is null) as sin_unidad
      from canal_publicaciones cp
      join canales_venta cv on cv.id = cp.canal_id
      join productos_catalogo p on p.id = cp.producto_id
     where cp.estado = 'publish' and cv.tipo <> 'mostrador'
  ),
  -- Cuando le falta a TODOS, es un hallazgo del conjunto y no de cada uno.
  totales as (
    select canal_id, canal, sucursal_despacho_id,
           count(*) as publicados,
           count(*) filter (where sin_foto) as sin_foto,
           count(*) filter (where sin_descripcion) as sin_descripcion,
           count(*) filter (where sin_unidad) as sin_unidad
      from pub group by 1, 2, 3
  )
  -- Una fila por canal y por carencia, con el conteo. Seis mil filas que
  -- dicen «este no tiene foto» no son seis mil hallazgos: son uno.
  select
    'canal_mal_cargado:' || t.canal_id || ':' || f.que,
    t.sucursal_despacho_id, null::uuid,
    case when f.n = t.publicados
      then format('Los %s productos publicados en %s %s. No es que falten algunos: faltan todos.',
                  t.publicados, t.canal, f.texto)
      else format('%s de los %s productos publicados en %s %s.',
                  f.n, t.publicados, t.canal, f.texto)
    end,
    null::numeric,
    'no se puede costear: cuánta venta se pierde por esto no está en los datos. Estimarlo con un porcentaje de la bibliografía daría un número inventado con cara de medido.',
    jsonb_build_object('canal', t.canal, 'carencia', f.que,
                       'cuantos', f.n, 'publicados', t.publicados,
                       'le_falta_a_todos', f.n = t.publicados)
  from totales t
  cross join lateral (values
    ('sin_foto', t.sin_foto, 'no tienen foto'),
    ('sin_descripcion', t.sin_descripcion, 'no tienen descripción'),
    ('sin_unidad', t.sin_unidad, 'no declaran la unidad de venta')
  ) as f(que, n, texto)
  where f.n > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.detectar_canal_rechazado()
 RETURNS TABLE(clave text, sucursal_id uuid, producto_id uuid, hecho text, plata numeric, como_se_calculo text, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    'canal_rechazo:' || r.id::text,
    cv.sucursal_despacho_id, r.producto_id,
    format('%s rechazó %s: %s',
           cv.nombre, coalesce(r.sku, 'una publicación'), r.motivo),
    null::numeric,
    'no se puede costear: la plataforma informa el rechazo y no lo que costó.',
    jsonb_build_object('canal', cv.nombre, 'sku', r.sku, 'motivo', r.motivo,
                       'detalle', r.detalle, 'cuando', r.rechazado_at)
  from canal_rechazos r
  join canales_venta cv on cv.id = r.canal_id;
$function$
;
revoke all on function public.detectar_canal_legal_publicado() from public, anon, authenticated;
revoke all on function public.detectar_canal_apagado_con_stock() from public, anon, authenticated;
revoke all on function public.detectar_canal_sin_stock() from public, anon, authenticated;
revoke all on function public.detectar_canal_no_actualiza() from public, anon, authenticated;
revoke all on function public.detectar_canal_mal_cargado() from public, anon, authenticated;
revoke all on function public.detectar_canal_rechazado() from public, anon, authenticated;
grant execute on function public.detectar_canal_legal_publicado() to service_role;
grant execute on function public.detectar_canal_apagado_con_stock() to service_role;
grant execute on function public.detectar_canal_sin_stock() to service_role;
grant execute on function public.detectar_canal_no_actualiza() to service_role;
grant execute on function public.detectar_canal_mal_cargado() to service_role;
grant execute on function public.detectar_canal_rechazado() to service_role;
