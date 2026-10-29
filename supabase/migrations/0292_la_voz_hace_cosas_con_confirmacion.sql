-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · F · LA VOZ HACE COSAS, CON CONFIRMACIÓN
--
-- ── LO QUE SE CONFIRMA ES LO QUE SE MOSTRÓ ──────────────────────────────────
--
-- Cuando la voz propone algo, la propuesta queda guardada en `voz_bitacora`
-- (bloque D). Confirmar NO recibe la propuesta del navegador: recibe el id, y
-- ejecuta lo que está guardado. Si entre que se mostró y se tocó «Asignarla»
-- alguien hubiera cambiado el pedido en la red, se ejecuta igual lo que se
-- vio. Y una propuesta se confirma una sola vez: la fila se bloquea y pasa a
-- `confirmado`.
--
-- ── F.1 · LA TAREA, CON SU CONTROL ──────────────────────────────────────────
--
-- Se crea asignada a la persona, con el tipo del catálogo (que trae la
-- evidencia requerida: foto) y con `verificacion_humana` y el dueño como
-- verificador. Regla de oro 5: al completarla no se cierra, pasa a
-- verificación — el flujo de tareas lo hace para toda tarea (M5), y acá el
-- que verifica es quien la pidió.
--
-- ── F.4 · EL PARÁMETRO, CON REGISTRO Y VUELTA ATRÁS ─────────────────────────
--
-- `voz_parametro_cambios` guarda qué decía antes, qué dice ahora y quién. El
-- cambio sólo se aplica si el valor sigue siendo el que se mostró: si alguien
-- lo cambió desde Configuración mientras tanto, no se pisa. Volver atrás
-- tiene la misma guarda al revés.
--
-- ── F.3 · EL PEDIDO Y LA TRANSFERENCIA ──────────────────────────────────────
--
-- Los escribe el servidor con la sesión del dueño, con el mismo circuito que
-- usa la pantalla de compras y el ejecutor de Reparto. Acá sólo se resuelve
-- la fila de la bitácora (`voz_resolver`). Siempre en borrador o solicitada:
-- nunca emitida, nunca enviada.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.voz_parametro_cambios (
  id             uuid primary key default gen_random_uuid(),
  bitacora_id    uuid references public.voz_bitacora(id) on delete set null,
  clave          text not null,
  antes          numeric not null,
  despues        numeric not null,
  cambiado_por   uuid references auth.users(id) on delete set null,
  cambiado_at    timestamptz not null default now(),
  revertido_at   timestamptz,
  revertido_por  uuid references auth.users(id) on delete set null
);

alter table public.voz_parametro_cambios enable row level security;

