-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0241 · EL TOPE ES POR DIA, NO POR CORRIDA                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Correr la deteccion tres veces el mismo dia dejo esto:
--
--   proveedor_cambio       tope 5 · publicados hoy 15
--   empezo_a_vender_mas    tope 5 · publicados hoy 15
--   dejo_de_venderse       tope 5 · publicados hoy 15
--   monto_fuera_habitual   tope 5 · publicados hoy 15
--
-- El publicador elegia entre los que tenian `publicado_at` en null y cortaba
-- en cinco. Correcto por corrida, y por eso mismo equivocado: tres corridas
-- son quince avisos, y el tope decia cinco por dia.
--
-- Importa mas de lo que parece. El cron corre una vez, pero el dia que
-- alguien aprete «correr ahora» dos veces —o que un reintento de Vercel
-- repita el pedido— el presupuesto de interrupcion deja de existir sin que
-- nadie lo note. Un tope que se puede duplicar apretando un boton no es un
-- tope.
--
-- Ahora cada detector descuenta lo que ya publico hoy, y el presupuesto
-- global descuenta lo que ya se publico hoy entre todos. La segunda corrida
-- del dia no publica nada mas, y lo dice.
--
-- Este es el cuerpo final de `deteccion_correr`: incorpora el predicado del
-- indice parcial (0238) y el filtro de D.1 (0240).

create or replace function public.deteccion_correr()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_presupuesto int := coalesce((select max(valor)::int from compras_parametros
                                  where clave = 'avisos_por_corrida'), 40);
  v_dias_volver int := coalesce((select max(valor)::int from compras_parametros
                                  where clave = 'medidor_dias_para_cerrar'), 30);
  v_ya_hoy int;
  v_queda int;
  r record;
  v_encontrados int;
  v_nuevos int := 0;
  v_total int := 0;
  v_publicados int := 0;
  v_esperando int := 0;
  v_sin_plata int := 0;
  v_volvieron int := 0;
  v_apagados int := 0;
  v_por_detector jsonb := '[]'::jsonb;
  v_no_corrieron jsonb := '[]'::jsonb;
  v_silenciados jsonb := '[]'::jsonb;
