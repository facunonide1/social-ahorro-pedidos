-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · A · LA LECTURA CONSOLIDADA DEL CEREBRO
--
-- El cerebro dibuja catorce nódulos, cinco sucursales y lo que espera firma.
-- Si cada uno pidiera lo suyo, la pantalla haría veinte consultas y alguna
-- llegaría tarde — y una que llega tarde, en un dibujo, se ve como un cero.
--
-- ── POR QUÉ PRECALCULADA ─────────────────────────────────────────────────────
--
-- Medido hoy, antes de escribir esto:
--
--   bandeja_resumen ............. 4,5 s
--   direccion_por_sucursal ...... 2,1 s
--   canales + convenios + snapshot de agentes ... 0,7 s
--
-- El rol `authenticator` tiene statement_timeout de 8 s. Una lectura en vivo
-- quedaría a un mal día de cancelarse, y la v0.99 ya mostró qué pasa entonces:
-- `resumen ?? {}` y todos los agentes en cero diciendo «no hay nada».
--
-- Entonces: se calcula una vez por minuto (pg_cron, porque Vercel Hobby sólo
-- permite crons diarios) y se guarda en UNA fila. La pantalla lee esa fila.
--
-- ── LO QUE NO SE HACE ────────────────────────────────────────────────────────
--
-- No se devuelven ceros cuando no hay fila: `cerebro_estado()` devuelve NULL y
-- la pantalla dice «todavía no lo pude leer». Y si una corrida falla, la fila
-- anterior queda —con su fecha— y el error se guarda al lado. Un número de
-- hace tres minutos que dice que es de hace tres minutos es honesto.
--
-- ── NADA DE ESTO CALCULA UN NÚMERO NUEVO ────────────────────────────────────
--
-- Todo sale de funciones y tablas que ya existen y ya se muestran en otra
-- pantalla. Lo único que esta migración agrega es juntarlo.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.cerebro_snapshot (
  id               boolean primary key default true check (id),
  datos            jsonb not null,
  calculado_at     timestamptz not null default now(),
  tardo_ms         integer,
  ultimo_error     text,
  ultimo_error_at  timestamptz
);

comment on table public.cerebro_snapshot is
  'v1.5-cerebro · A.4 · una sola fila con todo lo que dibuja el cerebro. La '
  'escribe cerebro_calcular() cada minuto; la lee cerebro_estado(), solo el '
  'dueño. Si una corrida falla queda la fila anterior con su fecha y el error.';

alter table public.cerebro_snapshot enable row level security;
-- Sin políticas a propósito: nadie la lee directo. La única puerta es
-- `cerebro_estado()`, que mira el rol adentro. Declarada en rls-intencional.

-- ── C.2 y C.3 · LO QUE DE VERDAD PASÓ ──────────────────────────────────────
--
-- La entidad «trabaja entre pregunta y pregunta»: un foco viaja a un nódulo y
-- la bitácora dice qué revisó. Para que eso no sea decoración, lo que revisa
-- sale de acá: las corridas de los crons, los detectores, las importaciones,
-- las propuestas de los agentes, las tareas y los intentos bloqueados.
--
-- Separada en su propia función porque el bloque F le agrega la bitácora de
-- la voz, y así no hay que reescribir el cálculo entero.

