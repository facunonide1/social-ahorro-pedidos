-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · B · LOS 57,7 MILLONES, ACCIONABLES
--
-- Es el número más grande que encontró el sistema y el único que es plata que
-- YA está en el depósito: 1.790 productos apagados en un canal, con stock.
--
-- Esta migración NO calcula nada nuevo. Hace tres cosas:
--
--   1. Saca la fórmula del margen por canal a UNA función, y hace que la use
--      también `canal_producto_no_conviene`, que la tenía escrita adentro.
--      Dos lugares calculando el mismo margen se desincronizan, y el que esté
--      mal va a ser el que se mire.
--   2. Lee los 1.790 con todo lo que hace falta para decidir, ordenados por
--      plata, y separa los que convienen de los que pierden igual.
--   3. Devuelve el número que importa: la oportunidad real después de sacar
--      los que no convienen.
--
-- ── POR QUÉ LAS RAZONES SON HIPÓTESIS Y NO HECHOS ──────────────────────────
--
-- Porque **el sistema no sabe por qué un producto está apagado.** WooCommerce
-- no informa quién lo pasó a borrador ni cuándo ni por qué, y PedidosYa menos.
-- Lo único que hay son hechos del entorno que podrían explicarlo.
--
-- Decir «está apagado porque no tiene foto» cuando no tiene foto es
-- afirmación; decir «no tiene foto, y eso podría explicarlo» es lo que se
-- puede sostener. La diferencia importa porque alguien va a cargar una foto y
-- esperar que se publique solo.
--
-- Y una hipótesis que aplica al 100% de los casos no es una hipótesis: es
-- estado del negocio. «Sin foto» es exactamente eso —las 7.600 publicaciones
-- de la tienda propia están sin foto— así que no se ofrece arriba. Va al pie,
-- como contexto, igual que la segunda regla de la v1.4: un detector que marca
-- todo no marca nada.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · LA FÓRMULA, EN UN SOLO LUGAR ───────────────────────────────────────
--
-- `r` es lo que queda para el negocio por unidad vendida por ese canal, y
-- `en_mostrador` lo que quedaría de la misma unidad vendida en el mostrador.
-- La comparación entre las dos es toda la pregunta del bloque C de la v1.4.
create or replace function public.canal_queda_por_unidad(
  p_canal text, p_mostrador numeric, p_costo numeric
) returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case
    when cv.id is null then jsonb_build_object(
      'se_puede', false,
      'por_que_no', format('el canal %s no existe o no está activo', p_canal))
    when p_mostrador is null or p_costo is null then jsonb_build_object(
      'se_puede', false,
      'por_que_no', case
        when p_costo is null then 'el producto no tiene costo cargado: sin costo no hay margen que calcular'
        else 'el producto no tiene precio sugerido en el maestro' end)
    else jsonb_build_object(
      'se_puede', true,
      'precio_en_el_canal', round(p_mostrador * (1 + cv.margen_extra_pct / 100.0), 2),
      'queda_para_el_negocio', round(
        p_mostrador * (1 + cv.margen_extra_pct / 100.0) * (1 - cv.comision_pct / 100.0)
        - p_costo
        - case when cv.envio_lo_paga = 'negocio' then coalesce(cv.costo_envio, 0) else 0 end, 2),
      'resultado_mostrador', round(p_mostrador - p_costo, 2),
      'diferencia', round(
        (p_mostrador * (1 + cv.margen_extra_pct / 100.0) * (1 - cv.comision_pct / 100.0)
         - p_costo
         - case when cv.envio_lo_paga = 'negocio' then coalesce(cv.costo_envio, 0) else 0 end)
        - (p_mostrador - p_costo), 2),
      'comision_pct', cv.comision_pct,
      'comision_confirmada', cv.comision_confirmada,
      'recargo_pct', cv.margen_extra_pct,
      'envio_lo_descuenta', cv.envio_lo_paga = 'negocio' and coalesce(cv.costo_envio, 0) > 0)
  end
  from (select 1) z
  left join canales_venta cv on cv.id = p_canal and cv.activo;
