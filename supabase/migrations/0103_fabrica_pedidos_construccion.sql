-- ═══════════════════════════════════════════════════════════════
-- FÁBRICA NORA · pedidos de construcción
-- ═══════════════════════════════════════════════════════════════
--
-- LA COLA DE CONSTRUCCIÓN, SACADA DE DEMANDA REAL.
--
-- En v0.66 el chat ofreció seis veces "lo anoto como pedido de construcción" y
-- no había dónde anotarlo: quedaba como prosa en la bitácora. Esta tabla es ese
-- lugar, y de paso es lo que convierte "qué construyo ahora" de intuición en
-- dato: cuántas veces se pidió cada cosa, en cuántos proyectos, por cuánta
-- gente.
--
-- SE CREA SÓLO CON CONFIRMACIÓN DE LA PERSONA. Un pedido registrado porque el
-- asistente creyó entender que hacía falta ensucia la cola con comentarios al
-- pasar, y una cola con ruido se deja de mirar.
--
-- POR QUÉ `falta` ES UNA COLUMNA Y NO UNA ETIQUETA LIBRE: "necesita un molde"
-- y "necesita que el lector lea otra cosa" son trabajos completamente
-- distintos, con equipos y tiempos distintos. Si se guardan como texto libre,
-- la cola se puede leer pero no se puede repartir.

create or replace function fab_normalizar_texto(txt text)
returns text
language sql
immutable parallel safe
set search_path to ''
as $$
  -- Mismo criterio que doc_normalizar_texto, en el namespace de la fábrica.
  -- Copiado y no reutilizado a propósito: la fábrica se tiene que poder sacar
  -- de este repo, y una función del motor de documentos no viaja con ella.
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(txt, ''))),
          '[^a-z0-9 ]+', ' ', 'g'
        ),
        ' {2,}', ' ', 'g'
      )
    ),
    ''
  )
$$;

comment on function fab_normalizar_texto(text) is
  'Normaliza texto para comparar pedidos parecidos. Equivalente propio de la fábrica: no depende del motor de documentos.';

create table if not exists fab_pedidos_construccion (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references fab_proyectos (id) on delete cascade,
  -- El pool al que se le pidió, si el pedido tenía uno. Un pedido puede no
  -- pertenecer a ninguna pieza todavía: eso es justamente lo que lo hace un
  -- pedido de construcción y no una propuesta.
  pool_id       uuid references fab_pools (id) on delete set null,

  -- EN LAS PALABRAS DE QUIEN LO PIDIÓ. No se resume ni se traduce a jerga:
  -- lo que se pierde al resumir es el motivo, que es lo único que después
  -- permite decidir si dos pedidos son el mismo.
  pedido        text not null,
  -- Lo que se supo del contexto: para qué, quién lo usaría, contra qué dato.
  contexto      text,

  -- Qué falta para poder hacerlo.
  falta         text not null check (
    falta in (
      'molde',            -- no hay un patrón de pantalla o flujo que lo cubra
      'entidad',          -- hace falta guardar algo que hoy no se guarda
      'comportamiento',   -- hace falta que el sistema haga algo que no hace
      'integracion',      -- depende de un sistema de afuera
      'capacidad_lector'  -- existe declarado, el lector todavía no lo lee
    )
  ),
  -- A qué molde o patrón existente se parece, si a alguno. Texto libre a
  -- propósito: todavía no hay moldes, y una FK a una tabla vacía no dice nada.
  se_parece_a  text,

  estado        text not null default 'abierto' check (
    estado in ('abierto', 'en_analisis', 'en_construccion', 'resuelto', 'descartado')
  ),
  -- Descartar exige decir por qué. Un pedido que desaparece sin motivo se
  -- vuelve a pedir, y la próxima vez nadie sabe que ya se había decidido.
  motivo_cierre text,

  -- De qué conversación salió. Es lo que permite volver a leer el pedido
  -- completo cuando el resumen no alcanza.
  turno_id      uuid references fab_chat_turnos (id) on delete set null,

  -- El vínculo manual entre pedidos que piden lo mismo. Apunta al pedido más
  -- viejo del grupo; NO hay motor de agrupación, sólo sugerencias por
  -- similitud de texto y una persona que decide.
  duplicado_de uuid references fab_pedidos_construccion (id) on delete set null,

  -- Para las sugerencias. Se calcula al insertar, no al consultar: comparar
  -- normalizando en cada consulta hace la cola más lenta cuanto más útil es.
  pedido_norm  text,

  creado_at     timestamptz not null default now(),
  creado_por    uuid references auth.users (id) on delete set null,
  cerrado_at    timestamptz,
  cerrado_por   uuid references auth.users (id) on delete set null,

  constraint fab_pedidos_cierre_con_motivo check (
    estado not in ('resuelto', 'descartado') or motivo_cierre is not null
  ),
  constraint fab_pedidos_no_es_su_propio_duplicado check (duplicado_de is distinct from id)
);

create index if not exists fab_pedidos_proyecto_idx
  on fab_pedidos_construccion (proyecto_id, creado_at desc);
create index if not exists fab_pedidos_abiertos_idx
  on fab_pedidos_construccion (estado, falta)
  where estado in ('abierto', 'en_analisis');
create index if not exists fab_pedidos_grupo_idx
  on fab_pedidos_construccion (duplicado_de)
  where duplicado_de is not null;
create index if not exists fab_pedidos_norm_idx
  on fab_pedidos_construccion (pedido_norm);

create or replace function fab_pedidos_normalizar()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.pedido_norm := public.fab_normalizar_texto(new.pedido);
  return new;
end;
$$;

drop trigger if exists fab_pedidos_normalizar_tg on fab_pedidos_construccion;
create trigger fab_pedidos_normalizar_tg
  before insert or update of pedido on fab_pedidos_construccion
  for each row execute function fab_pedidos_normalizar();

alter table fab_pedidos_construccion enable row level security;

-- Lee quien puede ver el proyecto. Escribe el servidor: el pedido lo crea el
-- chat con confirmación, o el portal con la firma de quien arma.
create policy fab_pedidos_ver on fab_pedidos_construccion
  for select using (fab_puede_ver(proyecto_id));

comment on table fab_pedidos_construccion is
  'Lo que se pidió y todavía no existe. Es la cola de construcción de la fábrica, ordenada por demanda real.';
