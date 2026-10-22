-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0250 · REVOCAR DE PUBLIC Y ANON NO ALCANZA                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El advisor de Supabase lo mostro:
--
--   Function `public.deteccion_correr()` can be executed by the
--   `authenticated` role as a `SECURITY DEFINER` function via
--   `/rest/v1/rpc/deteccion_correr`.
--
-- Las 24 funciones de esta sesion terminaban con
--
--   revoke all on function ... from public, anon;
--   grant execute on function ... to service_role;
--
-- y las 24 las podia ejecutar cualquier usuario logueado. El motivo: este
-- proyecto tiene `alter default privileges ... grant execute on functions to
-- authenticated`, asi que la concesion a `authenticated` no viene de PUBLIC y
-- revocar PUBLIC no la toca.
--
-- Es la septima vez que aparece esta forma de error en el proyecto. Las seis
-- anteriores fueron funciones de trigger ejecutables por `anon`; esta es la
-- misma cosa un paso mas adentro.
--
-- ── LO QUE SE PODIA HACER CON UNA SESION CUALQUIERA ─────────────────────────
--
--   · `deteccion_correr()` · correr la deteccion y gastar el presupuesto de
--     interrupcion del dia. Un cajero podia dejar al gerente sin avisos.
--   · los diez `detectar_*` · barridos completos del catalogo y de las
--     facturas, a pedido y sin tope.
--   · **`informe_semanal(p_sucursal, p_rol)`** · el peor. La ruta lee el rol
--     de la sesion justamente para que nadie pida el informe de un gerente,
--     y el RPC aceptaba `p_rol` de quien llamara. El comentario de la ruta
--     decia que eso no se podia hacer, y se podia.
--   · `descripciones_aprobar_lote()` · aprobar un lote de descripciones y
--     publicarlas.
--
-- ── LAS DOS QUE SIGUEN ABIERTAS, Y POR QUE ──────────────────────────────────
--
-- `deteccion_descartar` y `descripciones_aprobar_lote` guardan `auth.uid()`:
-- con el cliente de servicio quedarian sin dueño, y un descarte sin dueño es
-- un detector callado sin que nadie pueda ver quien lo callo.
--
-- Entonces esas dos siguen siendo llamables por `authenticated` y **se
-- defienden adentro**: miran el rol en `users_admin`. Funcion como puerta.

-- ── LAS QUE NO LAS LLAMA UNA PERSONA ────────────────────────────────────────

revoke execute on function public.deteccion_correr() from authenticated;
revoke execute on function public.deteccion_meses_cerrados() from authenticated;
revoke execute on function public.detectar_stock_no_cuadra(numeric, numeric) from authenticated;
revoke execute on function public.detectar_caja_diferencias_repetidas(integer, integer) from authenticated;
revoke execute on function public.detectar_comprobante_duplicado() from authenticated;
revoke execute on function public.detectar_monto_fuera_de_lo_habitual() from authenticated;
revoke execute on function public.detectar_faltante_sin_nota_credito(integer) from authenticated;
revoke execute on function public.detectar_barras_con_dos_precios(numeric) from authenticated;
revoke execute on function public.detectar_dejo_de_venderse(numeric) from authenticated;
revoke execute on function public.detectar_empezo_a_vender_mas(numeric, numeric) from authenticated;
revoke execute on function public.detectar_proveedor_cambio(integer, numeric) from authenticated;
revoke execute on function public.detectar_sucursal_bajo(numeric) from authenticated;

-- Las de lectura las llaman las paginas con el cliente de servicio, despues
-- de `requireAdminHubAccess`. Un usuario logueado llamandolas directo se
-- saltearia ese control.
revoke execute on function public.deteccion_hallazgos(text, uuid, boolean, integer) from authenticated;
revoke execute on function public.deteccion_estado(text) from authenticated;
revoke execute on function public.deteccion_marcador() from authenticated;
revoke execute on function public.deteccion_silencios() from authenticated;
revoke execute on function public.deteccion_reglas_violadas() from authenticated;
revoke execute on function public.informe_semanal(uuid, text) from authenticated;
revoke execute on function public.descripciones_cola(integer) from authenticated;
revoke execute on function public.descripciones_exportar(text) from authenticated;
revoke execute on function public.descripciones_sin_poder() from authenticated;
revoke execute on function public.descripciones_resumen() from authenticated;