$$;

comment on function public.canal_queda_por_unidad(text, numeric, numeric) is
  'v1.5 · la formula del margen por canal, en un solo lugar. La usan '
  'canal_producto_no_conviene y canal_apagados_con_stock: dos copias de la '
  'misma cuenta se desincronizan y la que este mal va a ser la que se mire.';

-- ── 2 · LOS 1.790, CON TODO LO QUE HACE FALTA PARA DECIDIR ─────────────────
create or replace function public.canal_apagados_con_stock(
  p_canal text default null, p_limite integer default 200
) returns table(
  anomalia_id uuid, canal_id text, canal text,
  producto_id uuid, sku text, nombre text,
  stock numeric, costo numeric, plata_quieta numeric,
  precio_mostrador numeric, precio_en_el_canal numeric,
  queda_para_el_negocio numeric, resultado_mostrador numeric, diferencia numeric,
  -- true conviene · false pierde igual · **null no se puede saber**
  conviene boolean, pierde_plata boolean, por_que_no_se_puede_saber text,
  -- B.3 · las razones posibles, como hipótesis
  hipotesis jsonb, se_sabe_por_que boolean,
  hecho text, como_se_calculo text,
  vence_at timestamptz, de_cuantos_es_este integer
)
language sql stable security definer set search_path to 'public'
as $$
  with apagados as (
    select a.id, a.producto_id, a.plata_en_juego, a.hecho, a.como_se_calculo,
           a.vence_at,
           -- La clave es `canal_apagado:<canal>:<sku>`. El canal sale de ahí y
           -- no de `evidencia`, que es jsonb y podría no traerlo.
           split_part(a.clave, ':', 2) as canal_id,
           (a.evidencia ->> 'sku') as sku,
           (a.evidencia ->> 'stock')::numeric as stock,
           (a.evidencia ->> 'costo')::numeric as costo
      from anomalias a
     where a.detector = 'canal_apagado_con_stock'
       and a.estado in ('abierta', 'reaparecio')
  ),
  conq as (
    select ap.*, cv.nombre as canal_nombre,
           cv.permite_receta, cv.permite_controlados, cv.categorias_excluidas,
           p.nombre_comercial, p.precio_sugerido::numeric as mostrador,
           p.foto_url, p.condicion_venta::text as condicion, p.lista_controlado,
           -- El stock que el canal tenía cuando se leyó el catálogo. Si era 0
           -- y hoy SIFACO dice que hay, eso explicaría el apagado — y es un
           -- hecho verificable, no una suposición.
           cp.stock as stock_en_el_canal, cp.permalink,
           -- Lo rechazó la plataforma. Hoy la tabla está vacía: el detector
           -- correspondiente está esperando que entre un archivo de rechazos.
           exists (select 1 from canal_rechazos r
                    where r.canal_id = ap.canal_id and r.sku = ap.sku) as fue_rechazado,
           canal_queda_por_unidad(ap.canal_id, p.precio_sugerido::numeric, ap.costo) as q
      from apagados ap
      left join canales_venta cv on cv.id = ap.canal_id
      left join productos_catalogo p on p.id = ap.producto_id
      left join canal_publicaciones cp
        on cp.canal_id = ap.canal_id and cp.producto_id = ap.producto_id
     where p_canal is null or ap.canal_id = p_canal
  ),
  juzgados as (
    select c.*,
      (c.q ->> 'se_puede')::boolean as se_puede,
      (c.q ->> 'queda_para_el_negocio')::numeric as queda,
      (c.q ->> 'resultado_mostrador')::numeric as en_mostrador,
      (c.q ->> 'diferencia')::numeric as dif,
      (c.q ->> 'precio_en_el_canal')::numeric as precio_canal,
      -- B.4 · LA SEPARACIÓN. «Conviene» es que deje al menos lo mismo que el
      -- mostrador. Un producto que tiene stock pero pierde plata en ese canal
      -- NO va en la lista de publicar: tenerlo apagado es la decisión correcta.
      case when (c.q ->> 'se_puede')::boolean
           then (c.q ->> 'queda_para_el_negocio')::numeric
                >= (c.q ->> 'resultado_mostrador')::numeric end as conviene_calc,
      case when (c.q ->> 'se_puede')::boolean
           then (c.q ->> 'queda_para_el_negocio')::numeric < 0 end as pierde_calc
      from conq c
  ),
  -- B.3 · LAS HIPÓTESIS. Cada una con el hecho que la sostiene, y ninguna
  -- afirmada. `sin foto` no entra: es el 100% de los casos y no distingue.
  con_hipotesis as (
    select j.*,
      (
        select coalesce(jsonb_agg(h order by h ->> 'peso' desc), '[]'::jsonb)
          from (
            select jsonb_build_object(
              'que', 'La condición legal lo bloquea en este canal',
              'el_hecho', format('el producto es «%s» y el canal %s receta',
                j.condicion, case when j.permite_receta then 'acepta' else 'no acepta' end),
              'si_es_esto', 'entonces está bien apagado y no hay que publicarlo',
              'peso', 3)
             where j.condicion is not null and j.condicion <> 'venta_libre'
               and coalesce(j.permite_receta, false) = false
            union all
            select jsonb_build_object(
              'que', 'Es un controlado y el canal no los acepta',
              'el_hecho', format('está en la lista %s de controlados', j.lista_controlado),
              'si_es_esto', 'entonces está bien apagado: es la regla de oro 9',
              'peso', 3)
             where j.lista_controlado is not null
               and coalesce(j.permite_controlados, false) = false
            union all
            select jsonb_build_object(
              'que', 'La plataforma lo rechazó',
              'el_hecho', 'figura en los rechazos informados por el canal',
              'si_es_esto', 'hay que ver el motivo del rechazo antes de volver a subirlo',
              'peso', 2)
             where j.fue_rechazado
            union all
            select jsonb_build_object(
              'que', 'No tenía stock cuando se leyó el catálogo',
              'el_hecho', format('el canal lo tenía en %s unidades y SIFACO dice que hay %s',
                                 coalesce(j.stock_en_el_canal::text, 'sin dato'),
                                 coalesce(j.stock::text, 'sin dato')),
              'si_es_esto', 'se arregla sincronizando: el stock ya volvió',
              'peso', 2)
             where coalesce(j.stock_en_el_canal, 0) = 0 and coalesce(j.stock, 0) > 0
          ) z(h)
      ) as hip
      from juzgados j
  ),
  final as (
    select h.*,
      jsonb_array_length(h.hip) > 0 as sabe,
      count(*) over () as cuantos
      from con_hipotesis h
  )
  select f.id, f.canal_id, coalesce(f.canal_nombre, f.canal_id),
         f.producto_id, f.sku, coalesce(f.nombre_comercial, '(sin nombre en el maestro)'),
         f.stock, f.costo, f.plata_en_juego,
         f.mostrador, f.precio_canal,
         f.queda, f.en_mostrador, f.dif,
         f.conviene_calc, f.pierde_calc,
         case when not f.se_puede then (f.q ->> 'por_que_no') end,
         case when f.sabe then f.hip
              -- No sabe. Y lo dice, en vez de devolver una lista vacía que se
              -- lee como «no hay nada raro».
              else jsonb_build_array(jsonb_build_object(
                'que', 'No se sabe por qué está apagado',
                'el_hecho', 'el canal no informa quién lo apagó ni cuándo ni por qué, y no hay '
                            'ningún hecho del entorno que lo explique',
                'si_es_esto', 'lo más probable es que lo haya apagado una persona. Hay que '
                              'preguntar antes de volver a publicarlo',
                'peso', 0)) end,
         f.sabe,
         f.hecho, f.como_se_calculo, f.vence_at,
         f.cuantos::integer
    from final f
   -- B.2 · POR PLATA, no alfabética. Y los que no se pueden juzgar al final:
   -- no son una oportunidad ni un descarte, son una pregunta abierta.
   order by case when f.se_puede then 0 else 1 end,
            f.plata_en_juego desc nulls last
   limit p_limite;
