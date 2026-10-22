-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0257 · LO LEGAL SE PUBLICA ADEMAS DEL PRESUPUESTO, NO DENTRO            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `siempre_arriba` tenia que entrar al publicador, y la pregunta era donde.
--
-- Si lo legal entra DENTRO del presupuesto de 40, los 20 publicados con receta
-- se comen la mitad del dia y los otros once detectores publican la mitad.
-- Si entra ADEMAS, el presupuesto de interrupcion deja de ser un tope
-- absoluto.
--
-- Gana «ademas», con una condicion: **la corrida lo dice aparte.** El
-- presupuesto sigue significando lo que significaba —cuanto puede interrumpir
-- el sistema por su cuenta— y la excepcion queda a la vista en vez de
-- disolverse en el total.
--
-- Es la misma forma del tope de D.3: un tope que se puede saltar sin que se
-- vea no es un tope. Este se puede saltar, se ve, y lo salta un solo detector
-- — y el auditor del limite falla si alguna vez lo saltan dos.

CREATE OR REPLACE FUNCTION public.deteccion_correr()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_legales int := 0;
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
    select d.clave, d.funcion, d.tope_diario, d.siempre_arriba,
           e.puede_correr, e.por_que_no
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
      'siempre_arriba', r.siempre_arriba,
      'costeables', (select count(*) from _hallazgos h
                      where h.detector = r.clave and h.plata is not null),
      'publicados_hoy', (select count(*) from anomalias an
                          where an.detector = r.clave
                            and an.publicado_at >= date_trunc('day', now())));
    v_total := v_total + v_encontrados;
  end loop;

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

  update deteccion_descartes dd
     set volvio_at = now(), volvio_veces = dd.volvio_veces + 1
   where dd.volvio_at is null
     and dd.descartado_at < now() - make_interval(days => v_dias_volver)
     and exists (select 1 from _hallazgos h
                  where h.detector = dd.detector and h.clave = dd.clave);
  get diagnostics v_volvieron = row_count;

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

  -- ── LO LEGAL, PRIMERO Y SIN TOPE ─────────────────────────────────────────
  --
  -- Antes del presupuesto, para que el presupuesto se calcule sobre lo
  -- discrecional y no sobre esto.
  with legales as (
    update anomalias an set publicado_at = now()
     where an.publicado_at is null
       and an.estado in ('abierta', 'reaparecio')
       and an.detector in (select clave from detectores where siempre_arriba)
    returning 1)
  select count(*) into v_legales from legales;

  -- Lo que ya se publico hoy por el camino normal: lo legal no cuenta.
  select count(*) into v_ya_hoy
    from anomalias an join detectores d on d.clave = an.detector
   where d.funcion is not null and not d.siempre_arriba
     and an.publicado_at >= date_trunc('day', now());
  v_queda := greatest(v_presupuesto - v_ya_hoy, 0);

  with candidatos as (
    select an.id, an.detector, an.plata_en_juego,
           row_number() over (partition by an.detector
                              order by an.plata_en_juego desc) as puesto_detector,
           (select count(*) from anomalias y
             where y.detector = an.detector
               and y.publicado_at >= date_trunc('day', now())) as ya_hoy
      from anomalias an
      join detectores d on d.clave = an.detector
     where an.estado in ('abierta', 'reaparecio')
       and an.publicado_at is null
       and d.funcion is not null
       and not d.siempre_arriba
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

  -- Los avisos. Lo legal va como critico siempre: no tiene plata y es lo
  -- unico del sistema que no admite esperar.
  insert into nora_avisos (
    tipo, severidad, titulo, detalle, modulo, sucursal_id,
    accion_label, accion_href, entidad_ref, estado, clave_dedup, es_demo)
  select
    d.aviso_tipo::nora_aviso_tipo,
    case when d.siempre_arriba then 'critico'
         when an.plata_en_juego >= 1000000 then 'critico'
         when an.plata_en_juego >= 100000 then 'alerta'
         else 'sugerencia' end::nora_aviso_severidad,
    d.nombre,
    an.hecho || E'\n\n' ||
      case when an.plata_en_juego is not null
           then 'Plata en juego: $' || plata_texto(an.plata_en_juego) || '. '
           else '' end ||
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
    'publicados_por_encima_del_presupuesto_porque_son_legales', v_legales,
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
$function$
;

CREATE OR REPLACE FUNCTION public.deteccion_reglas_violadas()
 RETURNS TABLE(regla text, donde text, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'un detector no declara lo que NO dice', d.clave,
         'El aviso se publica con el hecho, la plata y lo que esto NO dice. Sin la tercera, el hecho se lee como una acusacion — y el sistema no sabe la causa'
    from detectores d
   where d.activo and (d.que_no_dice is null or btrim(d.que_no_dice) = '')

  union all
  select 'un detector no declara cuanta historia necesita', d.clave,
         'C.7: sin historia minima declarada, el detector puede afirmar que algo cambio con dos meses de datos y nadie se va a enterar'
    from detectores d
   where d.activo and (d.historia_minima is null or btrim(d.historia_minima) = '')

  union all
  select 'un detector corre y no tiene tipo de aviso', d.clave,
         'La corrida castea aviso_tipo al enum nora_aviso_tipo: con null se cae la corrida entera, no solo ese detector'
    from detectores d
   where d.activo and d.funcion is not null
     and (d.aviso_tipo is null
          or not exists (select 1 from pg_enum e
                          join pg_type t on t.oid = e.enumtypid
                         where t.typname = 'nora_aviso_tipo'
                           and e.enumlabel = d.aviso_tipo))

  union all
  select 'un hallazgo publicado no tiene plata estimada', an.clave,
         'D.1: lo que no se puede estimar no va arriba, va a la lista larga. La unica excepcion es `siempre_arriba`, que solo usa el terreno legal'
    from anomalias an
    join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null and not d.siempre_arriba

  union all
  select 'mas de un detector se saltea el presupuesto', d.clave,
         'La excepcion de `siempre_arriba` es para la regla de oro 9. Si la usan varios, el presupuesto de interrupcion deja de existir'
    from detectores d
   where d.siempre_arriba and d.activo
     and (select count(*) from detectores x where x.siempre_arriba and x.activo) > 1

  union all
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2 de la v1.3: el dato existe y lo ve quien tenga permiso en la pantalla del arqueo, pero no en un listado'
    from anomalias an
   where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%')

  union all
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: este proyecto le concede EXECUTE a `authenticated` por default privileges'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname = 'informe_semanal'
          or p.proname like 'producto\_canales')
     and p.proname not in ('deteccion_descartar', 'descripciones_aprobar_lote')
     and has_function_privilege('authenticated', p.oid, 'execute');
$function$
;
comment on function public.deteccion_correr() is
  'La corrida. Lo legal (`siempre_arriba`) se publica ANTES y ADEMAS del '
  'presupuesto, y la corrida lo informa aparte: asi el presupuesto sigue '
  'significando cuanto puede interrumpir el sistema por su cuenta, y la '
  'excepcion queda a la vista en vez de disolverse en el total.';

revoke all on function public.deteccion_correr() from public, anon, authenticated;
revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_correr() to service_role;
grant execute on function public.deteccion_reglas_violadas() to service_role;
