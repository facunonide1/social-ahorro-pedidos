-- ═══════════════════════════════════════════════════════════════
-- FÁBRICA NORA · defectos de la pieza
-- ═══════════════════════════════════════════════════════════════
--
-- UN DEFECTO DE PIEZA NO ES UN PEDIDO DE CONSTRUCCIÓN.
--
-- Un pedido es algo que no existe y hay que construir. Un defecto es algo que
-- YA existe y está mal escrito en la declaración compartida. Ponerlos en la
-- misma cola haría que la cola de construcción —que se ordena por demanda para
-- decidir qué construir— se llene de cosas que no hay que construir, y perdería
-- exactamente la propiedad por la que existe.
--
-- ── DE DÓNDE SALIERON LOS PRIMEROS TRECE ────────────────────────────────────
--
-- En v0.67 se clasificaron los 17 overrides de título de documentos y stock.
-- Trece coincidían con el literal del código y no con la pieza: la pieza dice
-- "Inventarios" y el código muestra "Inventarios físicos". El override los
-- tapaba, y taparlos es lo que hace que el próximo negocio que instale la pieza
-- se coma el mismo problema.
--
-- ── POR QUÉ `en_que_proyectos` ES UNA LISTA ─────────────────────────────────
--
-- Un defecto de la pieza se manifiesta donde la pieza está instalada, y no
-- necesariamente en todos: un proyecto puede tener el pool apagado y no verlo
-- nunca. Saber en cuántos se manifiesta es lo que ordena la urgencia, igual que
-- la demanda ordena la cola de construcción.

create table if not exists fab_defectos_pieza (
  id            uuid primary key default gen_random_uuid(),
  pool_id       uuid not null references fab_pools (id) on delete cascade,

  -- El camino del campo, con el mismo formato que usa la procedencia:
  -- pantallas.<ruta>.titulo · configurable.<clave>
  campo         text not null,
  dice          text,
  deberia_decir text,

  -- Cómo se detectó. No es prosa: es lo que permite volver a correr la misma
  -- comprobación y ver si el defecto sigue ahí.
  detectado_por text not null,
  evidencia     text,

  -- En qué proyectos se manifiesta hoy.
  en_que_proyectos uuid[] not null default '{}',

  estado        text not null default 'abierto' check (
    estado in ('abierto', 'corregido', 'descartado')
  ),
  -- Cerrar exige decir por qué, igual que en los pedidos: un defecto que
  -- desaparece sin motivo vuelve a detectarse y nadie sabe que ya se decidió.
  motivo_cierre text,
  -- La versión de pieza que lo corrigió, si se corrigió.
  version_id    uuid,

  detectado_at  timestamptz not null default now(),
  cerrado_at    timestamptz,
  cerrado_por   uuid references auth.users (id) on delete set null,

  constraint fab_defectos_cierre_con_motivo check (
    estado = 'abierto' or motivo_cierre is not null
  )
);

-- Un mismo campo no puede tener dos defectos ABIERTOS: sería contar dos veces el
-- mismo problema, que es el hallazgo 14 en otra tabla. Índice parcial y no
-- constraint sobre (pool, campo, estado): el mismo campo sí puede tener varios
-- defectos ya corregidos a lo largo del tiempo, y eso es historia, no duplicado.
create unique index if not exists fab_defectos_uno_abierto_por_campo
  on fab_defectos_pieza (pool_id, campo)
  where estado = 'abierto';

alter table fab_defectos_pieza enable row level security;

-- Un defecto de la pieza lo ve cualquier miembro de la fábrica: la pieza es de
-- todos los que la instalaron, y esconderle a uno un defecto que le afecta sería
-- exactamente lo que esta tabla vino a evitar.
create policy fab_defectos_ver on fab_defectos_pieza
  for select using (
    exists (select 1 from fab_usuarios_proyecto where usuario_id = auth.uid())
  );

comment on table fab_defectos_pieza is
  'Lo que la declaración compartida dice mal. No es algo para construir: es algo escrito mal.';