$$;

comment on function public.canal_apagados_con_stock(text, integer) is
  'v1.5 · B · los apagados con stock, con todo lo que hace falta para decidir. '
  'Acotado a proposito y con de_cuantos_es_este: sin limite son 1.790 y '
  'PostgREST entrega 1.000 sin avisar.';

-- ── 3 · B.6 · EL NÚMERO QUE IMPORTA ───────────────────────────────────────
--
-- Los $57,7 M son el total. La oportunidad real es lo que queda después de
-- sacar los que pierden plata igual: publicar esos no recupera nada, empeora.
create or replace function public.canal_apagados_resumen(p_canal text default null)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with t as (
    select * from canal_apagados_con_stock(p_canal, 100000)
  )
  select jsonb_build_object(
    'productos', (select count(*) from t),
    'plata_total', (select round(coalesce(sum(plata_quieta), 0)) from t),

    'conviene_publicar', (select count(*) from t where conviene),
    'plata_conviene', (select round(coalesce(sum(plata_quieta), 0)) from t where conviene),

    'no_conviene', (select count(*) from t where conviene = false),
    'plata_no_conviene', (select round(coalesce(sum(plata_quieta), 0)) from t where conviene = false),
    'pierden_plata', (select count(*) from t where pierde_plata),

    'no_se_puede_juzgar', (select count(*) from t where conviene is null),
    'plata_no_se_puede_juzgar', (select round(coalesce(sum(plata_quieta), 0)) from t where conviene is null),

    'se_sabe_por_que_estan_apagados', (select count(*) from t where se_sabe_por_que),
    'no_se_sabe_por_que', (select count(*) from t where not se_sabe_por_que),

    'como_se_calculo',
      'La plata se valúa a costo: es plata que ya se pagó y está quieta, no una venta perdida. '
      'La oportunidad real saca a los que dejarían menos que el mostrador en ese canal — '
      'publicarlos no recupera nada, empeora — y saca también a los que no se pueden juzgar '
      'porque no tienen costo cargado.',
    'que_no_dice',
      'No dice que publicar los que convienen vaya a vender. Dice que hoy nadie los puede '
      'comprar en ese canal teniendo stock. La tienda propia tiene 4.669 productos publicados '
      'y 21 pedidos en total: publicar es condición necesaria, no suficiente.');
