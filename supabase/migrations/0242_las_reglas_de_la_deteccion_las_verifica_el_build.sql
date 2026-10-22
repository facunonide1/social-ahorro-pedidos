-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0242 · LAS REGLAS DE LA DETECCION LAS VERIFICA EL BUILD                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Las reglas de esta sesion son todas de las que se cumplen el primer dia y
-- se rompen el mes que viene, cuando alguien agregue el detector numero
-- trece y copie el de al lado sin el `que_no_dice`.
--
-- Entonces las verifica el build, como la regla de oro 9 y el limite del
-- mostrador. Un auditor que falla por omision: el detector nuevo que no
-- declara lo que no dice rompe el build, no pasa silenciosamente.
--
-- Las cinco cosas que mira, y por que cada una:
--
--   1 · un detector sin `que_no_dice` publica un aviso que se lee como una
--       acusacion. Es la regla que vale para los seis bloques.
--   2 · un detector sin `historia_minima` es C.7 sin cumplir: puede hablar de
--       un cambio con dos meses de datos y nadie se va a enterar.
--   3 · un detector activo con funcion y sin `aviso_tipo` tira la corrida
--       entera al castear null al enum.
--   4 · un hallazgo publicado sin plata es D.1 roto. Ya paso una vez: el
--       `nulls last` los ordenaba ultimo y los publicaba igual.
--   5 · la evidencia de las diferencias de caja con el cajero adentro. No
--       alcanza con que el `hecho` no lo diga: la evidencia tambien se
--       muestra, y un nombre al lado de la palabra «diferencia» es una
--       acusacion que el sistema no puede sostener.

create or replace function public.deteccion_reglas_violadas()
returns table (regla text, donde text, por_que text)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- 1 · sin «lo que esto NO dice»
  select 'un detector no declara lo que NO dice', d.clave,
         'El aviso se publica con el hecho, la plata y lo que esto NO dice. Sin la tercera, el hecho se lee como una acusacion — y el sistema no sabe la causa'
    from detectores d
   where d.activo and (d.que_no_dice is null or btrim(d.que_no_dice) = '')

  union all
  -- 2 · C.7 sin cumplir
  select 'un detector no declara cuanta historia necesita', d.clave,
         'C.7: sin historia minima declarada, el detector puede afirmar que algo cambio con dos meses de datos y nadie se va a enterar'
    from detectores d
   where d.activo and (d.historia_minima is null or btrim(d.historia_minima) = '')

  union all
  -- 3 · publicaria con un enum en null
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
  -- 4 · D.1 roto
  select 'un hallazgo publicado no tiene plata estimada', an.clave,
         'D.1: lo que no se puede estimar no va arriba, va a la lista larga. Un hallazgo sin plata no se puede comparar con los de al lado, y la lista de arriba es una comparacion'
    from anomalias an
    join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null

  union all
  -- 5 · una persona en un listado
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2: el dato existe y lo ve quien tenga permiso en la pantalla del arqueo, pero no en un listado. El sistema no sabe la causa de una diferencia: puede ser un vuelto mal dado, un precio mal cargado o nada'
    from anomalias an
   where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%');
$$;

comment on function public.deteccion_reglas_violadas() is
  'Las reglas de la v1.3, verificadas en el build. Falla por omision: el '
  'detector numero trece que copie al de al lado sin el `que_no_dice` rompe '
  'el build en vez de publicar un aviso que se lee como una acusacion.';

revoke all on function public.deteccion_reglas_violadas() from public, anon;
grant execute on function public.deteccion_reglas_violadas() to authenticated, service_role;
