-- ═══════════════════════════════════════════════════════════════
-- FÁBRICA NORA · registro de conversaciones del chat
-- ═══════════════════════════════════════════════════════════════
--
-- LA BITÁCORA DE LA FÁBRICA.
--
-- Cada turno queda: qué se pidió, qué contestó NORA, si propuso algo y con qué
-- resultado, y —cuando dijo que no— por cuál de los cuatro motivos.
--
-- POR QUÉ SE GUARDA EL MOTIVO Y NO SÓLO EL TEXTO: el texto sirve para leer una
-- conversación; el motivo sirve para contarlas. El día que "necesita algo que
-- no existe" sea el 40% de las negativas, eso no es un problema del chat: es la
-- lista de lo que hay que construir, ordenada por cuánta gente la pidió.
--
-- POR QUÉ NO SE GUARDA LO QUE EL MODELO PENSÓ: no hace falta y ocuparía diez
-- veces más. Lo que se audita es lo que la persona leyó y lo que el sistema
-- hizo, no cómo llegó ahí.
--
-- El vínculo con la propuesta es ON DELETE SET NULL a propósito: si algún día
-- se purga una propuesta vieja, la conversación tiene que sobrevivir. Borrar la
-- consecuencia no debería borrar el pedido.

create table if not exists fab_chat_turnos (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references fab_proyectos (id) on delete cascade,
  usuario_id    uuid references auth.users (id) on delete set null,

  -- Lo que se pidió y lo que se contestó, tal cual.
  mensaje       text not null,
  respuesta     text not null,

  -- Si la persona podía proponer o sólo consultar. Sin esto no se puede
  -- distinguir "NORA no propuso nada" de "NORA no podía proponer nada".
  podia_proponer boolean not null default false,

  -- Si generó una propuesta.
  propuesta_id  uuid references fab_propuestas (id) on delete set null,
  carril        text,

  -- Si dijo que no, por cuál de los cuatro motivos.
  negativa      text check (
    negativa is null
    or negativa in ('constitucional', 'no_existe', 'fuera_del_lector', 'proyecto_no_listo')
  ),

  creado_at     timestamptz not null default now()
);

create index if not exists fab_chat_turnos_proyecto_idx
  on fab_chat_turnos (proyecto_id, creado_at desc);

-- Para la medición: cuántas veces se dijo que no, y por qué.
create index if not exists fab_chat_turnos_negativa_idx
  on fab_chat_turnos (proyecto_id, negativa)
  where negativa is not null;

alter table fab_chat_turnos enable row level security;

-- Lee quien puede ver el proyecto, igual que las propuestas. Escribe sólo el
-- servidor: el turno lo registra `conversar()`, no el navegador.
create policy fab_chat_turnos_ver on fab_chat_turnos
  for select using (fab_puede_ver(proyecto_id));

comment on table fab_chat_turnos is
  'Bitácora del chat de la fábrica: qué se pidió, qué se contestó, qué propuso y por qué dijo que no.';
