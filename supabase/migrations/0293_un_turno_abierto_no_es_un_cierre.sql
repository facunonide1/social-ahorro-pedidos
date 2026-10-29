-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · UN TURNO ABIERTO NO ES UN CIERRE
--
-- La prueba del cerebro preguntó «¿cerraron la caja de Tesei?» y la respuesta
-- fue «No. El último cierre de Tesei es del 19 de junio». Ese 19 de junio es
-- un turno de caja ABIERTO que nunca se cerró. No hay ningún cierre real.
--
-- `cerebro_calcular` tomaba el último `caja_turnos` sin mirar el estado. Ahora
-- cuenta como cierre sólo un turno cerrado o aprobado, y el turno abierto se
-- dice aparte: «hay un turno abierto desde el 19/06 que nunca se cerró». Es
-- el mismo error de siempre con otra ropa: un dato que parece responder la
-- pregunta y responde otra.
-- ════════════════════════════════════════════════════════════════════════════

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

    select exists (select 1 from ventas_diarias where not es_demo) into v_ventas_reales;
    select exists (select 1 from arqueos_caja where not es_demo)
        or exists (select 1 from caja_turnos where not es_demo and estado <> 'abierto') into v_cierres_reales;
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
        from caja_turnos where not es_demo and estado <> 'abierto'
       order by sucursal_id, fecha desc, created_at desc
    ),
    turno_abierto as (
      select sucursal_id, min(fecha) as desde
        from caja_turnos where not es_demo and estado = 'abierto' group by sucursal_id
    ),
    gente as (
      select e.sucursal_id,
             jsonb_agg(jsonb_build_object(
               'nombre', e.nombre_completo, 'puesto', e.puesto, 'user_id', e.user_id,
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
        'turno_abierto_desde', ta.desde,
        'de_cuando', coalesce(ci.created_at, tc.created_at),
        'por_que_no', case
          when ci.fecha is not null or tc.fecha is not null then null
          when ta.desde is not null then format('hay un turno de caja abierto desde el %s que nunca se cerró. Sin cierre no hay número de efectivo', to_char(ta.desde, 'DD/MM'))
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

      'sin_datos', (vh.monto is null and ps.stock_al_costo is null and ci.fecha is null and tc.fecha is null)
    ) order by s.codigo) into v_sucursales
      from sucursales s
      left join ps on ps.sucursal_id = s.id
      left join stock_fecha sf on sf.sucursal_id = s.id
      left join venta_hoy vh on vh.sucursal_id = s.id
      left join ultima_venta uv on uv.sucursal_id = s.id
      left join cierre ci on ci.sucursal_id = s.id
      left join turno_caja tc on tc.sucursal_id = s.id
      left join turno_abierto ta on ta.sucursal_id = s.id
      left join gente g on g.sucursal_id = s.id
      left join tar t on t.sucursal_id = s.id
      left join ultimas u on u.sucursal_id = s.id
     where s.activa;

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

revoke all on function public.cerebro_calcular() from public, anon, authenticated;
grant execute on function public.cerebro_calcular() to service_role;
