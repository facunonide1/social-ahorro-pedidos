-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · B · LA FÓRMULA DEVUELVE UN REGISTRO, NO UN JSONB
--
-- 0282 la hizo pura y no alcanzó: devolvía jsonb, y leer cinco campos del
-- jsonb volvía a evaluar la función cinco veces por fila. 49.576 filas × 5 =
-- 10,8 segundos, por encima del tope de 8 que corta PostgREST.
--
-- Con un tipo compuesto y `cross join lateral` se evalúa UNA vez por fila y
-- las columnas salen expandidas: 1,7 s en `canal_producto_no_conviene` y
-- 0,9 s en `canal_apagados_con_stock`. Misma fórmula, mismo lugar, un quinto
-- del trabajo.
--
-- Los dos CTE van `materialized` a propósito. Sin eso Postgres los aplana y
-- vuelve a llamar la función por cada referencia, que es exactamente el
-- problema que esta migración resuelve.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname = 'canal_margen') then
    create type public.canal_margen as (
      se_puede boolean,
      por_que_no text,
      precio_en_el_canal numeric,
      queda_para_el_negocio numeric,
      resultado_mostrador numeric,
      diferencia numeric
    );
  end if;
end $$;

drop function if exists public.canal_queda_por_unidad(numeric, numeric, numeric, numeric, numeric);

create or replace function public.canal_queda_por_unidad(
  p_comision_pct numeric,
  p_recargo_pct numeric,
  p_costo_envio_del_negocio numeric,
  p_mostrador numeric,
  p_costo numeric
) returns public.canal_margen
language sql immutable parallel safe
as $$
  select
    p_mostrador is not null and p_costo is not null and p_comision_pct is not null,
    case
      when p_costo is null then 'el producto no tiene costo cargado: sin costo no hay margen que calcular'
      when p_mostrador is null then 'el producto no tiene precio sugerido en el maestro'
      when p_comision_pct is null then 'el canal no existe o no está activo'
    end,
    round(p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0), 2),
    round(p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0) * (1 - p_comision_pct / 100.0)
          - p_costo - coalesce(p_costo_envio_del_negocio, 0), 2),
    round(p_mostrador - p_costo, 2),
    round((p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0) * (1 - p_comision_pct / 100.0)
           - p_costo - coalesce(p_costo_envio_del_negocio, 0))
          - (p_mostrador - p_costo), 2);
$$;

comment on function public.canal_queda_por_unidad(numeric, numeric, numeric, numeric, numeric) is
  'v1.5 · la formula del margen por canal, en un solo lugar. Pura e immutable, '
  'y devuelve un registro para que `cross join lateral` la evalue una vez por '
  'fila: con jsonb se leia cinco veces y tardaba 10,8s sobre 49.576 filas.';