create policy voz_parametro_cambios_leer on public.voz_parametro_cambios
  for select to authenticated
  using (exists (select 1 from public.users_admin u
                  where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

-- ── CONFIRMAR ───────────────────────────────────────────────────────────────

create or replace function public.voz_confirmar(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v record;
  p jsonb;
  v_tarea record;
  v_vence timestamptz;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_actual numeric;
  v_cambio record;
  v_ejec jsonb;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'texto', 'confirmar es del dueño');
  end if;

  select * into v from voz_bitacora where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'texto', 'esa propuesta no existe');
  end if;
  if v.estado <> 'propuesto' then
    return jsonb_build_object('ok', false, 'texto', format('esa propuesta ya está %s', v.estado));
  end if;
  p := v.propuesta;

  -- F.1 · la tarea
  if p ->> 'tipo' = 'tarea' then
    v_vence := ((v_hoy + case when p ->> 'vence' = 'manana' then 1 else 0 end)::timestamp
                + time '23:59') at time zone 'America/Argentina/Buenos_Aires';
    insert into tareas (
      tipo_tarea_id, tipo_origen, titulo, descripcion, prioridad, estado,
      asignacion_tipo, responsable_id, verificador_id, sucursal_id,
      entidad_relacionada, entidad_id, entidad_url,
      fecha_asignacion, fecha_vencimiento, verificacion_humana, evidencia_opt_out,
      datos_custom, creado_por, creado_por_nombre, es_demo
    ) values (
      nullif(p ->> 'tipo_tarea_id', '')::uuid, 'nora'::tarea_origen,
      p ->> 'titulo',
      coalesce(p ->> 'descripcion', '') ||
        E'\n\nAl completarla pasa a verificación: la controla quien la pidió (regla de oro 5).',
      'media'::tarea_prioridad, 'asignada'::tarea_estado,
      'usuario_especifico'::tarea_asignacion,
      (p ->> 'responsable_user_id')::uuid, auth.uid(),
      nullif(p ->> 'sucursal_id', '')::uuid,
      'voz_bitacora', p_id, '/admin/direccion/cerebro',
      now(), v_vence, true, false,
      jsonb_build_object('origen', 'voz', 'evidencia', p -> 'evidencia', 'voz_bitacora_id', p_id),
      auth.uid(), 'NORA · voz', false
    ) returning id, codigo into v_tarea;

    v_ejec := jsonb_build_object('tarea_id', v_tarea.id, 'codigo', v_tarea.codigo,
      'texto', format('tarea %s asignada a %s', coalesce(v_tarea.codigo, ''), p ->> 'responsable'));

  -- F.4 · el parámetro
  elsif p ->> 'tipo' = 'parametro' then
    select valor into v_actual from compras_parametros where clave = p ->> 'clave' for update;
    if not found then
      return jsonb_build_object('ok', false, 'texto', 'ese parámetro ya no existe');
    end if;
    if v_actual <> (p ->> 'antes')::numeric then
      update voz_bitacora set estado = 'fallo', resuelto_at = now(), resuelto_por = auth.uid(),
             ejecutado = jsonb_build_object('texto', 'el valor cambió desde que te lo mostré', 'ahora', v_actual)
       where id = p_id;
      return jsonb_build_object('ok', false, 'texto',
        format('No lo cambié: mientras tanto alguien lo dejó en %s. Pedímelo de nuevo si querés.', v_actual));
    end if;
    update compras_parametros set valor = (p ->> 'despues')::numeric where clave = p ->> 'clave';
    insert into voz_parametro_cambios (bitacora_id, clave, antes, despues, cambiado_por)
    values (p_id, p ->> 'clave', (p ->> 'antes')::numeric, (p ->> 'despues')::numeric, auth.uid())
    returning id into v_cambio;
    v_ejec := jsonb_build_object('cambio_id', v_cambio.id,
      'texto', format('%s pasó de %s a %s', replace(p ->> 'clave', '_', ' '), p ->> 'antes', p ->> 'despues'));

  -- F.4 · volver atrás
  elsif p ->> 'tipo' = 'revertir' then
    select * into v_cambio from voz_parametro_cambios where id = (p ->> 'cambio_id')::uuid for update;
    if not found or v_cambio.revertido_at is not null then
      return jsonb_build_object('ok', false, 'texto', 'ese cambio ya no se puede volver atrás');
    end if;
    select valor into v_actual from compras_parametros where clave = v_cambio.clave for update;
    if v_actual <> v_cambio.despues then
      return jsonb_build_object('ok', false, 'texto',
        format('No lo volví atrás: ahora dice %s, no %s. Alguien lo cambió después.', v_actual, v_cambio.despues));
    end if;
    update compras_parametros set valor = v_cambio.antes where clave = v_cambio.clave;
    update voz_parametro_cambios set revertido_at = now(), revertido_por = auth.uid() where id = v_cambio.id;
    v_ejec := jsonb_build_object('cambio_id', v_cambio.id,
      'texto', format('%s volvió a %s', replace(v_cambio.clave, '_', ' '), v_cambio.antes));

  else
    -- El pedido y la transferencia los escribe el servidor con la sesión.
    return jsonb_build_object('ok', false, 'delegar', true, 'tipo', p ->> 'tipo');
  end if;

  update voz_bitacora
     set estado = 'confirmado', ejecutado = v_ejec, resuelto_at = now(), resuelto_por = auth.uid()
   where id = p_id;

  return jsonb_build_object('ok', true, 'texto', v_ejec ->> 'texto', 'nodo', p ->> 'nodo');
end;
$$;

comment on function public.voz_confirmar(uuid) is
  'v1.5-cerebro · F · ejecuta lo que la voz propuso y quedó guardado en '
  'voz_bitacora: la tarea, el parámetro o su vuelta atrás. Un toque, una vez.';

-- ── RESOLVER LO QUE ESCRIBE EL SERVIDOR ─────────────────────────────────────

create or replace function public.voz_resolver(p_id uuid, p_ok boolean, p_ejecutado jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    raise exception 'la voz es solo del dueño';
  end if;
  update voz_bitacora
     set estado = case when p_ok then 'confirmado' else 'fallo' end,
         ejecutado = p_ejecutado, resuelto_at = now(), resuelto_por = auth.uid()
   where id = p_id and estado = 'propuesto'
     and propuesta ->> 'tipo' in ('pedido', 'transferencia');
  return found;
end;
$$;

revoke all on function public.voz_confirmar(uuid) from public, anon;
revoke all on function public.voz_resolver(uuid, boolean, jsonb) from public, anon;
grant execute on function public.voz_confirmar(uuid) to authenticated, service_role;
grant execute on function public.voz_resolver(uuid, boolean, jsonb) to authenticated, service_role;

-- Las dos son excepciones declaradas: usan auth.uid() y consultan users_admin.
CREATE OR REPLACE FUNCTION public.deteccion_reglas_violadas()
 RETURNS TABLE(regla text, donde text, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with excepciones(nombre) as (values
    ('deteccion_descartar'), ('descripciones_aprobar_lote'),
    ('canal_error_resolver'), ('canal_cerrar'), ('canal_reabrir'),
    ('canal_lote_armar'), ('canal_lote_firmar'),
    ('canal_error_no_se_puede'), ('canal_tablero_responsable'), ('canal_alta'),
    ('cerebro_estado'), ('voz_registrar'), ('voz_descartar'),
    ('voz_gasto_estado'), ('voz_gasto_reservar'), ('voz_tope_definir'),
    ('voz_confirmar'), ('voz_resolver')
  )
  select 'un detector no declara lo que NO dice', d.clave,
         'Sin lo que NO dice, el hecho se lee como una acusacion'
    from detectores d where d.activo and (d.que_no_dice is null or btrim(d.que_no_dice) = '')
  union all
  select 'un detector no declara cuanta historia necesita', d.clave,
         'C.7: sin historia minima puede afirmar un cambio con dos meses de datos'
    from detectores d where d.activo and (d.historia_minima is null or btrim(d.historia_minima) = '')
  union all
  select 'un detector corre y no tiene tipo de aviso', d.clave,
         'La corrida castea aviso_tipo al enum: con null se cae entera'
    from detectores d where d.activo and d.funcion is not null
     and (d.aviso_tipo is null or not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'nora_aviso_tipo' and e.enumlabel = d.aviso_tipo))
  union all
  select 'un hallazgo publicado no tiene plata estimada', an.clave,
         'D.1: la unica excepcion es `siempre_arriba`'
    from anomalias an join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null and not d.siempre_arriba
  union all
  select 'mas de un detector se saltea el presupuesto', d.clave,
         'Si la usan varios, el presupuesto de interrupcion deja de existir'
    from detectores d where d.siempre_arriba and d.activo
     and (select count(*) from detectores x where x.siempre_arriba and x.activo) > 1
  union all
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2 de la v1.3: el dato existe pero no va en un listado'
    from anomalias an where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%')
  union all
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: `authenticated` tiene EXECUTE por default privileges'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname like 'archivo\_%'
          or p.proname like 'cerebro\_%' or p.proname like 'voz\_%'
          or p.proname = 'informe_semanal' or p.proname = 'producto_canales')
     and p.proname not in (select nombre from excepciones)
     and p.proname <> 'archivo_huella'
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 'una excepcion no cumple la condicion que la justifica',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when p.prosrc not like '%auth.uid()%' then
                'esta en la lista y no usa auth.uid(): la excepcion existe para que la accion tenga dueno'
              else 'esta en la lista y no consulta users_admin: no verifica el rol adentro' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join excepciones e on e.nombre = p.proname
   where p.prosrc not like '%auth.uid()%'
      or (p.prosrc not like '%users_admin%' and p.proname <> 'canal_tablero_responsable');
$function$;

revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_reglas_violadas() to service_role;
