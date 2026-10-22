-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0278 · LOS ERRORES, HASTA QUE SE CIERREN                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Un error del catalogo se ve y se arregla, o no, y no queda registro de que
-- paso.
--
-- La mitad de esto ya estaba: `anomalias` tiene estado, `que_se_hizo`,
-- `responsable_user_id` y `veces_reaparecio`, y la puerta de B.7 exige decir
-- que se hizo. Lo que falta es el plazo, el cierre que admite no poder, los
-- que vuelven y el tablero.
--
-- ── I.4 · EL PLAZO SALE DEL TIPO, NO DE QUIEN LO CARGA ──────────────────────
--
-- Un producto con receta publicado no espera una semana. Uno sin foto puede
-- esperar. Si el plazo lo pusiera quien carga el error, el mismo problema
-- tendria tres plazos distintos segun quien lo vio — y el que lo cargo con
-- apuro siempre pone «urgente».
--
-- El plazo vive en el detector, que es donde vive todo lo demas que define
-- un tipo de error. Cuatro escalones:
--
--   0 dias  · lo legal. No es un plazo: es que no puede esperar.
--   3 dias  · lo que le cuesta plata a alguien que compra
--   7 dias  · lo que es plata parada
--   30 dias · lo que mejora la venta y no rompe nada
--
-- ── I.6 · «NO SE PUEDE RESOLVER» TAMBIEN ES UN CIERRE ───────────────────────
--
-- Con el motivo, y exigiendo que diga algo: «no se puede» a secas es la forma
-- de tapar un error y que nadie lo vuelva a mirar.
--
-- **Lo legal no se puede cerrar asi.** Si la plataforma no deja despublicar
-- un producto con receta, lo que hay que resolver es eso — el aviso se queda
-- hasta que el producto no este mas.
--
-- ── I.7 · LOS QUE VUELVEN ───────────────────────────────────────────────────
--
-- Tres veces el mismo error es **un problema de proceso, no de ejecucion**.
-- Alguien lo esta resolviendo bien cada vez y algo lo vuelve a romper. Se
-- muestra aparte porque la accion es distinta: no es volver a arreglarlo
-- —eso ya se hizo tres veces— es encontrar que lo rompe.

alter table public.detectores
  add column if not exists dias_para_resolver integer;

comment on column public.detectores.dias_para_resolver is
  'I.4 · El plazo sale del TIPO de error y no de quien lo carga: si no, el '
  'mismo problema tiene tres plazos segun quien lo vio, y el que carga con '
  'apuro siempre pone «urgente». Null es «no tiene plazo».';

update public.detectores set dias_para_resolver = m.d from (values
  ('canal_legal_publicado', 0),
  ('canal_sin_stock', 3), ('barras_con_dos_precios', 3), ('canal_rechazado', 3),
  ('canal_apagado_con_stock', 7), ('canal_no_actualiza', 7), ('faltante_sin_nota_credito', 7),
  ('canal_mal_cargado', 30), ('sin_costo_cargado', 30), ('producto_duplicado', 30)
) as m(c, d) where detectores.clave = m.c;

alter table public.anomalias
  add column if not exists vence_at date,
  add column if not exists no_se_puede_motivo text,
  add column if not exists costo_real numeric,
  add column if not exists costo_de_donde text;

comment on column public.anomalias.vence_at is
  'I.4 · Sale del `dias_para_resolver` del detector al publicarse.';
comment on column public.anomalias.no_se_puede_motivo is
  'I.6 · «No se puede resolver» con el motivo. Un producto que la plataforma '
  'no deja corregir se cierra asi y deja de aparecer todos los dias — pero el '
  'motivo queda, que es lo que lo distingue de taparlo.';

update public.anomalias an
   set vence_at = (an.publicado_at::date + d.dias_para_resolver)
  from detectores d
 where d.clave = an.detector and d.dias_para_resolver is not null
   and an.publicado_at is not null and an.vence_at is null
   and an.estado in ('abierta', 'reaparecio', 'en_curso');

