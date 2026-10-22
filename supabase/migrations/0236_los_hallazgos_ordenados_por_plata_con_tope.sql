-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0236 · QUE NO SE VUELVA RUIDO                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Este es el bloque que decide si los doce detectores sirven o no.
--
-- Corridos crudos dan **1.235 hallazgos**. Un sistema que avisa 1.235 cosas
-- no avisa nada: la primera semana se mira, la segunda se mira menos, la
-- tercera se cierra la pestaña. Y despues, cuando avise algo de verdad, va a
-- estar abajo de mil doscientos avisos que no importaban.
--
-- ── D.1 · PLATA AL LADO, O A LA LISTA LARGA ─────────────────────────────────
--
-- Todo hallazgo se guarda. Pero arriba van solo los que tienen plata
-- estimada: un hallazgo sin plata no se puede comparar contra otro, y la
-- lista principal es una comparacion.
--
-- Los detectores ya dicen cual de las dos cosas pasa cuando no hay plata:
-- «no se puede costear» (falta el dato) o «no se estima plata» (el dato esta
-- y la plata es cero de verdad). Las dos van a la lista larga.

-- ── D.5 · DESCARTAR CON UN MOTIVO ───────────────────────────────────────────
--
-- Un boton que solo dice «descartar» no ensena nada: al tercer descarte el
-- detector sigue avisando lo mismo y la persona sigue descartando lo mismo.
--
-- ── POR QUE NO TODO MOTIVO SILENCIA ─────────────────────────────────────────
--
-- «Es a proposito» dice que el detector no entendio el negocio: tiene que
-- callarse. «Ya lo resolvi» dice lo contrario —el hallazgo era real y se
-- actuo— y silenciarlo seria apagar justo al detector que sirve.
--
-- Y «no entiendo que dice» no silencia nada: es un problema de la frase, no
-- del detector, y apagarlo esconderia el problema en vez de arreglarlo.

create table if not exists public.deteccion_motivos (
  clave      text primary key,
  nombre     text not null,
  -- Si tres descartes con este motivo callan al detector.
  silencia   boolean not null default false,
  -- Si este motivo afirma que el hallazgo no era real. Define el marcador
  -- de D.7, y es distinto de silenciar.
  no_era_real boolean not null default false,
  ayuda      text not null,
  orden      integer not null default 100
);

comment on table public.deteccion_motivos is
  'D.5 · Los motivos de descarte. `silencia` y `no_era_real` son dos cosas '
  'distintas: «ya lo resolvi» no silencia y tampoco dice que fuera falso.';

alter table public.deteccion_motivos enable row level security;
drop policy if exists motivos_ver on public.deteccion_motivos;
create policy motivos_ver on public.deteccion_motivos
  for select to authenticated using (true);

insert into public.deteccion_motivos (clave, nombre, silencia, no_era_real, ayuda, orden) values
  ('es_a_proposito', 'Es a propósito', true, true,
   'Esto esta asi porque alguien lo decidio. El detector no lo sabia.', 10),
  ('dato_mal_cargado', 'El dato está mal cargado', true, true,
   'El hallazgo sale de un dato equivocado, no de algo que pase en el negocio.', 20),
  ('no_es_asi', 'No es así', true, true,
   'Lo que dice no es lo que pasa.', 30),
  ('ya_lo_resolvi', 'Ya lo resolví', false, false,
   'Era real y ya se actuo. El detector acerto.', 40),
  ('no_ahora', 'No ahora', false, false,
   'Es real pero no es el momento. Vuelve a aparecer mas adelante.', 50),
  ('no_entiendo', 'No entiendo qué dice', false, false,
   'La frase no se entiende. Eso es un problema de como esta escrita, no del detector: no lo silencia.', 60)
on conflict (clave) do update set
  nombre = excluded.nombre, silencia = excluded.silencia,
  no_era_real = excluded.no_era_real, ayuda = excluded.ayuda, orden = excluded.orden;

