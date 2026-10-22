-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0273 · LOS COMBOS, Y LA FIRMA DEL LOTE                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── E.3 · POR QUE UN TEST DE EMBARAZO SOLO PIERDE Y SEIS NO ─────────────────
--
-- Porque **el envio no se divide y el margen si se suma.** Si el negocio paga
-- $4.500 de envio, ese costo es el mismo para una unidad que para seis: contra
-- una se come todo el margen, contra seis se reparte.
--
-- La cuenta: con margen unitario m y envio e, vender n unidades deja
-- **n*m − e**, y el combo conviene desde el primer n donde eso es positivo,
-- o sea n > e/m.
--
-- No es una promocion ni un descuento: es el mismo producto vendido de a
-- varios. El precio por unidad no cambia.
--
-- ── Y HOY DEVUELVE CERO ─────────────────────────────────────────────────────
--
-- Ningun canal tiene costo de envio cargado, asi que e = 0 y no hay nada que
-- repartir. **El combo existe solo cuando el envio lo paga el negocio**, y
-- eso hoy no esta declarado en ninguno. No es que no haya combos posibles: es
-- que sin el costo del envio no se pueden calcular.
--
-- ── Y LO QUE NO HACE ────────────────────────────────────────────────────────
--
-- No arma el combo en el canal: propone de a cuantos convendria venderlo.
-- Crear un producto «x6» en una plataforma es una publicacion nueva y eso lo
-- hace una persona, como todo en este bloque.

