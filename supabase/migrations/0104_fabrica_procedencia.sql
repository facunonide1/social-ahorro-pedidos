-- ═══════════════════════════════════════════════════════════════
-- FÁBRICA NORA · procedencia de cada valor declarado
-- ═══════════════════════════════════════════════════════════════
--
-- NORA lo pidió textual en v0.66: "¿sabés quién lo revirtió y por qué?".
--
-- Podía ver que un título se había cambiado y revertido dos veces —lo leía de
-- la cola de propuestas— pero no por qué, porque la nota de decisión vive en la
-- propuesta y la propuesta envejece, expira y se pierde de vista. El valor
-- sobrevive; el motivo no.
--
-- ── POR QUÉ ES UN REGISTRO POR CAMPO Y NO POR VERSIÓN ───────────────────────
--
-- Las versiones ya guardan quién, cuándo y por qué. Lo que no guardan es QUÉ
-- CAMPO. Una versión que tocó ocho títulos tiene un solo motivo, y preguntarle
-- "¿por qué este título dice esto?" devuelve el motivo de los ocho. Sirve para
-- auditar, no para decidir.
--
-- ── POR QUÉ ES APPEND-ONLY ──────────────────────────────────────────────────
--
-- La procedencia de un campo es su fila más reciente. Las anteriores son su
-- historia, y la historia es la mitad útil: "esto ya se cambió y se revirtió
-- dos veces" es exactamente lo que hay que decirle a alguien antes de que lo
-- pida por tercera vez.

create table if not exists fab_procedencia (
  id            uuid primary key default gen_random_uuid(),

  -- Nivel del valor. Un campo de pieza no tiene proyecto: cambia para todos.
  nivel         text not null check (nivel in ('pool', 'instalacion')),
  pool_id       uuid not null references fab_pools (id) on delete cascade,
  proyecto_id   uuid references fab_proyectos (id) on delete cascade,

  -- El camino del campo, con el mismo formato que usa `resolver()` para los
  -- orígenes: pantallas.<ruta>.titulo · configurable.<clave> · etc.
  campo         text not null,
  valor_anterior jsonb,
  valor_nuevo    jsonb,

  -- Por qué. Es el motivo de la versión que lo cambió: si una versión tocó
  -- ocho campos, los ocho comparten motivo, y eso es honesto — fue una sola
  -- decisión.
  motivo        text not null,
  -- De dónde salió: la versión de pieza o de instalación que lo escribió.
  version_id    uuid,
  -- Y la propuesta, si vino de una. Puede no venir: el escritor también se usa
  -- desde los scripts de publicación.
  propuesta_id  uuid references fab_propuestas (id) on delete set null,
  -- true = esta fila deshace una anterior. Es lo que permite contar reversiones
  -- sin interpretar el texto del motivo.
  es_reversion  boolean not null default false,

  decidido_por  uuid references auth.users (id) on delete set null,
  decidido_at   timestamptz not null default now(),

  constraint fab_procedencia_proyecto_segun_nivel check (
    (nivel = 'pool' and proyecto_id is null) or (nivel = 'instalacion' and proyecto_id is not null)
  )
);

-- La consulta que importa: "la procedencia de este campo", que es la fila más
-- reciente, y su historia, que es todas.
create index if not exists fab_procedencia_campo_idx
  on fab_procedencia (pool_id, nivel, campo, decidido_at desc);
create index if not exists fab_procedencia_proyecto_idx
  on fab_procedencia (proyecto_id, decidido_at desc)
  where proyecto_id is not null;

alter table fab_procedencia enable row level security;

-- La de instalación la ve quien ve el proyecto. La de pieza la ve cualquier
-- miembro de la fábrica: una decisión sobre la pieza afecta a todos los que la
-- instalaron, y esconderla sería raro.
create policy fab_procedencia_ver on fab_procedencia
  for select using (
    (nivel = 'pool')
    or (proyecto_id is not null and fab_puede_ver(proyecto_id))
  );

comment on table fab_procedencia is
  'Quién decidió cada valor declarado, cuándo y por qué. Append-only: la fila más reciente es la procedencia, las anteriores son la historia.';