$$;

comment on function public.canal_apagados_resumen(text) is
  'v1.5 · B.6 · la oportunidad real, despues de sacar los que pierden igual y '
  'los que no se pueden juzgar. Ese es el numero que importa, no los 57,7 M.';

-- ── 4 · LA FÓRMULA VIEJA PASA A USAR LA NUEVA ──────────────────────────────
--
-- Misma cuenta, un solo lugar. Se verifica en `scripts/prueba-apagados.ts`:
-- si las dos dejaran de coincidir, la prueba falla.
drop function if exists public.canal_producto_no_conviene(text, integer);
create or replace function public.canal_producto_no_conviene(
  p_canal text default null, p_limite integer default 200
) returns table(
  canal_id text, canal text, producto_id uuid, sku text, nombre text,
  precio_mostrador numeric, costo numeric, precio_en_el_canal numeric,
  queda_para_el_negocio numeric, resultado_mostrador numeric, diferencia numeric,
  vende_3m numeric, plata_al_ano_si_se_vendiera_todo_ahi numeric,
  pierde_plata boolean, medido_o_proyectado text,
  hecho text, el_supuesto text, de_cuantos_es_este integer
)
language sql stable security definer set search_path to 'public'
as $$
  with cv as (
    select * from canales_venta
     where activo and tipo <> 'mostrador'
       and (p_canal is null or id = p_canal)
  ),
  universo as (
    select cv.id as canal_id, cv.nombre as canal, cv.comision_pct,
           cv.catalogo_cargado, cv.comision_confirmada,
           p.id as producto_id, p.sku, p.nombre_comercial,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo
      from cv
      join productos_catalogo p
        on p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
     where (not cv.catalogo_cargado)
        or exists (select 1 from canal_publicaciones cp
                    where cp.canal_id = cv.id and cp.producto_id = p.id
                      and cp.estado = 'publish')
  ),
  calc as (
    select u.*,
      coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                 where v.producto_id = u.producto_id
                   and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m,
      -- LA MISMA FUNCIÓN que usa `canal_apagados_con_stock`. Antes la cuenta
      -- estaba escrita acá adentro y también allá: dos copias del mismo
      -- margen, que es la forma más silenciosa de que dos pantallas digan
      -- números distintos del mismo producto.
      canal_queda_por_unidad(u.canal_id, u.mostrador, u.costo) as q
      from universo u
  ),
  abierto as (
    select c.*,
      (c.q ->> 'precio_en_el_canal')::numeric as precio_canal,
      (c.q ->> 'queda_para_el_negocio')::numeric as queda,
      (c.q ->> 'resultado_mostrador')::numeric as en_mostrador
      from calc c
     where (c.q ->> 'se_puede')::boolean
  ),
  peores as (
    select a.* from abierto a where a.queda < a.en_mostrador
  )
  select p.canal_id, p.canal, p.producto_id, p.sku, p.nombre_comercial,
         p.mostrador, p.costo, p.precio_canal, p.queda, p.en_mostrador,
         round(p.queda - p.en_mostrador, 2),
         p.vende_3m,
         case when p.vende_3m > 0
              then round((p.queda - p.en_mostrador) * p.vende_3m / 3.0 * 12, 2) end,
         p.queda < 0,
         case when p.catalogo_cargado then 'medido' else 'proyectado' end,
         format('%s%s en %s: se cobraría $%s y quedarían $%s después de la comisión del %s%% y el costo de $%s, contra $%s en el mostrador. Son $%s menos por unidad.%s',
                case when p.catalogo_cargado then '' else 'PROYECTADO — ' end,
                p.nombre_comercial, p.canal,
                plata_texto(p.precio_canal), plata_texto(p.queda),
                p.comision_pct, plata_texto(p.costo), plata_texto(p.en_mostrador),
                plata_texto(abs(p.queda - p.en_mostrador)),
                case when p.queda < 0
                     then ' Y no es que deje menos: pierde plata en cada unidad.' else '' end),
         case when p.vende_3m > 0 then
           format('la plata al año supone que las %s unidades que este producto vende cada 3 meses pasarían a venderse POR ESTE CANAL. Hoy no pasa: la tienda propia tiene 7.737 productos publicados y 21 pedidos. Lo que sí se puede afirmar sin supuestos son los $%s menos por unidad%s',
                  round(p.vende_3m), plata_texto(abs(p.queda - p.en_mostrador)),
                  case when p.queda < 0 then ' y que el resultado es negativo' else '' end)
         else
           'no se proyecta plata al año: este producto no registra venta en 3 meses'
         end,
         (select count(*)::integer from peores)
    from peores p
   order by case when p.queda < 0 then 0 else 1 end,
            case when p.vende_3m > 0
                 then (p.queda - p.en_mostrador) * p.vende_3m else 0 end,
            p.queda - p.en_mostrador
   limit p_limite;
$$;

-- ── 5 · LOS PERMISOS ──────────────────────────────────────────────────────
--
-- `revoke ... from public, anon` NO alcanza en este proyecto: hay
-- `alter default privileges ... grant execute to authenticated`, así que esa
-- concesión no viene de PUBLIC y revocar PUBLIC no la toca. Hay que revocar
-- `authenticated` aparte. Es la octava vez que aparece la misma forma de error.
revoke all on function public.canal_queda_por_unidad(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public.canal_apagados_con_stock(text, integer) from public, anon, authenticated;
revoke all on function public.canal_apagados_resumen(text) from public, anon, authenticated;
revoke all on function public.canal_producto_no_conviene(text, integer) from public, anon, authenticated;