CREATE OR REPLACE FUNCTION public.canal_combos(p_canal text, p_limite integer DEFAULT 100)
 RETURNS TABLE(producto_id uuid, sku text, nombre text, margen_unitario numeric, envio numeric, solo_deja numeric, de_a_cuantos integer, el_combo_deja numeric, vende_3m numeric, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with cv as (select * from canales_venta where id = p_canal),
  base as (
    select p.id, p.sku, p.nombre_comercial,
           p.precio_sugerido::numeric as mostrador,
           p.precio_costo_promedio::numeric as costo,
           cv.comision_pct, cv.margen_extra_pct, cv.envio_lo_paga, cv.costo_envio,
           coalesce((select sum(v.unidades) from producto_ventas_sucursal v
                      where v.producto_id = p.id
                        and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0)::numeric as vende_3m
      from productos_catalogo p cross join cv
     where p.activo and not p.es_demo and coalesce(p.es_producto, true)
       and p.precio_sugerido is not null and p.precio_costo_promedio is not null
       and not (p.requiere_receta or p.es_controlado or p.es_psicotropico
                or p.condicion_venta in ('requiere_receta','receta_archivada','estupefaciente_psico_ii'))
  ),
  calc as (
    select b.*,
      -- El margen por unidad, SIN el envio: el envio es del pedido, no de la
      -- unidad, y esa es toda la idea del combo.
      round(b.mostrador * (1 + b.margen_extra_pct / 100.0) * (1 - b.comision_pct / 100.0)
            - b.costo, 2) as m,
      case when b.envio_lo_paga = 'negocio' then coalesce(b.costo_envio, 0) else 0 end as e
      from base b
  ),
  -- Solo tiene sentido para los que pierden de a uno y ganan de a varios: si
  -- el margen unitario no alcanza para el envio pero es positivo, hay un n.
  candidatos as (
    select c.*,
      (c.m - c.e) as solo,
      ceil(c.e / nullif(c.m, 0))::integer + 1 as n
      from calc c
     where c.e > 0 and c.m > 0 and (c.m - c.e) < 0
  )
  select c.id, c.sku, c.nombre_comercial, c.m, c.e, c.solo, c.n,
         round(c.n * c.m - c.e, 2), c.vende_3m,
         format('de a uno deja $%s (pierde, porque el envío de $%s se come el margen de $%s). De a %s deja $%s: el envío no se divide, el margen sí se suma.',
                plata_texto(c.solo), plata_texto(c.e), plata_texto(c.m),
                c.n, plata_texto(c.n * c.m - c.e))
    from candidatos c
   where c.n between 2 and 12
   order by (c.n * c.m - c.e) desc
   limit p_limite;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_lote_armar(p_canal text, p_accion text, p_productos uuid[], p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text; v_lote uuid; v_n int; v_legal int; v_plata numeric;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null or v_rol not in ('super_admin', 'gerente', 'comprador', 'marketing') then
    return jsonb_build_object('ok', false,
      'por_que', coalesce(format('el rol «%s» no arma lotes de publicación', v_rol),
                          'no hay una sesión activa con permiso'));
  end if;
  if p_accion not in ('publicar', 'despublicar') then
    return jsonb_build_object('ok', false, 'por_que', 'la acción tiene que ser publicar o despublicar');
  end if;
  if p_productos is null or array_length(p_productos, 1) is null then
    return jsonb_build_object('ok', false, 'por_que', 'el lote está vacío');
  end if;

  -- La pared: lo legal no entra a un lote de PUBLICAR, nunca. No es una
  -- validacion de formulario: es la regla de oro 9, y un lote se firma de una
  -- sola vez — si entra uno, se publica con los otros.
  if p_accion = 'publicar' then
    select count(*) into v_legal from productos_catalogo p
     where p.id = any(p_productos)
       and (p.requiere_receta or p.es_controlado or p.es_psicotropico
            or p.condicion_venta in ('requiere_receta','receta_archivada','estupefaciente_psico_ii'));
    if v_legal > 0 then
      return jsonb_build_object('ok', false,
        'por_que', format('%s de los productos del lote son de condición legal y no van a un canal abierto. El lote no se arma: un lote se firma de una sola vez, y si entra uno se publica con los otros.', v_legal));
    end if;
  end if;

  insert into canal_lotes (canal_id, accion, motivo, armado_por)
  values (p_canal, p_accion, p_motivo, auth.uid())
  returning id into v_lote;

  insert into canal_lote_items (lote_id, producto_id, sku, nombre, precio_sugerido, plata, por_que)
  select v_lote, p.id, p.sku, p.nombre_comercial, p.precio_sugerido,
         null::numeric,
         format('%s en %s', p_accion, (select nombre from canales_venta where id = p_canal))
    from productos_catalogo p
   where p.id = any(p_productos);
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'lote', v_lote, 'items', v_n,
    'estado', 'borrador',
    'que_pasa_ahora', format('El lote quedó en borrador con %s productos. No se publica nada hasta que alguien lo firme, y firmarlo tampoco publica: lo que sale es un archivo para cargar en el canal.', v_n));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_lote_firmar(p_lote uuid, p_sacar uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol text; v_lote record; v_sacados int := 0; v_quedan int;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null or v_rol not in ('super_admin', 'gerente', 'comprador', 'marketing') then
    return jsonb_build_object('ok', false,
      'por_que', coalesce(format('el rol «%s» no firma lotes de publicación', v_rol),
                          'no hay una sesión activa con permiso'));
  end if;

  select * into v_lote from canal_lotes where id = p_lote;
  if not found then return jsonb_build_object('ok', false, 'por_que', 'ese lote no existe'); end if;
  if v_lote.estado <> 'borrador' then
    return jsonb_build_object('ok', false,
      'por_que', format('ese lote ya está en «%s»: un lote se firma una sola vez', v_lote.estado));
  end if;

  if p_sacar is not null and array_length(p_sacar, 1) is not null then
    update canal_lote_items
       set sacado = true, sacado_motivo = 'lo saqué al revisar el lote'
     where lote_id = p_lote and producto_id = any(p_sacar);
    get diagnostics v_sacados = row_count;
  end if;

  select count(*) into v_quedan from canal_lote_items where lote_id = p_lote and not sacado;
  if v_quedan = 0 then
    update canal_lotes set estado = 'descartado' where id = p_lote;
    return jsonb_build_object('ok', true, 'lote', p_lote, 'estado', 'descartado',
      'que_pasa_ahora', 'Sacaste todos los productos, así que el lote quedó descartado.');
  end if;

  update canal_lotes
     set estado = 'firmado', firmado_por = auth.uid(), firmado_at = now()
   where id = p_lote;

  return jsonb_build_object('ok', true, 'lote', p_lote, 'estado', 'firmado',
    'items', v_quedan, 'sacados', v_sacados,
    'que_pasa_ahora',
      format('Firmado con %s productos%s. **Esto no publicó nada**: el estado llega hasta «firmado» porque NORA no tiene credenciales de ningún canal. Lo que sigue es exportar el archivo y cargarlo, y la próxima sincronización va a decir si quedó hecho.',
             v_quedan,
             case when v_sacados > 0 then format(' (%s sacados al revisar)', v_sacados) else '' end));
end;
$function$
;
comment on function public.canal_combos(text, integer) is
  'E.3 · El envio no se divide y el margen si se suma: con margen m y envio e, '
  'n unidades dejan n*m-e y el combo conviene desde n > e/m. Hoy devuelve cero '
  'porque ningun canal tiene costo de envio cargado.';
comment on function public.canal_lote_firmar(uuid, uuid[]) is
  'E.5 · Firmar no publica. El estado llega hasta `firmado` porque NORA no '
  'tiene credenciales de ningun canal, y decir «publicado» seria afirmar algo '
  'que ocurre afuera. Lo dira la proxima sincronizacion.';

revoke all on function public.canal_combos(text, integer) from public, anon, authenticated;
revoke all on function public.canal_lote_armar(text, text, uuid[], text) from public, anon;
revoke all on function public.canal_lote_firmar(uuid, uuid[]) from public, anon;
grant execute on function public.canal_combos(text, integer) to service_role;
grant execute on function public.canal_lote_armar(text, text, uuid[], text) to authenticated, service_role;
grant execute on function public.canal_lote_firmar(uuid, uuid[]) to authenticated, service_role;

-- ── LA SEXTA Y LA SEPTIMA EXCEPCION ─────────────────────────────────────────
--
-- `canal_lote_armar` y `canal_lote_firmar` guardan `armado_por` y
-- `firmado_por` con `auth.uid()` y miran el rol adentro. El auditor las marco
-- y hay que declararlas — y el verificador de 0271 comprueba que cumplan la
-- condicion, asi que agregarlas a la lista no es un permiso gratis.
--
-- Siete excepciones y las siete son la misma cosa: acciones que una persona
-- firma y que por eso necesitan saber quien es.

CREATE OR REPLACE FUNCTION public.deteccion_reglas_violadas()
 RETURNS TABLE(regla text, donde text, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with excepciones(nombre) as (values
    ('deteccion_descartar'), ('descripciones_aprobar_lote'),
    ('canal_error_resolver'), ('canal_cerrar'), ('canal_reabrir'),
    ('canal_lote_armar'), ('canal_lote_firmar')
  )
  select 'un detector no declara lo que NO dice', d.clave,
         'El aviso se publica con el hecho, la plata y lo que esto NO dice. Sin la tercera, el hecho se lee como una acusacion'
    from detectores d
   where d.activo and (d.que_no_dice is null or btrim(d.que_no_dice) = '')
  union all
  select 'un detector no declara cuanta historia necesita', d.clave,
         'C.7: sin historia minima declarada, el detector puede afirmar que algo cambio con dos meses de datos'
    from detectores d
   where d.activo and (d.historia_minima is null or btrim(d.historia_minima) = '')
  union all
  select 'un detector corre y no tiene tipo de aviso', d.clave,
         'La corrida castea aviso_tipo al enum: con null se cae la corrida entera'
    from detectores d
   where d.activo and d.funcion is not null
     and (d.aviso_tipo is null
          or not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                         where t.typname = 'nora_aviso_tipo' and e.enumlabel = d.aviso_tipo))
  union all
  select 'un hallazgo publicado no tiene plata estimada', an.clave,
         'D.1: lo que no se puede estimar va a la lista larga. La unica excepcion es `siempre_arriba`'
    from anomalias an join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null and not d.siempre_arriba
  union all
  select 'mas de un detector se saltea el presupuesto', d.clave,
         'La excepcion de `siempre_arriba` es para la regla de oro 9. Si la usan varios, el presupuesto deja de existir'
    from detectores d
   where d.siempre_arriba and d.activo
     and (select count(*) from detectores x where x.siempre_arriba and x.activo) > 1
  union all
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2 de la v1.3: el dato existe y lo ve quien tenga permiso en la pantalla del arqueo, no en un listado'
    from anomalias an
   where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%')
  union all
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: este proyecto le concede EXECUTE a `authenticated` por default privileges'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname = 'informe_semanal'
          or p.proname = 'producto_canales')
     and p.proname not in (select nombre from excepciones)
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 'una excepcion no cumple la condicion que la justifica',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case
           when p.prosrc not like '%auth.uid()%' and p.prosrc not like '%users_admin%' then
             'esta en la lista de funciones que `authenticated` puede llamar y no usa auth.uid() ni consulta users_admin'
           when p.prosrc not like '%auth.uid()%' then
             'esta en la lista y no usa auth.uid(): la excepcion existe para que la accion tenga dueno'
           else
             'esta en la lista y no consulta users_admin: no verifica el rol adentro'
         end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join excepciones e on e.nombre = p.proname
   where p.prosrc not like '%auth.uid()%' or p.prosrc not like '%users_admin%';
$function$
;
revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_reglas_violadas() to service_role;