begin
  create temp table _hallazgos (
    detector text, clave text, sucursal_id uuid, producto_id uuid,
    hecho text, plata numeric, como_se_calculo text, evidencia jsonb
  ) on commit drop;

  for r in
    select d.clave, d.funcion, d.tope_diario, e.puede_correr, e.por_que_no
      from detectores d
      join deteccion_estado() e on e.clave = d.clave
     where d.activo and d.funcion is not null
     order by d.orden
  loop
    if not r.puede_correr then
      v_no_corrieron := v_no_corrieron || jsonb_build_object(
        'detector', r.clave, 'por_que_no', r.por_que_no);
      continue;
    end if;

    execute format(
      'insert into _hallazgos select %L, clave, sucursal_id, producto_id, hecho, plata, como_se_calculo, evidencia from %I()',
      r.clave, r.funcion);
    get diagnostics v_encontrados = row_count;

    v_por_detector := v_por_detector || jsonb_build_object(
      'detector', r.clave, 'encontrados', v_encontrados, 'tope', r.tope_diario,
      'costeables', (select count(*) from _hallazgos h
                      where h.detector = r.clave and h.plata is not null),
      'publicados_hoy', (select count(*) from anomalias an
                          where an.detector = r.clave
                            and an.publicado_at >= date_trunc('day', now())));
    v_total := v_total + v_encontrados;
  end loop;

  -- D.5 · lo silenciado no entra. Se saca despues de correr y no antes: asi
  -- el detector sigue mirando y el reporte puede decir cuantos se callaron.
  for r in select * from deteccion_silencios() loop
    delete from _hallazgos h
     where h.detector = r.detector
       and exists (select 1 from deteccion_descartes dd
                    where dd.detector = r.detector and dd.motivo = r.motivo
                      and dd.clave = h.clave);
    get diagnostics v_encontrados = row_count;
    v_silenciados := v_silenciados || jsonb_build_object(
      'detector', r.detector, 'motivo', r.motivo,
      'callados', v_encontrados, 'por_que', r.por_que);
  end loop;

  -- D.6 · los descartes que volvieron, con los 30 dias de espera.
  update deteccion_descartes dd
     set volvio_at = now(), volvio_veces = dd.volvio_veces + 1
   where dd.volvio_at is null
     and dd.descartado_at < now() - make_interval(days => v_dias_volver)
     and exists (select 1 from _hallazgos h
                  where h.detector = dd.detector and h.clave = dd.clave);
  get diagnostics v_volvieron = row_count;

  -- Se guarda TODO, costeable o no: el tope y el presupuesto deciden que se
  -- PUBLICA. La lista larga tiene que estar completa o D.1 no existe.
  insert into anomalias (
    tipo, detector, clave, sucursal_id, producto_id,
    hecho, plata_en_juego, como_se_calculo, evidencia,
    estado, primera_vez, ultima_vez)
  select
    case when h.detector = 'comprobante_duplicado' then 'producto_duplicado'::anomalia_tipo
         else 'sin_costo_cargado'::anomalia_tipo end,
    h.detector, h.clave, h.sucursal_id, h.producto_id,
    h.hecho, h.plata, h.como_se_calculo, h.evidencia,
    'abierta', now(), now()
  from _hallazgos h
  on conflict (clave) do update set
    hecho = excluded.hecho,
    plata_en_juego = excluded.plata_en_juego,
    como_se_calculo = excluded.como_se_calculo,
    evidencia = excluded.evidencia,
    sucursal_id = excluded.sucursal_id,
    ultima_vez = now(),
    estado = case when anomalias.estado in ('resuelta', 'descartada')
                  then 'reaparecio'::anomalia_estado else anomalias.estado end,
    veces_reaparecio = case when anomalias.estado in ('resuelta', 'descartada')
                            then anomalias.veces_reaparecio + 1
                            else anomalias.veces_reaparecio end;

  -- Lo que ya se publico hoy entre todos: el presupuesto es del dia, no de
  -- la corrida.
  select count(*) into v_ya_hoy
    from anomalias an join detectores d on d.clave = an.detector
   where d.funcion is not null and an.publicado_at >= date_trunc('day', now());
  v_queda := greatest(v_presupuesto - v_ya_hoy, 0);

  -- ── D.1 + D.3 + D.4 · QUE SUBE ───────────────────────────────────────────
  with candidatos as (
    select an.id, an.detector, an.plata_en_juego,
           row_number() over (partition by an.detector
                              order by an.plata_en_juego desc) as puesto_detector,
           -- Lo que ese detector ya publico hoy. El tope es por dia: sin
           -- esto, tres corridas publican tres veces el tope.
           (select count(*) from anomalias y
             where y.detector = an.detector
               and y.publicado_at >= date_trunc('day', now())) as ya_hoy
      from anomalias an
      join detectores d on d.clave = an.detector
     where an.estado in ('abierta', 'reaparecio')
       and an.publicado_at is null
       and d.funcion is not null
       -- D.1 · sin plata estimada no sube, aunque su detector tenga el tope
       -- libre. Un hallazgo que no se puede comparar no puede ocupar un
       -- lugar en una lista que es una comparacion.
       and an.plata_en_juego is not null
  ),
  con_tope as (
    select c.id, c.plata_en_juego,
           row_number() over (order by c.plata_en_juego desc) as puesto_global
      from candidatos c
      join detectores d on d.clave = c.detector
     where c.puesto_detector <= greatest(d.tope_diario - c.ya_hoy, 0)
  ),
  publicados as (
    update anomalias set publicado_at = now()
     where id in (select id from con_tope where puesto_global <= v_queda)
    returning 1)
  select count(*) into v_publicados from publicados;

  select count(*) filter (where an.plata_en_juego is not null),
         count(*) filter (where an.plata_en_juego is null)
    into v_esperando, v_sin_plata
    from anomalias an join detectores d on d.clave = an.detector
   where an.estado in ('abierta', 'reaparecio') and an.publicado_at is null
     and d.funcion is not null;

  -- Los avisos, por el camino que ya existe: `nora_avisos` en estado
  -- `pendiente` con `clave_dedup`. El detalle lleva las tres cosas juntas: el
  -- hecho, de donde sale la plata, y lo que esto NO dice. Las tres o ninguna:
  -- un hecho sin su «no dice» es justamente el aviso que alguien va a leer
  -- como una acusacion.
  insert into nora_avisos (
    tipo, severidad, titulo, detalle, modulo, sucursal_id,
    accion_label, accion_href, entidad_ref, estado, clave_dedup, es_demo)
  select
    d.aviso_tipo::nora_aviso_tipo,
    case when an.plata_en_juego >= 1000000 then 'critico'
         when an.plata_en_juego >= 100000 then 'alerta'
         else 'sugerencia' end::nora_aviso_severidad,
    d.nombre,
    an.hecho || E'\n\n' ||
      'Plata en juego: $' || plata_texto(an.plata_en_juego) || '. ' ||
      'De donde sale: ' || coalesce(an.como_se_calculo, 'sin procedencia') ||
      E'\n\nLo que esto NO dice: ' || d.que_no_dice,
    'deteccion', an.sucursal_id,
    'Ver', coalesce(d.aviso_href, '/admin'),
    jsonb_build_object('anomalia_id', an.id, 'detector', an.detector,
                       'producto_id', an.producto_id),
    'pendiente', 'deteccion:' || an.clave, false
  from anomalias an
  join detectores d on d.clave = an.detector
  where an.publicado_at >= now() - interval '2 minutes'
    and d.aviso_tipo is not null
  on conflict (clave_dedup) where estado = 'pendiente' and clave_dedup is not null
  do nothing;
  get diagnostics v_nuevos = row_count;

  -- D.7 · el detector que nunca acierta se apaga, y queda dicho por que.
  update detectores d
     set activo = false,
         apagado_porque = mk.veredicto,
         apagado_at = now()
    from deteccion_marcador() mk
   where mk.detector = d.clave
     and d.activo
     and mk.se_puede_juzgar
     and mk.aciertos = 0;
  get diagnostics v_apagados = row_count;

  return jsonb_build_object(
    'corrio_en', now(),
    'encontrados', v_total,
    'publicados', v_publicados,
    'avisos_nuevos', v_nuevos,
    'ya_publicados_hoy_antes_de_esta_corrida', v_ya_hoy,
    'presupuesto_del_dia', v_presupuesto,
    'quedaba_del_presupuesto', v_queda,
    'esperando_con_plata', v_esperando,
    'en_la_lista_larga_sin_plata', v_sin_plata,
    'descartes_que_volvieron', v_volvieron,
    'detectores_apagados', v_apagados,
    'por_detector', v_por_detector,
    'no_corrieron', v_no_corrieron,
    'silenciados', v_silenciados);
