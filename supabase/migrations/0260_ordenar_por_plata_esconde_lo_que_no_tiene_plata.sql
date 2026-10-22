-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0260 · ORDENAR POR PLATA ESCONDE LO QUE NO TIENE PLATA                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La prueba del bloque B dijo esto, y es el hallazgo mas importante del
-- bloque:
--
--   ok  ninguno de condición legal publicado en un canal abierto
--
-- Y hay veinte.
--
-- `deteccion_hallazgos` ordena `plata desc nulls last` —que es D.2 de la
-- v1.3, correcto— y la prueba pidio 500 filas. Los 458 apagados con stock y
-- los 42 sin stock tienen plata; los 20 legales no. Fueron al fondo de la
-- lista y el limite los corto.
--
-- **La excepcion de `siempre_arriba` estaba en el publicador y no en la
-- lectura.** Subian arriba y despues la consulta que los muestra los ordenaba
-- ultimos. Un hallazgo que se publica primero y se lee ultimo no esta arriba
-- de nada.
--
-- Es la misma forma del error que la v1.3 ya tuvo con `nulls last`: ordenar
-- por un numero que a algunos les falta no los pone al final — los esconde.
--
-- ── Y EL SEGUNDO ARREGLO ────────────────────────────────────────────────────
--
-- La tarea de control no se creaba: `asignacion_tipo` usaba `pool_rol` y el
-- enum tiene `rol`. La funcion devolvia null sin mensaje, que es peor que
-- fallar — la prueba decia «no pudo cerrar: undefined».

