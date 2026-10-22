-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0261 · LA TERCERA EXCEPCION, DECLARADA Y NO SILENCIADA                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El auditor del limite fallo con esto:
--
--   FALLA una funcion de servicio la puede ejecutar cualquier usuario
--   logueado: canal_error_resolver(p_anomalia uuid, p_que_se_hizo text)
--
-- Y la funcion esta bien como esta: guarda `auth.uid()` para que el cierre
-- tenga dueno, y mira el rol adentro. Es la misma excepcion que
-- `deteccion_descartar` y `descripciones_aprobar_lote`.
--
-- Lo que falta es declararla. **El auditor hizo exactamente lo que tenia que
-- hacer**: no dejar pasar una funcion llamable por cualquiera sin que alguien
-- diga por que. La lista de excepciones es corta y escrita a mano a proposito
-- — si fuera un patron («todas las que terminan en _resolver»), la cuarta
-- entraria sola y nadie lo notaria.
--
-- Las tres, y lo que las tres tienen en comun: guardan quien hizo la cosa.
--
--   `deteccion_descartar`        · un descarte sin dueno es un detector
--                                  callado sin que nadie pueda ver quien lo callo
--   `descripciones_aprobar_lote` · una descripcion publicada sin dueno es una
--                                  que nadie confirmo
--   `canal_error_resolver`       · un error cerrado sin dueno es un error que
--                                  nadie cerro, y la tarea de control no
--                                  sabria a quien mirar

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
  -- Las tres excepciones estan escritas a mano a proposito: si fuera un
  -- patron, la cuarta entraria sola y nadie lo notaria.
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: este proyecto le concede EXECUTE a `authenticated` por default privileges. Las tres excepciones son deteccion_descartar, descripciones_aprobar_lote y canal_error_resolver: las tres guardan auth.uid() y miran el rol adentro'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname = 'informe_semanal'
          or p.proname = 'producto_canales')
     and p.proname not in ('deteccion_descartar', 'descripciones_aprobar_lote',
                           'canal_error_resolver')
     and has_function_privilege('authenticated', p.oid, 'execute');
$$;

comment on function public.deteccion_reglas_violadas() is
  'Las reglas de la v1.3 y la v1.4, verificadas en el build. La lista de '
  'funciones que si pueden ser llamadas por `authenticated` esta escrita a '
  'mano: si fuera un patron, la cuarta entraria sola y nadie lo notaria.';

revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_reglas_violadas() to service_role;