create or replace function public.cerebro_actividad(p_limite integer default 40)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with ev as (
    -- Los crons de cálculo: cuándo miraron y qué decidieron. «frenado» es un
    -- resultado, no un error: el cron vio datos de demostración y no corrió.
    select c.ultima_evaluacion as at, 'cron'::text as fuente,
           case c.cron
             when 'metricas-stock' then 'reparto'
             when 'alertas-stock' then 'vigia'
             when 'nora-auditor' then 'tesoro'
             else null end as nodo,
           format('Cron %s: %s', c.cron, c.ultimo_resultado) as texto
      from crons_calculo c
     where c.ultima_evaluacion is not null

    union all
    select s.calculado_at, 'agentes', null,
           format('Recalculé lo que dice cada agente%s (%s s)',
                  case when s.sucursal_id is null then ' para la cadena' else ' para ' || su.nombre end,
                  round(coalesce(s.tardo_ms, 0) / 1000.0))
      from agentes_resumen_snapshot s
      left join sucursales su on su.id = s.sucursal_id

    union all
    -- Los detectores: lo último que publicaron.
    select a.publicado_at, 'detector',
           case when d.familia = 'canal' then 'canal' else coalesce(a.sucursal_id::text, null) end,
           format('%s: %s', d.nombre, left(coalesce(a.hecho, a.clave), 140))
      from anomalias a
      join detectores d on d.clave = a.detector
     where a.publicado_at is not null
       and a.publicado_at > now() - interval '30 days'

    union all
    select coalesce(i.aplicado_at, i.cargado_at, i.created_at), 'importacion', null,
           format('Importación de SIFACO (%s): %s', i.tipo, i.estado)
      from sifaco_importaciones i

    union all
    select b.propuesta_at, 'agente', b.agente,
           format('%s propuso: %s', initcap(b.agente), left(coalesce(b.propuso, b.accion), 140))
      from agente_bitacora b

    union all
    select coalesce(t.fecha_completada, t.created_at), 'tarea', t.sucursal_id::text,
           case when t.fecha_completada is not null
                then format('Se completó la tarea %s: %s', t.codigo, t.titulo)
                else format('Se creó la tarea %s: %s', t.codigo, t.titulo) end
      from tareas t
     where not coalesce(t.es_demo, false)
       and coalesce(t.fecha_completada, t.created_at) > now() - interval '30 days'

    union all
    select ib.intento_at, 'bloqueo', ib.agente,
           format('Se bloqueó un intento de «%s»', ib.accion)
      from intentos_bloqueados ib
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'fuente', fuente, 'nodo', nodo, 'texto', texto)
                            order by at desc), '[]'::jsonb)
    from (select * from ev where at is not null order by at desc limit p_limite) x;
$$;

comment on function public.cerebro_actividad(integer) is
  'v1.5-cerebro · C.2 y C.3 · lo último que pasó de verdad en el sistema, con '
  'la hora. De acá sale lo que la entidad «revisa» entre pregunta y pregunta.';

-- ── EL CÁLCULO ──────────────────────────────────────────────────────────────

create or replace function public.cerebro_calcular()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_inicio timestamptz := clock_timestamp();
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_agentes jsonb;
  v_sucursales jsonb;
  v_espera jsonb;
  v_actividad jsonb;
  v_ventas_reales boolean;
  v_cierres_reales boolean;
  v_presencia boolean;