drop function if exists public.deteccion_hallazgos(text, uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.deteccion_hallazgos(p_familia text DEFAULT NULL::text, p_sucursal uuid DEFAULT NULL::uuid, p_solo_publicados boolean DEFAULT true, p_limite integer DEFAULT 50)
 RETURNS TABLE(id uuid, detector text, nombre_detector text, familia text, clave text, sucursal_id uuid, sucursal text, producto_id uuid, hecho text, plata numeric, como_se_calculo text, que_no_dice text, estado text, visto_primero timestamp with time zone, visto_ultimo timestamp with time zone, publicado_at timestamp with time zone, veces_reaparecio integer, aviso_href text, siempre_arriba boolean, evidencia jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select an.id, an.detector, d.nombre, d.familia::text,
         an.clave, an.sucursal_id, s.nombre, an.producto_id,
         coalesce(an.hecho, an.tipo::text || ': ' || an.clave),
         an.plata_en_juego, an.como_se_calculo, d.que_no_dice,
         an.estado::text, an.primera_vez, an.ultima_vez,
         an.publicado_at, an.veces_reaparecio, d.aviso_href,
         d.siempre_arriba, an.evidencia
    from anomalias an
    join detectores d on d.clave = an.detector
    left join sucursales s on s.id = an.sucursal_id
   where an.estado in ('abierta', 'en_curso', 'reaparecio')
     and (p_familia is null or d.familia::text = p_familia)
     and (p_sucursal is null or an.sucursal_id = p_sucursal or an.sucursal_id is null)
     and (not p_solo_publicados or an.publicado_at is not null)
   order by d.siempre_arriba desc,
            an.plata_en_juego desc nulls last,
            an.ultima_vez desc
   limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_error_resolver(p_anomalia uuid, p_que_se_hizo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_an record;
  v_det record;
  v_rol text;
  v_canal record;
  v_resp uuid;
  v_codigo text;
  v_tarea uuid;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null then
    return jsonb_build_object('ok', false, 'por_que', 'no hay una sesión activa con permiso');
  end if;
  if v_rol not in ('super_admin', 'gerente', 'comprador', 'marketing',
                   'encargado_sucursal', 'administrativo') then
    return jsonb_build_object('ok', false,
      'por_que', format('el rol «%s» no cierra errores de canal', v_rol));
  end if;

  if p_que_se_hizo is null or btrim(p_que_se_hizo) = '' then
    return jsonb_build_object('ok', false,
      'por_que', 'falta decir qué se hizo. «Resuelto» sin más no sirve: es lo único que después dice si el problema volvió por lo mismo.');
  end if;

  select * into v_an from anomalias where id = p_anomalia;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'ese hallazgo no existe');
  end if;
  if v_an.estado = 'resuelta' then
    return jsonb_build_object('ok', false, 'por_que', 'ese hallazgo ya está resuelto');
  end if;

  select * into v_det from detectores where clave = v_an.detector;

  select cv.* into v_canal from canales_venta cv
   where cv.nombre = (v_an.evidencia ->> 'canal');

  v_resp := v_canal.responsable_user_id;
  if v_resp is null and v_an.sucursal_id is not null then
    select id into v_resp from users_admin
     where activo and sucursal_id = v_an.sucursal_id
       and rol in ('encargado_sucursal', 'sucursal')
     order by rol limit 1;
  end if;

  update anomalias
     set estado = 'resuelta',
         que_se_hizo = btrim(p_que_se_hizo),
         resuelta_por = auth.uid(),
         resuelta_at = now(),
         cerrada_at = now(),
         cerrada_por = auth.uid(),
         responsable_user_id = coalesce(responsable_user_id, v_resp)
   where id = p_anomalia;

  update nora_avisos set estado = 'resuelto', resuelto_at = now()
   where clave_dedup = 'deteccion:' || v_an.clave and estado = 'pendiente';

  v_codigo := 'CAN-' || to_char(now(), 'YYMMDD') || '-' || substr(p_anomalia::text, 1, 4);

  insert into tareas (
    codigo, tipo_origen, titulo, descripcion, prioridad, estado,
    asignacion_tipo, responsable_id, rol_destinatario, sucursal_id,
    entidad_relacionada, entidad_id, entidad_url,
    verificacion_humana, fecha_vencimiento, creado_por_nombre, es_demo
  ) values (
    v_codigo, 'auto_sistema'::tarea_origen,
    'Verificar en el canal: ' || coalesce(v_det.nombre, v_an.detector),
    coalesce(v_an.hecho, v_an.clave) ||
    E'\n\nQuien lo resolvió dijo que hizo esto: ' || btrim(p_que_se_hizo) ||
    E'\n\nQué verificar: que el cambio esté hecho EN EL CANAL, no sólo en NORA. ' ||
    'NORA no publica ni despublica: lo que se tocó se tocó afuera y hay que mirarlo afuera.' ||
    case when v_resp is null
         then E'\n\nEsta tarea no tiene responsable asignado porque el canal no tiene uno declarado.'
         else '' end,
    (case when v_det.siempre_arriba then 'critica' else 'alta' end)::tarea_prioridad,
    (case when v_resp is null then 'pendiente' else 'asignada' end)::tarea_estado,
    -- El enum tiene `rol`, no `pool_rol`. Con el valor equivocado la funcion
    -- devolvia null sin mensaje, que es peor que fallar.
    (case when v_resp is null then 'rol' else 'usuario_especifico' end)::tarea_asignacion,
    v_resp,
    case when v_resp is null then 'comprador' else null end,
    v_an.sucursal_id,
    'canal_error', p_anomalia,
    '/admin/canales',
    true,
    (current_date + case when v_det.siempre_arriba then 0 else 3 end)::date,
    'NORA · errores de canal', false
  )
  returning id into v_tarea;

  return jsonb_build_object(
    'ok', true,
    'tarea_de_control', v_tarea,
    'responsable', v_resp,
    'que_pasa_ahora', case
      when v_resp is null then
        'Queda resuelto y se generó una tarea de control SIN responsable, porque el canal no tiene uno declarado. Hasta que lo tenga, la tarea queda en el pool del rol comprador.'
      else
        format('Queda resuelto y la tarea de control quedó asignada. Vence %s.',
               case when v_det.siempre_arriba then 'hoy' else 'en 3 días' end)
    end,
    'por_que_hay_tarea',
      'NORA no publica ni despublica: el cambio se hizo afuera y lo único que el sistema puede hacer es pedir que alguien mire que quedó hecho.');
end;
$function$
;
comment on function public.deteccion_hallazgos(text, uuid, boolean, integer) is
  'D.2 · Ordenado por plata, con `siempre_arriba` antes que todo. Sin eso, el '
  'terreno legal —que no tiene plata a proposito— va al fondo y un limite lo '
  'esconde: la excepcion estaba en el publicador y no en la lectura, y un '
  'hallazgo que se publica primero y se lee ultimo no esta arriba de nada.';

comment on function public.canal_error_resolver(uuid, text) is
  'B.7 · Resolver genera tarea de control (regla de oro 5). Exige decir QUE se '
  'hizo: «resuelto» sin mas no permite saber despues si el problema volvio por '
  'lo mismo. Y no se cierra solo cuando deja de aparecer — dejar de aparecer '
  'tambien pasa cuando la sincronizacion dejo de correr.';

revoke all on function public.deteccion_hallazgos(text, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.canal_error_resolver(uuid, text) from public, anon;
grant execute on function public.deteccion_hallazgos(text, uuid, boolean, integer) to service_role;
grant execute on function public.canal_error_resolver(uuid, text) to authenticated, service_role;