end;
$$;

comment on function public.deteccion_correr() is
  'La corrida. Guarda TODO en anomalias (la lista larga de D.1) y publica solo '
  'los que tienen plata estimada (D.1), entran en el tope del detector PARA EL '
  'DIA (D.3) y en lo que queda del presupuesto del dia (D.4). Correrla dos '
  'veces no duplica nada: un tope que se puede duplicar apretando un boton no '
  'es un tope.';

-- Y se arregla lo que las tres corridas de prueba publicaron de mas: queda el
-- tope de cada detector, por plata, y el resto vuelve a la lista larga.
with ordenados as (
  select an.id, d.tope_diario,
         row_number() over (partition by an.detector
                            order by an.plata_en_juego desc) as puesto
    from anomalias an join detectores d on d.clave = an.detector
   where d.funcion is not null and an.publicado_at is not null
)
update anomalias set publicado_at = null
 where id in (select id from ordenados where puesto > tope_diario);

update nora_avisos set estado = 'resuelto', resuelto_at = now()
 where estado = 'pendiente' and clave_dedup like 'deteccion:%'
   and not exists (select 1 from anomalias an
                    where 'deteccion:' || an.clave = nora_avisos.clave_dedup
                      and an.publicado_at is not null);

revoke all on function public.deteccion_correr() from public, anon;
grant execute on function public.deteccion_correr() to service_role;