-- ── D.6 · LO QUE SE DESCARTO Y DESPUES PASO ─────────────────────────────────
--
-- El hecho y la plata se COPIAN en la fila del descarte. No es redundancia:
-- si la anomalia se cierra, se recalcula o cambia de forma, el registro de
-- «se descarto esto, y despues paso» tiene que seguir diciendo que era «esto»
-- exactamente. Un registro que apunta a algo que cambio no prueba nada.

create table if not exists public.deteccion_descartes (
  id               uuid primary key default gen_random_uuid(),
  anomalia_id      uuid references public.anomalias(id) on delete set null,
  detector         text not null references public.detectores(clave),
  clave            text not null,
  motivo           text not null references public.deteccion_motivos(clave),
  nota             text,
  sucursal_id      uuid references public.sucursales(id) on delete set null,
  -- Copiados a proposito. Ver el encabezado.
  hecho            text not null,
  plata            numeric,
  descartado_por   uuid references auth.users(id) on delete set null,
  descartado_at    timestamptz not null default now(),
  -- D.6 · cuando el hallazgo descartado volvio a aparecer.
  volvio_at        timestamptz,
  volvio_veces     integer not null default 0
);

comment on table public.deteccion_descartes is
  'D.5 y D.6 · Cada descarte con su motivo, y si despues volvio a pasar. El '
  'hecho y la plata se copian: un registro que apunta a algo que despues '
  'cambio no prueba nada.';

create index if not exists descartes_detector on public.deteccion_descartes (detector, motivo);
create index if not exists descartes_clave on public.deteccion_descartes (clave);

alter table public.deteccion_descartes enable row level security;
drop policy if exists descartes_ver on public.deteccion_descartes;
create policy descartes_ver on public.deteccion_descartes
  for select to authenticated using (true);

-- ── D.5 · EL DETECTOR APRENDE ───────────────────────────────────────────────
--
-- Tres descartes con un motivo que silencia, y ese detector deja de reportar
-- **ese motivo**. No deja de reportar todo: si lo descartaron tres veces
-- porque el dato estaba mal cargado, eso no dice nada de los hallazgos que
-- salen de datos bien cargados.
--
-- Se calcula, no se guarda. Un `silenciado boolean` en `detectores` se
-- desincroniza el dia que alguien borra un descarte, y entonces un detector
-- queda callado sin que nadie pueda ver por que.