-- ── LOS AYUDANTES DE TEXTO, CON SEARCH_PATH FIJO ────────────────────────────
--
-- No son SECURITY DEFINER, asi que el riesgo es menor. Pero una funcion sin
-- `search_path` fijo resuelve sus nombres con el del que la llama, y estas
-- tres las usan los hechos que despues se leen como verdad.

create or replace function public.plata_texto(p numeric)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select replace(to_char(round(coalesce(p, 0)), 'FM999G999G999'), ',', '.');
$$;

create or replace function public.mes_texto(p date)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio',
                'agosto','septiembre','octubre','noviembre','diciembre']
          )[extract(month from p)::int] || ' de ' || extract(year from p)::text;
$$;

create or replace function public.periodo_texto(p text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  select case when p ~ '^\d{4}-\d{2}$'
              then public.mes_texto((p || '-01')::date)
              else p end;
$$;

create or replace function public.descripcion_promete(p_texto text)
returns table (frase text, familia text, por_que text)
language sql
immutable
set search_path to 'pg_catalog', 'public'
as $$
  with reglas(patron, frase, familia, por_que) as (values
    -- 1 · el beneficio directo
    ('\m(hidrata|hidratante|humecta|nutre|nutritiva?|repara|regenera|revitaliza)\M', 'hidrata / nutre / repara', 'beneficio',
     'afirma un efecto sobre el cuerpo. Decir de que esta hecho no es lo mismo que decir que hace'),
    ('\m(alivia|calma|desinflama|cicatriza|cura|sana|elimina|combate|previene|protege)\M', 'alivia / cura / previene', 'beneficio',
     'es una afirmacion sanitaria. Lo dice el fabricante en el envase o un profesional, no el catalogo'),
    ('\m(mejora|fortalece|refuerza|estimula|aumenta|reduce|disminuye|adelgaza|blanquea)\M', 'mejora / fortalece / reduce', 'beneficio',
     'promete un resultado. El resultado depende de la persona y el sistema no lo sabe'),
    ('\m(suaviza|rejuvenece|ilumina|tonifica|reafirma|antiage|anti-?edad|antiarrugas)\M', 'suaviza / rejuvenece / antiage', 'beneficio',
     'promete un resultado estetico. La regla es una sola: tampoco en perfumeria'),
    -- 2 · el para-que
    ('\m(ideal para|indicado para|recomendado para|sirve para|util para|apto para tratar|para tratar|para aliviar|para el tratamiento)\M', 'ideal para / indicado para', 'indicacion',
     'es una indicacion. Indicar un tratamiento es ejercicio profesional, y el catalogo no atiende'),
    ('\m(ayuda a|contribuye a|favorece|promueve)\M', 'ayuda a / favorece', 'indicacion',
     'suena mas suave y promete lo mismo. «Ayuda a dormir» es una indicacion con otra forma'),
    -- 3 · el superlativo
    ('\m(el mejor|la mejor|unico|unica|insuperable|garantiza|garantizado|100 ?%|comprobado|clinicamente)\M', 'el mejor / garantizado / comprobado', 'superlativo',
     'no se puede sostener. Si no cumple, el que lo prometio fue el sistema'),
    ('\m(rapido alivio|accion rapida|efecto inmediato|resultados visibles|sin efectos adversos|natural y seguro)\M', 'acción rápida / resultados visibles', 'superlativo',
     'promete velocidad o seguridad, que son las dos cosas que menos se pueden prometer')
  )
  select r.frase, r.familia, r.por_que
    from reglas r
   where lower(translate(coalesce(p_texto, ''),
               'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) ~ r.patron;
$$;

create or replace function public.tg_descripcion_sin_promesas()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v text;
begin
  -- Solo frena la aprobacion. Una propuesta puede prometer: para eso se
  -- revisa. Lo que no puede es quedar aprobada prometiendo.
  if new.estado = 'aprobada' then
    select string_agg(format('«%s» (%s)', frase, por_que), '; ')
      into v from descripcion_promete(new.texto);
    if v is not null then
      raise exception
        'Esta descripcion promete algo y no se puede aprobar: %. La descripcion dice que es el producto, no para que sirve.', v
        using errcode = 'check_violation';
    end if;
    if new.texto is null or btrim(new.texto) = '' then
      raise exception 'No se puede aprobar una descripcion vacia.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_descripcion_sin_promesas() from public, anon, authenticated;
revoke all on function public.plata_texto(numeric) from public, anon;
revoke all on function public.mes_texto(date) from public, anon;
revoke all on function public.periodo_texto(text) from public, anon;
revoke all on function public.descripcion_promete(text) from public, anon;
grant execute on function public.plata_texto(numeric) to authenticated, service_role;
grant execute on function public.mes_texto(date) to authenticated, service_role;
grant execute on function public.periodo_texto(text) to authenticated, service_role;
grant execute on function public.descripcion_promete(text) to authenticated, service_role;

-- ── LAS DOS QUE SE DEFIENDEN ADENTRO ────────────────────────────────────────

create or replace function public.deteccion_descartar(
  p_anomalia uuid,
  p_motivo text,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_an record;
  v_motivo record;
  v_veces int;
  v_rol text;
begin
  -- La puerta. Esta funcion sigue siendo llamable por `authenticated` porque
  -- guarda `auth.uid()`: con el cliente de servicio el descarte quedaria sin
  -- dueño, y un detector callado sin dueño no se puede volver a encender con
  -- criterio. Entonces el control esta aca.
  select u.rol into v_rol from users_admin u
   where u.id = auth.uid() and u.activo;
  if v_rol is null then
    return jsonb_build_object('ok', false, 'por_que', 'no hay una sesión activa con permiso');
  end if;
  if v_rol not in ('super_admin', 'gerente', 'comprador', 'tesoreria',
                   'encargado_sucursal', 'auditor', 'administrativo') then
    return jsonb_build_object('ok', false,
      'por_que', format('el rol «%s» no descarta hallazgos. Descartar le enseña al detector, y lo que aprende vale para todos', v_rol));
  end if;

  select * into v_an from anomalias where id = p_anomalia;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'ese hallazgo no existe');
  end if;

  select * into v_motivo from deteccion_motivos where clave = p_motivo;
  if not found then
    return jsonb_build_object('ok', false,
      'por_que', format('«%s» no es un motivo del catalogo. Un motivo libre no ensena nada: el detector no puede aprender de un texto distinto cada vez.', p_motivo));
  end if;

  insert into deteccion_descartes (
    anomalia_id, detector, clave, motivo, nota, sucursal_id, hecho, plata, descartado_por)
  values (
    v_an.id, v_an.detector, v_an.clave, p_motivo, p_nota, v_an.sucursal_id,
    coalesce(v_an.hecho, v_an.clave), v_an.plata_en_juego, auth.uid());

  update anomalias
     set estado = 'descartada', cerrada_at = now(), cerrada_por = auth.uid(),
         motivo = coalesce(p_nota, v_motivo.nombre)
   where id = p_anomalia;

  update nora_avisos set estado = 'resuelto', resuelto_at = now()
   where clave_dedup = 'deteccion:' || v_an.clave and estado = 'pendiente';

  select count(*) into v_veces from deteccion_descartes dd
    where dd.detector = v_an.detector and dd.motivo = p_motivo and dd.volvio_at is null;

  return jsonb_build_object(
    'ok', true,
    'detector', v_an.detector,
    'motivo', v_motivo.nombre,
    'veces_con_este_motivo', v_veces,
    'silencia', v_motivo.silencia,
    'que_pasa_ahora', case
      when not v_motivo.silencia then
        format('Queda registrado. Este motivo no calla al detector: %s', v_motivo.ayuda)
      when v_veces >= 3 then
        format('Van %s descartes de %s con el motivo «%s». El detector deja de reportar lo que se descarta por ese motivo.',
               v_veces, v_an.detector, v_motivo.nombre)
      else
        format('Van %s de 3. A los 3 descartes con el motivo «%s», el detector deja de reportar eso.',
               v_veces, v_motivo.nombre)
    end);
end;
$$;

comment on function public.deteccion_descartar(uuid, text, text) is
  'D.5 · La puerta para descartar. Sigue llamable por `authenticated` porque '
  'guarda auth.uid(), y por eso el control del rol está adentro: revocar de '
  'public y anon no alcanza en este proyecto.';

create or replace function public.descripciones_aprobar_lote(p_lote uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_ok int := 0;
  v_frenadas jsonb := '[]'::jsonb;
  v_promesas text;
  v_rol text;
begin
  select u.rol into v_rol from users_admin u
   where u.id = auth.uid() and u.activo;
  if v_rol is null or v_rol not in ('super_admin', 'gerente', 'comprador', 'marketing') then
    return jsonb_build_object('ok', false,
      'por_que', coalesce(
        format('el rol «%s» no aprueba descripciones: lo que se aprueba sale a los canales', v_rol),
        'no hay una sesión activa con permiso'));
  end if;

  if p_lote is null then
    return jsonb_build_object('ok', false, 'por_que', 'falta el lote');
  end if;

  for r in
    select * from producto_descripciones
     where lote_id = p_lote and estado = 'propuesta'
  loop
    select string_agg(format('«%s»: %s', frase, por_que), '; ')
      into v_promesas from descripcion_promete(r.texto);

    if v_promesas is not null then
      v_frenadas := v_frenadas || jsonb_build_object(
        'producto_id', r.producto_id, 'texto', r.texto, 'por_que', v_promesas);
      update producto_descripciones
         set estado = 'rechazada', rechazada_motivo = v_promesas
       where producto_id = r.producto_id;
      continue;
    end if;

    update producto_descripciones
       set estado = 'aprobada', aprobada_at = now(), aprobada_por = auth.uid()
     where producto_id = r.producto_id;
    v_ok := v_ok + 1;
  end loop;

  return jsonb_build_object(
    'ok', true, 'lote', p_lote, 'aprobadas', v_ok,
    'frenadas', jsonb_array_length(v_frenadas), 'detalle_frenadas', v_frenadas,
    'que_paso', case
      when v_ok = 0 and jsonb_array_length(v_frenadas) = 0 then
        'ese lote no tiene propuestas para aprobar'
      when jsonb_array_length(v_frenadas) = 0 then
        format('se aprobaron las %s del lote', v_ok)
      else
        format('se aprobaron %s y quedaron %s afuera porque prometían algo. Las frenadas quedan como rechazadas, con el motivo, y se pueden volver a generar.',
               v_ok, jsonb_array_length(v_frenadas))
    end);
end;
$$;

comment on function public.descripciones_aprobar_lote(uuid) is
  'F.2 · Confirma un lote. Mira el rol adentro: lo que se aprueba sale a los '
  'canales, y revocar de public y anon no alcanza en este proyecto.';

-- ── Y QUE EL BUILD LO VERIFIQUE ─────────────────────────────────────────────
--
-- Septima vez. La regla entra al auditor del limite: ninguna funcion de esta
-- sesion que no necesite `auth.uid()` puede ser ejecutable por `authenticated`.

create or replace function public.deteccion_reglas_violadas()
returns table (regla text, donde text, por_que text)
language sql
stable
security definer
set search_path to 'public'
as $$
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
         'D.1: lo que no se puede estimar no va arriba, va a la lista larga. Un hallazgo sin plata no se puede comparar con los de al lado, y la lista de arriba es una comparacion'
    from anomalias an
    join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null

  union all
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2: el dato existe y lo ve quien tenga permiso en la pantalla del arqueo, pero no en un listado. El sistema no sabe la causa de una diferencia: puede ser un vuelto mal dado, un precio mal cargado o nada'
    from anomalias an
   where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%')

  union all
  -- La septima vez que aparece esta forma de error en el proyecto.
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: este proyecto le concede EXECUTE a `authenticated` por default privileges. Las dos excepciones son deteccion_descartar y descripciones_aprobar_lote, que guardan auth.uid() y miran el rol adentro'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname = 'informe_semanal')
     and p.proname not in ('deteccion_descartar', 'descripciones_aprobar_lote')
     and has_function_privilege('authenticated', p.oid, 'execute');
$$;

comment on function public.deteccion_reglas_violadas() is
  'Las reglas de la v1.3, verificadas en el build. Falla por omision: el '
  'detector numero trece que copie al de al lado sin el `que_no_dice` rompe '
  'el build, y la funcion nueva que se olvide de revocarle a `authenticated` '
  'tambien.';

revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
revoke all on function public.deteccion_descartar(uuid, text, text) from public, anon;
revoke all on function public.descripciones_aprobar_lote(uuid) from public, anon;
grant execute on function public.deteccion_reglas_violadas() to service_role;
grant execute on function public.deteccion_descartar(uuid, text, text) to authenticated, service_role;
grant execute on function public.descripciones_aprobar_lote(uuid) to authenticated, service_role;