begin
  begin
    -- ── A.1 · LOS AGENTES ───────────────────────────────────────────────────
    --
    -- Los nueve del elenco leen lo mismo que la pantalla de agentes de la
    -- v0.99: el snapshot diario, más Canal y Convenio en vivo. La frase de cada
    -- uno la arma `lib/agentes/lectura.ts` con estos mismos números — la misma
    -- función, para que el cerebro y la pantalla de agentes no digan cosas
    -- distintas.
    --
    -- Los otros cinco no son agentes: son sectores que el prototipo dibuja y
    -- que nadie construyó. Se mandan con lo que hay que contar para saber que
    -- están vacíos, y la pantalla los marca como «sin construir».
    select jsonb_build_object(
      'resumen', (select jsonb_set(s.datos, '{calculado_at}', to_jsonb(s.calculado_at))
                    from agentes_resumen_snapshot s where s.sucursal_id is null),
      'canales', canales_resumen(null),
      'convenios', convenios_resumen(null),
      'config', (select coalesce(jsonb_agg(jsonb_build_object(
                          'agente', c.agente, 'accion', c.accion, 'nivel', c.nivel)), '[]'::jsonb)
                   from agente_config c where c.sucursal_id is null),
      'marcador', (select coalesce(jsonb_object_agg(agente, m), '{}'::jsonb) from (
                     select b.agente, jsonb_build_object(
                              'propuestas', count(*),
                              'aceptadas', count(*) filter (where b.estado in ('aceptada', 'ejecutada')),
                              'acertadas', count(*) filter (where b.acerto)) m
                       from agente_bitacora b group by b.agente) z),
      'sin_construir', jsonb_build_object(
        'mostrador', jsonb_build_object(
          'faltantes_registrados', (select count(*) from demanda_invisible where not es_demo)),
        'conteo', jsonb_build_object(
          'conteos', (select count(*) from cnt_conteos)),
        'turno', jsonb_build_object(
          'empleados', (select count(*) from empleados where activo),
          'con_sucursal', (select count(*) from empleados where activo and sucursal_id is not null),
          'turnos_registrados', (select count(*) from empleado_turnos)),
        'balance', jsonb_build_object(
          'gastos_fijos', (select count(*) from gastos_fijos where activo and not es_demo)),
        'vinculo', jsonb_build_object(
          'clientes_reales', (select count(*) from clientes where not es_demo),
          'clientes_demo', (select count(*) from clientes where es_demo))
      )
    ) into v_agentes;

    -- ── A.2 · LAS SUCURSALES ────────────────────────────────────────────────
    --
    -- Lo que no se sabe va null CON el motivo. Hoy:
    --   · ventas del día: todas las de `ventas_diarias` son de demostración
    --   · cajas: todos los arqueos son de demostración
    --   · quién está: no hay registro de entrada en `empleado_turnos`
    -- Se pregunta UNA vez si existe algún dato real, y el motivo cambia según
    -- eso: «no hay ninguno real» no es lo mismo que «hoy no entró».
    select exists (select 1 from ventas_diarias where not es_demo) into v_ventas_reales;
    select exists (select 1 from arqueos_caja where not es_demo)
        or exists (select 1 from caja_turnos where not es_demo) into v_cierres_reales;
    select exists (select 1 from empleado_turnos) into v_presencia;

    with ps as (select * from direccion_por_sucursal(3)),
    stock_fecha as (
      select sucursal_id, max(leido_at) as leido_at, count(*) filter (where stock > 0) as con_stock
        from producto_stock_sifaco where sucursal_id is not null group by sucursal_id
    ),
    venta_hoy as (
      select sucursal_id, sum(monto) as monto, max(created_at) as at
        from ventas_diarias where not es_demo and fecha = v_hoy group by sucursal_id
    ),
    ultima_venta as (
      select sucursal_id, max(fecha) as fecha from ventas_diarias where not es_demo group by sucursal_id
    ),
    cierre as (
      select distinct on (sucursal_id) sucursal_id, fecha, cajero_nombre, diferencia_cierre, created_at
        from arqueos_caja where not es_demo
       order by sucursal_id, fecha desc, created_at desc
    ),
    turno_caja as (
      select distinct on (sucursal_id) sucursal_id, fecha, estado::text as estado, created_at
        from caja_turnos where not es_demo
       order by sucursal_id, fecha desc, created_at desc
    ),
    gente as (
      select e.sucursal_id,
             jsonb_agg(jsonb_build_object(
               'nombre', e.nombre_completo, 'puesto', e.puesto, 'user_id', e.user_id,
               -- presente: true/false solo si HOY hay registro; si no hay ningún
               -- registro de entrada en el sistema, null.
               'presente', case when not v_presencia then null
                                else exists (select 1 from empleado_turnos et
                                              where et.empleado_id = e.id and et.fecha = v_hoy
                                                and et.hora_entrada is not null and et.hora_salida is null) end
             ) order by e.nombre_completo) as personas
        from empleados e where e.activo and e.sucursal_id is not null group by e.sucursal_id
    ),
    tar as (
      select t.sucursal_id,
             count(*) filter (where t.estado in ('pendiente','asignada','reclamada','en_progreso','en_verificacion','vencida','rechazada')) as abiertas,
             count(*) filter (where t.fecha_vencimiento < now()
                               and t.estado in ('pendiente','asignada','reclamada','en_progreso','en_verificacion','vencida','rechazada')) as vencidas,
             count(*) filter (where (t.fecha_completada at time zone 'America/Argentina/Buenos_Aires')::date = v_hoy) as completadas_hoy,
             max(greatest(t.updated_at, t.created_at)) as at
        from tareas t where not coalesce(t.es_demo, false) and t.sucursal_id is not null
       group by t.sucursal_id
    ),
    ultimas as (
      select sucursal_id, jsonb_agg(jsonb_build_object('at', at, 'texto', texto) order by at desc) as hechos
        from (
          select t.sucursal_id, coalesce(t.fecha_completada, t.created_at) as at,
                 case when t.fecha_completada is not null then 'Completada: ' else 'Nueva: ' end || t.titulo as texto,
                 row_number() over (partition by t.sucursal_id order by coalesce(t.fecha_completada, t.created_at) desc) as rn
            from tareas t where not coalesce(t.es_demo, false) and t.sucursal_id is not null
        ) z where rn <= 4 group by sucursal_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nombre', s.nombre, 'codigo', s.codigo, 'es_ecommerce', s.es_ecommerce,

      'vendido_hoy', jsonb_build_object(
        'valor', vh.monto,
        'de_cuando', vh.at,
        'procedencia', 'medido',
        'por_que_no', case
          when vh.monto is not null then null
          when not v_ventas_reales then 'no entra la venta del día: las ventas diarias que hay son todas de demostración, y el mostrador no le pasa las ventas a NORA en vivo'
          when uv.fecha is null then 'esta sucursal no tiene ninguna venta diaria cargada'
          else format('hoy no entró ninguna venta; la última cargada es del %s', to_char(uv.fecha, 'DD/MM')) end),

      'venta_estimada', jsonb_build_object(
        'valor', ps.venta_estimada,
        'periodo', case when ps.periodo_desde is null then null else ps.periodo_desde || ' a ' || ps.periodo_hasta end,
        'procedencia', 'estimado',
        'por_que_no', case when ps.venta_estimada is null
                           then 'no hay consumo mensual de SIFACO para esta sucursal' end),

      'stock', jsonb_build_object(
        'valor', ps.stock_al_costo,
        'de_cuando', sf.leido_at,
        'procedencia', 'medido',
        'de_donde', 'el maestro de SIFACO, valuado al costo',
        'por_que_no', case when ps.stock_al_costo is null then
          case when sf.sucursal_id is null then 'no tiene stock propio en el maestro de SIFACO'
               else 'tiene stock en el maestro pero no entra en la cuenta por sucursal' end end),

      'rotacion', jsonb_build_object(
        'cobertura_meses', ps.cobertura_meses,
        'margen_pct', ps.margen_pct,
        'de_cuando', ps.periodo_hasta,
        'por_que_no', case when ps.cobertura_meses is null then 'sin consumo mensual no se puede decir cuánto dura el stock' end),

      'caja', jsonb_build_object(
        'ultimo_cierre', ci.fecha,
        'quien', ci.cajero_nombre,
        'diferencia', ci.diferencia_cierre,
        'turno_estado', tc.estado,
        'turno_fecha', tc.fecha,
        'de_cuando', coalesce(ci.created_at, tc.created_at),
        'por_que_no', case
          when ci.fecha is not null or tc.fecha is not null then null
          when not v_cierres_reales then 'no hay un solo cierre de caja real cargado: los arqueos que existen son de demostración. Sin cierre no hay número de efectivo'
          else 'esta sucursal no tiene ningún cierre de caja cargado' end),

      'personas', jsonb_build_object(
        'lista', coalesce(g.personas, '[]'::jsonb),
        'presencia_registrada', v_presencia,
        'por_que_no', case
          when g.personas is null then 'no hay ningún empleado con esta sucursal asignada'
          when not v_presencia then 'no se registra quién entra: se sabe quién trabaja acá, no quién está ahora'
          else null end),

      'tareas', jsonb_build_object(
        'abiertas', coalesce(t.abiertas, 0),
        'vencidas', coalesce(t.vencidas, 0),
        'completadas_hoy', coalesce(t.completadas_hoy, 0),
        'de_cuando', t.at),

      'ultimos_hechos', coalesce(u.hechos, '[]'::jsonb),

      -- B.7 · en gris si no se sabe nada de lo que pasa adentro.
      'sin_datos', (vh.monto is null and ps.stock_al_costo is null and ci.fecha is null and tc.fecha is null)
    ) order by s.codigo) into v_sucursales
      from sucursales s
      left join ps on ps.sucursal_id = s.id
      left join stock_fecha sf on sf.sucursal_id = s.id
      left join venta_hoy vh on vh.sucursal_id = s.id
      left join ultima_venta uv on uv.sucursal_id = s.id
      left join cierre ci on ci.sucursal_id = s.id
      left join turno_caja tc on tc.sucursal_id = s.id
      left join gente g on g.sucursal_id = s.id
      left join tar t on t.sucursal_id = s.id
      left join ultimas u on u.sucursal_id = s.id
     where s.activa;

    -- ── A.3 · LO QUE ESPERA DECISIÓN ────────────────────────────────────────
    --
    -- Una sola pasada sobre `bandeja_unica` (las seis fuentes, sin contar dos
    -- veces los hallazgos y los errores de canal). Los totales son los mismos
    -- que suma `bandeja_resumen`; se hacen acá sobre la misma pasada porque
    -- llamar a las dos duplicaría los 4,5 s.
    --
    -- Dos columnas de plata, como en la bandeja: un total y un costo por día.
    -- Sumarlas sería sumar un stock con un caudal.
    with b as (select * from bandeja_unica(null, null, 100000))
    select jsonb_build_object(
      'cuantos', (select count(*) from b),
      'plata_total', (select sum(plata) from b where plata is not null),
      'costo_por_dia', (select sum(costo_por_dia) from b where costo_por_dia is not null),
      'no_se_pueden_costear', (select count(*) from b where not se_puede_costear),
      'de_riesgo', (select count(*) from b where riesgo),
      'por_fuente', (select coalesce(jsonb_object_agg(fuente, jsonb_build_object(
                              'cuantos', n, 'plata', p)), '{}'::jsonb)
                       from (select fuente, count(*) n, sum(plata) p from b group by fuente) z),
      'primeros', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
                     select fuente, clave, titulo, que_pasa, plata, costo_por_dia, sucursal_id, sucursal,
                            vence_at, vencido, accion, href, riesgo
                       from b limit 12) x),
      'esperando_turno', (select count(*) from anomalias
                           where publicado_at is null and estado in ('abierta', 'reaparecio')),
      -- B.2 · rojo es «necesita tu firma». Las decisiones ya dicen de qué
      -- agente son; las firmas de lotes son de Canal y los débitos de Convenio.
      'por_agente', (select coalesce(jsonb_object_agg(agente, n), '{}'::jsonb) from (
                       select agente, count(*) n from (
                         select dp.agente from decisiones_pendientes dp
                         union all select 'canal' from b where fuente = 'firma'
                         union all select 'canal' from b where fuente = 'error_de_canal' and riesgo
                         union all select 'convenio' from b where fuente = 'debito'
                       ) q group by agente) z)
    ) into v_espera;

    v_actividad := cerebro_actividad(40);

    update cerebro_snapshot
       set datos = jsonb_build_object(
             'agentes', v_agentes,
             'sucursales', coalesce(v_sucursales, '[]'::jsonb),
             'espera', v_espera,
             'actividad', v_actividad),
           calculado_at = now(),
           tardo_ms = extract(milliseconds from clock_timestamp() - v_inicio)::int,
           ultimo_error = null,
           ultimo_error_at = null
     where id;

    if not found then
      insert into cerebro_snapshot (id, datos, tardo_ms)
      values (true, jsonb_build_object(
                'agentes', v_agentes,
                'sucursales', coalesce(v_sucursales, '[]'::jsonb),
                'espera', v_espera,
                'actividad', v_actividad),
              extract(milliseconds from clock_timestamp() - v_inicio)::int);
    end if;

  exception when others then
    -- La fila anterior queda como estaba, con su fecha. El error va al lado:
    -- la pantalla muestra «el dato es de hace N minutos porque la última
    -- corrida falló», no un cero.
    update cerebro_snapshot
       set ultimo_error = sqlerrm, ultimo_error_at = now()
     where id;
    return jsonb_build_object('ok', false, 'error', sqlerrm,
                              'tardo_ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
  end;

  return jsonb_build_object('ok', true,
                            'tardo_ms', extract(milliseconds from clock_timestamp() - v_inicio)::int);
end;
$$;

comment on function public.cerebro_calcular() is
  'v1.5-cerebro · A.4 · junta agentes, sucursales, lo que espera y la actividad '
  'en la fila de cerebro_snapshot. Lo corre pg_cron cada minuto. NO se llama '
  'desde una pantalla.';

alter function public.cerebro_calcular() set statement_timeout to '50s';

-- ── LO QUE LEE LA PANTALLA ──────────────────────────────────────────────────
--
-- **Solo el dueño.** No es para encargados ni para el mostrador. El rol se
-- mira adentro, con `auth.uid()`: la pantalla llama con la sesión de quien
-- está mirando, nunca con el cliente de servicio. Si el que llama no es
-- super_admin, no recibe nada — ni siquiera los números de su sucursal.
--
-- Devuelve NULL si nunca se calculó. Null es «no lo puedo saber»; un objeto
-- con ceros sería «lo miré y no hay».

create or replace function public.cerebro_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v record;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    return jsonb_build_object('autorizado', false,
      'por_que', 'el cerebro es solo del dueño: no es para encargados ni para el mostrador');
  end if;

  select * into v from cerebro_snapshot where id;
  if not found then
    return null;
  end if;

  return v.datos || jsonb_build_object(
    'autorizado', true,
    'calculado_at', v.calculado_at,
    'tardo_ms', v.tardo_ms,
    'edad_s', extract(epoch from now() - v.calculado_at)::int,
    'ultimo_error', v.ultimo_error,
    'ultimo_error_at', v.ultimo_error_at);
end;
$$;

comment on function public.cerebro_estado() is
  'v1.5-cerebro · A.4 · la única lectura del cerebro. Solo super_admin, con la '
  'sesión del que mira. NULL si nunca se calculó: no es lo mismo que cero.';

-- ── CADA MINUTO ─────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname in ('cerebro-estado', 'cerebro-limpiar-historial');

select cron.schedule('cerebro-estado', '* * * * *', $cron$select public.cerebro_calcular()$cron$);

-- Un registro por minuto son 1.440 por día. Se guardan dos días: alcanzan para
-- ver si una corrida falló, y no crecen para siempre.
select cron.schedule('cerebro-limpiar-historial', '17 4 * * *',
  $cron$delete from cron.job_run_details where end_time < now() - interval '2 days'$cron$);

-- ── LOS PERMISOS, DESPUÉS DEL ÚLTIMO CREATE ─────────────────────────────────
--
-- `revoke from public, anon` no alcanza: este proyecto le concede EXECUTE a
-- `authenticated` por default privileges.

revoke all on function public.cerebro_calcular() from public, anon, authenticated;
revoke all on function public.cerebro_actividad(integer) from public, anon, authenticated;
grant execute on function public.cerebro_calcular() to service_role;
grant execute on function public.cerebro_actividad(integer) to service_role;

-- La excepción declarada: usa auth.uid() y consulta users_admin.
revoke all on function public.cerebro_estado() from public, anon;
grant execute on function public.cerebro_estado() to authenticated, service_role;
