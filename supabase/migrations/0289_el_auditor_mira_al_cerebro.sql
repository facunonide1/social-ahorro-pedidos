-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · A · EL AUDITOR MIRA LAS FUNCIONES DEL CEREBRO Y DE LA VOZ
--
-- Las funciones nuevas de esta versión son `cerebro_*` y `voz_*`. El auditor
-- de funciones de servicio sólo miraba los prefijos de la detección y de los
-- canales: una `cerebro_calcular` ejecutable por `authenticated` habría
-- pasado el build sin que nadie lo notara. Se agregan los dos prefijos.
--
-- `cerebro_estado` es la excepción declarada: la llama la pantalla con la
-- sesión del dueño, usa auth.uid() y consulta users_admin. Y como toda la
-- lista, se verifica: si un día deja de cumplir la condición, rompe el build.
-- ════════════════════════════════════════════════════════════════════════════

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
    ('cerebro_estado')
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