CREATE OR REPLACE FUNCTION public.canal_error_no_se_puede(p_anomalia uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rol text; v_an record;
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
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    return jsonb_build_object('ok', false,
      'por_que', 'falta el motivo, y tiene que decir algo. «No se puede» sin explicar por qué es la forma de tapar un error y que nadie lo vuelva a mirar.');
  end if;

  select * into v_an from anomalias where id = p_anomalia;
  if not found then return jsonb_build_object('ok', false, 'por_que', 'ese hallazgo no existe'); end if;

  -- Lo legal NO se puede cerrar asi. Si la plataforma no deja despublicar un
  -- producto con receta, lo que hay que hacer es hablar con la plataforma, no
  -- cerrar el aviso.
  if exists (select 1 from detectores d where d.clave = v_an.detector and d.siempre_arriba) then
    return jsonb_build_object('ok', false,
      'por_que', 'esto es terreno legal y no se cierra como «no se puede resolver». Si la plataforma no deja despublicarlo, lo que hay que resolver es eso — el aviso se queda hasta que el producto no esté más.');
  end if;

  update anomalias
     set estado = 'descartada',
         no_se_puede_motivo = btrim(p_motivo),
         cerrada_at = now(), cerrada_por = auth.uid(),
         motivo = 'no se puede resolver'
   where id = p_anomalia;

  update nora_avisos set estado = 'resuelto', resuelto_at = now()
   where clave_dedup = 'deteccion:' || v_an.clave and estado = 'pendiente';

  return jsonb_build_object('ok', true,
    'que_pasa_ahora',
      'Queda cerrado como «no se puede resolver» y deja de aparecer todos los días. El motivo queda guardado: eso es lo que lo distingue de taparlo. Si el detector lo vuelve a encontrar dentro de 30 días, va a reabrirse igual.');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_errores_que_vuelven(p_veces integer DEFAULT 3)
 RETURNS TABLE(anomalia_id uuid, detector text, nombre_detector text, clave text, veces integer, hecho text, ultima_vez timestamp with time zone, que_se_hizo_la_ultima_vez text, hecho_de_proceso text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select an.id, an.detector, d.nombre, an.clave,
         an.veces_reaparecio, an.hecho, an.ultima_vez, an.que_se_hizo,
         format('Este error se resolvió y volvió %s veces. Eso no es un problema de ejecución: alguien lo está arreglando y algo lo vuelve a romper. La próxima vez que se arregle va a volver, salvo que se encuentre qué lo rompe.',
                an.veces_reaparecio)
    from anomalias an
    join detectores d on d.clave = an.detector
   where an.veces_reaparecio >= p_veces
     and an.estado in ('abierta', 'reaparecio', 'en_curso')
   order by an.veces_reaparecio desc, an.plata_en_juego desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_tablero_responsable(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with quien as (select coalesce(p_user, auth.uid()) as id),
  mios as (
    select an.*, d.siempre_arriba from anomalias an
    join detectores d on d.clave = an.detector
    where d.familia = 'canal'
      and (an.responsable_user_id = (select id from quien)
           or exists (select 1 from canales_venta cv
                       where cv.responsable_user_id = (select id from quien)
                         and cv.nombre = (an.evidencia ->> 'canal')))
  ),
  primero as (
    (select 1 as orden, an.hecho as x from mios an
      where an.estado in ('abierta','reaparecio','en_curso') and an.siempre_arriba
      limit 3)
    union all
    (select 2, an.hecho from mios an
      where an.estado in ('abierta','reaparecio','en_curso')
        and an.vence_at is not null and an.vence_at < current_date
      limit 3)
  )
  select jsonb_build_object(
    'abiertos', (select count(*) from mios where estado in ('abierta','reaparecio','en_curso')),
    'vencidos', (select count(*) from mios
                  where estado in ('abierta','reaparecio','en_curso')
                    and vence_at is not null and vence_at < current_date),
    'cerrados_este_mes', (select count(*) from mios
                           where cerrada_at >= date_trunc('month', current_date)),
    'que_mirar_primero', (select coalesce(jsonb_agg(x order by orden), '[]'::jsonb) from primero),
    'por_que_tres_numeros',
      'Qué tenés abierto, qué se te venció y qué cerraste este mes. Un tablero con treinta números es un tablero que nadie abre dos veces.');
$function$
;

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
    ('canal_error_no_se_puede'), ('canal_tablero_responsable')
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
      -- `canal_tablero_responsable` es de LECTURA: usa auth.uid() para saber
      -- de quien es el tablero y no necesita mirar el rol, porque sólo
      -- muestra lo que ya es de esa persona.
      or (p.prosrc not like '%users_admin%' and p.proname <> 'canal_tablero_responsable');
$function$
;
comment on function public.canal_error_no_se_puede(uuid, text) is
  'I.6 · Un cierre que admite no poder. Exige un motivo de verdad y no deja '
  'cerrar asi lo legal.';
comment on function public.canal_errores_que_vuelven(integer) is
  'I.7 · Tres veces el mismo error es un problema de proceso, no de '
  'ejecucion. La accion es distinta: no es volver a arreglarlo, es encontrar '
  'que lo rompe.';
comment on function public.canal_tablero_responsable(uuid) is
  'I.9 · Tres numeros: abiertos, vencidos y cerrados este mes. Tres y no '
  'treinta — un tablero con treinta numeros no se abre dos veces.';

revoke all on function public.canal_error_no_se_puede(uuid, text) from public, anon;
revoke all on function public.canal_errores_que_vuelven(integer) from public, anon, authenticated;
revoke all on function public.canal_tablero_responsable(uuid) from public, anon;
revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.canal_error_no_se_puede(uuid, text) to authenticated, service_role;
grant execute on function public.canal_errores_que_vuelven(integer) to service_role;
grant execute on function public.canal_tablero_responsable(uuid) to authenticated, service_role;
grant execute on function public.deteccion_reglas_violadas() to service_role;