-- ── EL PRIMERO QUE LA USA ─────────────────────────────────────────────────
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
  calc as materialized (
    select cv.id as canal_id, cv.nombre as canal, cv.comision_pct,
           cv.catalogo_cargado,
           p.id as producto_id, p.sku, p.nombre_comercial,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo,
           coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                      where v.producto_id = p.id
                        and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m,
           q.precio_en_el_canal, q.queda_para_el_negocio as queda,
           q.resultado_mostrador as en_mostrador, q.se_puede
      from cv
      join productos_catalogo p
        on p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
      cross join lateral canal_queda_por_unidad(
        cv.comision_pct, cv.margen_extra_pct,
        case when cv.envio_lo_paga = 'negocio' then coalesce(cv.costo_envio, 0) else 0 end,
        p.precio_sugerido::numeric, p.precio_costo_promedio::numeric) q
     where ((not cv.catalogo_cargado)
        or exists (select 1 from canal_publicaciones cp
                    where cp.canal_id = cv.id and cp.producto_id = p.id
                      and cp.estado = 'publish'))
  ),
  peores as (
    select c.* from calc c where c.se_puede and c.queda < c.en_mostrador
  )
  select p.canal_id, p.canal, p.producto_id, p.sku, p.nombre_comercial,
         p.mostrador, p.costo, p.precio_en_el_canal, p.queda, p.en_mostrador,
         round(p.queda - p.en_mostrador, 2),
         p.vende_3m,
         case when p.vende_3m > 0
              then round((p.queda - p.en_mostrador) * p.vende_3m / 3.0 * 12, 2) end,
         p.queda < 0,
         case when p.catalogo_cargado then 'medido' else 'proyectado' end,
         format('%s%s en %s: se cobraría $%s y quedarían $%s después de la comisión del %s%% y el costo de $%s, contra $%s en el mostrador. Son $%s menos por unidad.%s',
                case when p.catalogo_cargado then '' else 'PROYECTADO — ' end,
                p.nombre_comercial, p.canal,
                plata_texto(p.precio_en_el_canal), plata_texto(p.queda),
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

-- ── Y EL SEGUNDO, QUE ES EL DEL BLOQUE B ──────────────────────────────────
create or replace function public.canal_apagados_con_stock(
  p_canal text default null, p_limite integer default 200
) returns table(
  anomalia_id uuid, canal_id text, canal text,
  producto_id uuid, sku text, nombre text,
  stock numeric, costo numeric, plata_quieta numeric,
  precio_mostrador numeric, precio_en_el_canal numeric,
  queda_para_el_negocio numeric, resultado_mostrador numeric, diferencia numeric,
  conviene boolean, pierde_plata boolean, por_que_no_se_puede_saber text,
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
  conq as materialized (
    select ap.*, cv.nombre as canal_nombre,
           p.nombre_comercial, p.precio_sugerido::numeric as mostrador,
           cp.stock as stock_en_el_canal,
           q.se_puede, q.por_que_no, q.precio_en_el_canal,
           q.queda_para_el_negocio as queda, q.resultado_mostrador as en_mostrador,
           q.diferencia as dif,
           -- B.3 · LAS HIPÓTESIS. Cada una con el hecho que la sostiene, y
           -- ninguna afirmada. «Sin foto» no entra: es el 100% de las
           -- publicaciones del canal y por lo tanto no distingue a nadie.
           (
             select coalesce(jsonb_agg(h order by h ->> 'peso' desc), '[]'::jsonb)
               from (
                 select jsonb_build_object(
                   'que', 'La condición legal lo bloquea en este canal',
                   'el_hecho', format('el producto es «%s» y el canal %s receta',
                     p.condicion_venta::text,
                     case when cv.permite_receta then 'acepta' else 'no acepta' end),
                   'si_es_esto', 'entonces está bien apagado y no hay que publicarlo',
                   'peso', 3)
                  where p.condicion_venta::text is not null
                    and p.condicion_venta::text <> 'venta_libre'
                    and coalesce(cv.permite_receta, false) = false
                 union all
                 select jsonb_build_object(
                   'que', 'Es un controlado y el canal no los acepta',
                   'el_hecho', format('está en la lista %s de controlados', p.lista_controlado),
                   'si_es_esto', 'entonces está bien apagado: es la regla de oro 9',
                   'peso', 3)
                  where p.lista_controlado is not null
                    and coalesce(cv.permite_controlados, false) = false
                 union all
                 select jsonb_build_object(
                   'que', 'La plataforma lo rechazó',
                   'el_hecho', 'figura en los rechazos informados por el canal',
                   'si_es_esto', 'hay que ver el motivo del rechazo antes de volver a subirlo',
                   'peso', 2)
                  where exists (select 1 from canal_rechazos r
                                 where r.canal_id = ap.canal_id and r.sku = ap.sku)
                 union all
                 select jsonb_build_object(
                   'que', 'No tenía stock cuando se leyó el catálogo',
                   'el_hecho', format('el canal lo tenía en %s unidades y SIFACO dice que hay %s',
                                      coalesce(cp.stock::text, 'sin dato'),
                                      coalesce((ap.evidencia_stock)::text, 'sin dato')),
                   'si_es_esto', 'se arregla sincronizando: el stock ya volvió',
                   'peso', 2)
                  where coalesce(cp.stock, 0) = 0 and coalesce(ap.evidencia_stock, 0) > 0
               ) z(h)
           ) as hip
      from (select ap.*, ap.stock as evidencia_stock from apagados ap) ap
      left join canales_venta cv on cv.id = ap.canal_id and cv.activo
      left join productos_catalogo p on p.id = ap.producto_id
      left join canal_publicaciones cp
        on cp.canal_id = ap.canal_id and cp.producto_id = ap.producto_id
      cross join lateral canal_queda_por_unidad(
        cv.comision_pct, cv.margen_extra_pct,
        case when cv.envio_lo_paga = 'negocio' then coalesce(cv.costo_envio, 0) else 0 end,
        p.precio_sugerido::numeric, ap.costo) q
     where p_canal is null or ap.canal_id = p_canal
  ),
  final as (
    select c.*,
      jsonb_array_length(c.hip) > 0 as sabe,
      count(*) over () as cuantos
      from conq c
  )
  select f.id, f.canal_id, coalesce(f.canal_nombre, f.canal_id),
         f.producto_id, f.sku, coalesce(f.nombre_comercial, '(sin nombre en el maestro)'),
         f.stock, f.costo, f.plata_en_juego,
         f.mostrador, case when f.se_puede then f.precio_en_el_canal end,
         case when f.se_puede then f.queda end,
         case when f.se_puede then f.en_mostrador end,
         case when f.se_puede then f.dif end,
         -- B.4 · «conviene» es que deje al menos lo mismo que el mostrador.
         case when f.se_puede then f.queda >= f.en_mostrador end,
         case when f.se_puede then f.queda < 0 end,
         case when not f.se_puede then f.por_que_no end,
         case when f.sabe then f.hip
              -- No sabe. Y lo dice, en vez de devolver una lista vacía que se
              -- lee como «no hay nada raro».
              else jsonb_build_array(jsonb_build_object(
                'que', 'No se sabe por qué está apagado',
                'el_hecho', 'el canal no informa quién lo apagó ni cuándo ni por qué, y no hay ningún hecho del entorno que lo explique',
                'si_es_esto', 'lo más probable es que lo haya apagado una persona. Hay que preguntar antes de volver a publicarlo',
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

revoke all on function public.canal_queda_por_unidad(numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.canal_apagados_con_stock(text, integer) from public, anon, authenticated;
revoke all on function public.canal_producto_no_conviene(text, integer) from public, anon, authenticated;
