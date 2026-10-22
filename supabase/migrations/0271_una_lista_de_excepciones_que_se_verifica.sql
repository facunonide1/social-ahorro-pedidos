-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0271 · UNA LISTA DE EXCEPCIONES QUE SE VERIFICA A SI MISMA              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El auditor marco `canal_cerrar` y `canal_reabrir`. Las dos tienen que ser
-- llamables por `authenticated`: guardan `cerrado_por` con `auth.uid()` y
-- miran el rol adentro. Son la cuarta y la quinta excepcion.
--
-- Y en 0261 quedo escrito esto:
--
--   «si fuera un patron, la cuarta entraria sola y nadie lo notaria»
--
-- Ahora hay cinco. La lista a mano hizo lo que tenia que hacer —la cuarta y
-- la quinta NO entraron solas, el build fallo— pero cinco entradas de
-- confianza ya son una lista en la que alguien puede meter una sexta sin que
-- cumpla la condicion.
--
-- ── ENTONCES LA LISTA SE VERIFICA ───────────────────────────────────────────
--
-- Estar en la lista deja de alcanzar. Para ser excepcion hay que **cumplir la
-- condicion que justifica la excepcion**, y eso se puede mirar en el codigo
-- de la funcion:
--
--   · usa `auth.uid()`      · por eso necesita la sesion del que llama
--   · consulta `users_admin` · por eso puede defenderse sola
--
-- Una funcion en la lista que no cumpla las dos rompe el build. La lista
-- sigue siendo corta y a mano —hay que escribir el nombre— pero ya no es
-- una promesa: es una promesa verificada.

CREATE OR REPLACE FUNCTION public.deteccion_reglas_violadas()
 RETURNS TABLE(regla text, donde text, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with excepciones(nombre) as (values
    ('deteccion_descartar'),
    ('descripciones_aprobar_lote'),
    ('canal_error_resolver'),
    ('canal_cerrar'),
    ('canal_reabrir')
  )
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
  -- Las de servicio, con la lista de excepciones a mano.
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: este proyecto le concede EXECUTE a `authenticated` por default privileges'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname = 'informe_semanal'
          or p.proname = 'producto_canales')
     and p.proname not in (select nombre from excepciones)
     and has_function_privilege('authenticated', p.oid, 'execute')

  union all
  -- Y la lista de excepciones, verificada contra lo que justifica la
  -- excepcion. Estar en la lista no alcanza: hay que cumplir la condicion.
  select 'una excepcion no cumple la condicion que la justifica',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case
           when p.prosrc not like '%auth.uid()%' and p.prosrc not like '%users_admin%' then
             'esta en la lista de funciones que `authenticated` puede llamar y no usa auth.uid() ni consulta users_admin: no guarda quien hizo la cosa ni se defiende sola'
           when p.prosrc not like '%auth.uid()%' then
             'esta en la lista y no usa auth.uid(). La excepcion existe para que la accion tenga dueno; sin eso no hay motivo para que la llame una persona'
           else
             'esta en la lista y no consulta users_admin: no verifica el rol adentro, asi que cualquier usuario logueado puede ejecutarla'
         end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join excepciones e on e.nombre = p.proname
   where p.prosrc not like '%auth.uid()%' or p.prosrc not like '%users_admin%';
$function$
;
comment on function public.deteccion_reglas_violadas() is
  'Las reglas de la v1.3 y la v1.4, verificadas en el build. La lista de '
  'funciones que `authenticated` puede llamar esta escrita a mano Y se '
  'verifica: para ser excepcion hay que usar auth.uid() y consultar '
  'users_admin. Estar en la lista no alcanza.';

revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_reglas_violadas() to service_role;