create or replace function public.deteccion_silencios()
returns table (detector text, motivo text, motivo_nombre text,
               veces integer, desde timestamptz, por_que text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.detector, d.motivo, m.nombre, count(*)::integer,
         min(d.descartado_at),
         format('se descarto %s veces con el motivo «%s». El detector dejo de reportar lo que se descarta por ese motivo.',
                count(*), m.nombre)
    from deteccion_descartes d
    join deteccion_motivos m on m.clave = d.motivo
   where m.silencia
     -- Un descarte que despues volvio a pasar no cuenta para callar al
     -- detector: el detector tenia razon y el descarte estaba equivocado.
     and d.volvio_at is null
   group by d.detector, d.motivo, m.nombre
  having count(*) >= 3;
$$;

comment on function public.deteccion_silencios() is
  'D.5 · Tres descartes con el mismo motivo que silencia y el detector deja de '
  'reportar ESO. Se calcula y no se guarda: un flag se desincroniza y despues '
  'nadie puede ver por que un detector esta callado.';

-- ── D.7 · EL MARCADOR DE CADA DETECTOR ──────────────────────────────────────
--
-- Con la misma disciplina que el medidor de la v0.99, que tiene una leccion
-- escrita en su propio codigo: «EL CASO QUE ANTES DABA ACIERTO SIEMPRE». Un
-- marcador que cuenta como acierto lo que no se puede medir no es un
-- marcador, es un adorno.
--
-- Aca:
--
--   acierto      · se resolvio, o se descarto y despues volvio a pasar
--   no_acerto    · se descarto con un motivo que dice que no era real
--   sin_medir    · esta abierto, o se descarto con «no ahora» o «no
--                  entiendo». Nadie actuo, asi que no se sabe.
--
-- Y el que nunca acierta se apaga. Con los mismos parametros que ya usa el
-- sistema para subir y bajar agentes: `ascenso_minimo_medidas` (10) para no
-- juzgar con dos casos, y `bajada_pct_acierto` (40) como piso.

create or replace function public.deteccion_marcador()
returns table (
  detector text, nombre text, familia text,
  abiertos integer, aciertos integer, no_acerto integer, sin_medir integer,
  pct_acierto numeric, plata_abierta numeric,
  descartes integer, volvieron integer,
  se_puede_juzgar boolean, veredicto text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with minimo as (
    select coalesce((select max(valor)::int from compras_parametros
                      where clave = 'ascenso_minimo_medidas'), 10) as n,
           coalesce((select max(valor)::numeric from compras_parametros
                      where clave = 'bajada_pct_acierto'), 40) as piso
  ),
  a as (
    select an.detector,
           count(*) filter (where an.estado in ('abierta', 'en_curso', 'reaparecio'))::integer as abiertos,
           count(*) filter (where an.estado = 'resuelta')::integer as resueltas,
           sum(an.plata_en_juego) filter (
             where an.estado in ('abierta', 'en_curso', 'reaparecio')) as plata_abierta
      from anomalias an
     group by an.detector
  ),
  de as (
    select d.detector,
           count(*)::integer as descartes,
           count(*) filter (where d.volvio_at is not null)::integer as volvieron,
           count(*) filter (where m.no_era_real and d.volvio_at is null)::integer as no_era_real,
           count(*) filter (where not m.no_era_real and d.volvio_at is null)::integer as no_juzgable
      from deteccion_descartes d
      join deteccion_motivos m on m.clave = d.motivo
     group by d.detector
  )
  select det.clave, det.nombre, det.familia::text,
    coalesce(a.abiertos, 0),
    coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0),
    coalesce(de.no_era_real, 0),
    coalesce(a.abiertos, 0) + coalesce(de.no_juzgable, 0),
    case when coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0) > 0
         then round(100.0 * (coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0))
                  / (coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0)), 1)
    end,
    coalesce(a.plata_abierta, 0),
    coalesce(de.descartes, 0),
    coalesce(de.volvieron, 0),
    (coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0)) >= (select n from minimo),
    case
      when not det.activo then
        coalesce(det.apagado_porque, 'esta apagado y no quedo dicho por que')
      when (coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0)) = 0 then
        format('todavia no se puede juzgar: nadie resolvio ni descarto ninguno de los %s hallazgos abiertos. Un marcador que cuenta como acierto lo que nadie miro no es un marcador.',
               coalesce(a.abiertos, 0))
      when (coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0)) < (select n from minimo) then
        format('%s de %s medidas necesarias para juzgarlo. Acerto %s veces y fallo %s.',
               coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0),
               (select n from minimo),
               coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0), coalesce(de.no_era_real, 0))
      when coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) = 0 then
        format('no acerto ninguna de las %s veces que se pudo medir. Se apaga.',
               coalesce(de.no_era_real, 0))
      else
        format('acerto %s de %s veces medibles.',
               coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0),
               coalesce(a.resueltas, 0) + coalesce(de.volvieron, 0) + coalesce(de.no_era_real, 0))
    end
  from detectores det
  left join a on a.detector = det.clave
  left join de on de.detector = det.clave
  order by det.orden;
$$;

comment on function public.deteccion_marcador() is
  'D.7 · Cuantas veces acerto cada detector, con la disciplina del medidor de '
  'la v0.99: lo que nadie miro no cuenta como acierto. Un detector sin '
  'aciertos medibles se apaga, y queda dicho.';

revoke all on function public.deteccion_silencios() from public, anon;
revoke all on function public.deteccion_marcador() from public, anon;
grant execute on function public.deteccion_silencios() to authenticated, service_role;
grant execute on function public.deteccion_marcador() to authenticated, service_role;
