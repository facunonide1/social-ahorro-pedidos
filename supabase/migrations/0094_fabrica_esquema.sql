-- ============================================================================
-- 0094 · FÁBRICA NORA · esquema base de proyectos y pools (v0.58)
-- ============================================================================
-- La idea entera de la fábrica cabe en esta migración:
--
--   Un POOL es una pieza de software declarada como DATO (no como código).
--   Una VERSIÓN de un pool es un manifiesto congelado.
--   Una INSTALACIÓN es "este proyecto usa esta versión de este pool".
--
-- El catálogo de pools es GLOBAL: una pieza no pertenece a un proyecto, se
-- instala en muchos. Por eso fab_pools no tiene proyecto_id y fab_instalaciones
-- sí. Ahí está toda la diferencia entre un catálogo y una copia.
--
-- FRONTERA (igual que en 0093):
--   · SOLO tablas fab_*
--   · NUNCA un ALTER sobre una tabla que no es de la fábrica
--   · La fábrica LEE el sistema existente; jamás le escribe
--
-- Vocabulario NEUTRO: proyecto, pool, entidad, acción, molde, tercero, item.
-- ============================================================================


-- ============================================================================
-- 1 · Quién entra a qué proyecto
-- ============================================================================
-- El rol 'dueño_fabrica' es GLOBAL, no del proyecto donde está escrito: si un
-- usuario tiene una sola fila con ese rol, ve todos los proyectos. Se resuelve
-- así, y no con una tabla aparte, porque el dueño igual necesita una membresía
-- para trabajar y dos tablas para la misma pregunta se desincronizan.

create table if not exists public.fab_usuarios_proyecto (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.fab_proyectos(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,

  /** dueño_fabrica (global) | armador (declara y instala) | observador (solo lee) */
  rol         text not null default 'observador'
                check (rol in ('dueño_fabrica','armador','observador')),

  invitado_por uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (proyecto_id, usuario_id)
);

create index if not exists fab_usuarios_proyecto_usuario_idx
  on public.fab_usuarios_proyecto(usuario_id);

comment on table public.fab_usuarios_proyecto is
  'Membresía de un usuario en un proyecto. El rol dueño_fabrica es global: alcanza una fila para ver todos los proyectos.';


-- ============================================================================
-- 2 · El catálogo de pools
-- ============================================================================
-- Global a propósito. Cuando el segundo proyecto instale Ofertas, instala ESTA
-- fila, no una copia.

create table if not exists public.fab_pools (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null unique,
  nombre       text not null,
  descripcion  text,

  /** nucleo (no se desinstala) | generico (cualquier rubro) | vertical (un rubro) */
  categoria    text not null default 'generico'
                 check (categoria in ('nucleo','generico','vertical')),

  /** borrador | declarado (tiene manifiesto) | estable (instalado y verificado) | deprecado */
  estado       text not null default 'borrador'
                 check (estado in ('borrador','declarado','estable','deprecado')),

  /** Claves de otros pools que éste necesita para funcionar. */
  depende_de   jsonb not null default '[]'::jsonb,
  /** Rubros donde tiene sentido ofrecerlo. Vacío = cualquiera. */
  rubros       jsonb not null default '[]'::jsonb,

  /** De qué proyecto se extrajo la pieza. Trazabilidad, no dependencia. */
  origen_proyecto_id uuid references public.fab_proyectos(id) on delete set null,

  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

create index if not exists fab_pools_categoria_idx on public.fab_pools(categoria, estado);

comment on table public.fab_pools is
  'Catálogo global de piezas declarables. Un pool no pertenece a un proyecto: se instala en varios.';


-- ============================================================================
-- 3 · Versiones: el manifiesto congelado
-- ============================================================================
-- El manifiesto es el corazón de la fábrica: la declaración completa de una
-- pieza como dato. Se guarda como jsonb y NO se valida acá con un check —
-- validarlo en SQL congelaría la forma del manifiesto antes de saber cuál es.
-- La validación vive en TypeScript, donde puede evolucionar.
--
-- Una versión publicada es INMUTABLE por convención: si el manifiesto cambia,
-- se crea una versión nueva. Sin eso, "esta instalación usa la versión 1.0" no
-- quiere decir nada.

create table if not exists public.fab_pool_versiones (
  id           uuid primary key default gen_random_uuid(),
  pool_id      uuid not null references public.fab_pools(id) on delete cascade,

  /** Semver en texto: '1.0.0'. Texto y no int porque el salto mayor comunica. */
  version      text not null,

  /** La declaración completa: entidades, pantallas, acciones, permisos, moldes. */
  manifiesto   jsonb not null default '{}'::jsonb,

  /** borrador | publicada (inmutable) | deprecada */
  estado       text not null default 'borrador'
                 check (estado in ('borrador','publicada','deprecada')),

  /** espejo: describe código que ya existe. generado: la fábrica lo produce. */
  modo         text not null default 'espejo'
                 check (modo in ('espejo','generado')),

  notas_cambio text,
  publicada_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,

  unique (pool_id, version)
);

create index if not exists fab_pool_versiones_pool_idx
  on public.fab_pool_versiones(pool_id, estado);

comment on table public.fab_pool_versiones is
  'Manifiesto congelado de un pool. Una versión publicada no se edita: se crea otra.';
comment on column public.fab_pool_versiones.modo is
  'espejo = la declaración describe código escrito a mano que ya existe. generado = la fábrica produce el código. Empezar en espejo es lo que permite declarar sin reescribir.';


-- ============================================================================
-- 4 · Instalaciones: qué usa cada proyecto
-- ============================================================================

create table if not exists public.fab_instalaciones (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.fab_proyectos(id) on delete cascade,
  pool_id      uuid not null references public.fab_pools(id) on delete restrict,
  version_id   uuid not null references public.fab_pool_versiones(id) on delete restrict,

  /** declarada (existe en papel) | activa | pausada | desinstalada */
  estado       text not null default 'declarada'
                 check (estado in ('declarada','activa','pausada','desinstalada')),

  /** Lo que cambia entre proyectos sin cambiar la pieza: nombres, umbrales, moneda. */
  configuracion jsonb not null default '{}'::jsonb,

  instalada_at timestamptz,
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,

  -- Un pool se instala una vez por proyecto. Cambiar de versión es un update,
  -- no una fila nueva: el historial vive en fab_pool_versiones.
  unique (proyecto_id, pool_id)
);

create index if not exists fab_instalaciones_proyecto_idx
  on public.fab_instalaciones(proyecto_id, estado);

comment on table public.fab_instalaciones is
  'Este proyecto usa esta versión de este pool, con esta configuración.';


-- ============================================================================
-- 5 · Verificaciones de espejo
-- ============================================================================
-- Una declaración en modo espejo es una afirmación sobre el código: "Ofertas
-- tiene estas 10 entidades y estas 11 pantallas". Una afirmación sin verificar
-- se pudre sola. Cada corrida del comparador deja una fila acá.
--
-- Cuando difieren, la que se corrige es la DECLARACIÓN. El código de un sector
-- existente no se toca para que cuadre con la fábrica.

create table if not exists public.fab_declaraciones_espejo (
  id             uuid primary key default gen_random_uuid(),
  instalacion_id uuid not null references public.fab_instalaciones(id) on delete cascade,
  version_id     uuid references public.fab_pool_versiones(id) on delete set null,

  /** coincide | difiere | error */
  resultado      text not null
                   check (resultado in ('coincide','difiere','error')),

  /** [{tipo, elemento, en_declaracion, en_codigo}] — el detalle de lo que no cuadra. */
  diferencias    jsonb not null default '[]'::jsonb,
  faltan_en_codigo      int not null default 0,
  faltan_en_declaracion int not null default 0,

  /** En prosa, para que lo lea una persona y no un parser. */
  resumen        text,

  verificado_at  timestamptz not null default now(),
  verificado_por uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists fab_espejo_instalacion_idx
  on public.fab_declaraciones_espejo(instalacion_id, verificado_at desc);

comment on table public.fab_declaraciones_espejo is
  'Historial del comparador declaración↔código. Si difieren, se corrige la declaración, nunca el código del sector.';


-- ============================================================================
-- 6 · RLS
-- ============================================================================
-- Se filtra SIEMPRE por proyecto, aunque hoy haya uno solo. Ésta es la política
-- que mañana separa un cliente de otro, y escribirla después es escribirla mal.
--
-- Las funciones son SECURITY DEFINER para romper la recursión: una política
-- sobre fab_usuarios_proyecto que consultara fab_usuarios_proyecto se llamaría
-- a sí misma para siempre.
--
-- search_path fijo: sin eso, un search_path del atacante puede sustituir las
-- tablas que la función lee, y SECURITY DEFINER las lee con permisos de dueño.

create or replace function public.fab_es_dueno()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fab_usuarios_proyecto
    where usuario_id = auth.uid() and rol = 'dueño_fabrica'
  );
$$;

create or replace function public.fab_puede_ver(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fab_es_dueno() or exists (
    select 1 from public.fab_usuarios_proyecto
    where usuario_id = auth.uid() and proyecto_id = p_proyecto
  );
$$;

create or replace function public.fab_puede_armar(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fab_es_dueno() or exists (
    select 1 from public.fab_usuarios_proyecto
    where usuario_id = auth.uid()
      and proyecto_id = p_proyecto
      and rol in ('dueño_fabrica','armador')
  );
$$;

-- Postgres otorga EXECUTE a PUBLIC por default. Sobre una función SECURITY
-- DEFINER eso es una puerta abierta, así que se cierra explícitamente y se
-- vuelve a abrir solo para authenticated, que es quien evalúa las políticas.
revoke all on function public.fab_es_dueno()          from public, anon, authenticated;
revoke all on function public.fab_puede_ver(uuid)     from public, anon, authenticated;
revoke all on function public.fab_puede_armar(uuid)   from public, anon, authenticated;
grant execute on function public.fab_es_dueno()        to authenticated;
grant execute on function public.fab_puede_ver(uuid)   to authenticated;
grant execute on function public.fab_puede_armar(uuid) to authenticated;

alter table public.fab_usuarios_proyecto     enable row level security;
alter table public.fab_pools                 enable row level security;
alter table public.fab_pool_versiones        enable row level security;
alter table public.fab_instalaciones         enable row level security;
alter table public.fab_declaraciones_espejo  enable row level security;

-- anon no tiene nada que hacer acá; authenticated pasa por las políticas.
revoke all on public.fab_usuarios_proyecto    from anon;
revoke all on public.fab_pools                from anon;
revoke all on public.fab_pool_versiones       from anon;
revoke all on public.fab_instalaciones        from anon;
revoke all on public.fab_declaraciones_espejo from anon;

grant select on public.fab_proyectos, public.fab_censo_sectores,
                public.fab_usuarios_proyecto, public.fab_pools,
                public.fab_pool_versiones, public.fab_instalaciones,
                public.fab_declaraciones_espejo
  to authenticated;

-- 0093 dejó estas dos cerradas a todo el mundo porque todavía no existía la
-- tabla de membresías. Ahora existe: se abren con política.
drop policy if exists fab_proyectos_ver on public.fab_proyectos;
create policy fab_proyectos_ver on public.fab_proyectos
  for select to authenticated
  using (public.fab_puede_ver(id));

drop policy if exists fab_censo_ver on public.fab_censo_sectores;
create policy fab_censo_ver on public.fab_censo_sectores
  for select to authenticated
  using (public.fab_puede_ver(proyecto_id));

-- Un usuario ve las membresías de los proyectos donde él mismo está. Ver quién
-- más entra al proyecto es parte de trabajar en él.
drop policy if exists fab_usuarios_proyecto_ver on public.fab_usuarios_proyecto;
create policy fab_usuarios_proyecto_ver on public.fab_usuarios_proyecto
  for select to authenticated
  using (usuario_id = auth.uid() or public.fab_puede_ver(proyecto_id));

-- El catálogo es visible para cualquiera que esté en algún proyecto: es lo que
-- se puede instalar, no lo que se instaló.
drop policy if exists fab_pools_ver on public.fab_pools;
create policy fab_pools_ver on public.fab_pools
  for select to authenticated
  using (exists (select 1 from public.fab_usuarios_proyecto
                 where usuario_id = auth.uid()));

drop policy if exists fab_pool_versiones_ver on public.fab_pool_versiones;
create policy fab_pool_versiones_ver on public.fab_pool_versiones
  for select to authenticated
  using (exists (select 1 from public.fab_usuarios_proyecto
                 where usuario_id = auth.uid()));

drop policy if exists fab_instalaciones_ver on public.fab_instalaciones;
create policy fab_instalaciones_ver on public.fab_instalaciones
  for select to authenticated
  using (public.fab_puede_ver(proyecto_id));

drop policy if exists fab_espejo_ver on public.fab_declaraciones_espejo;
create policy fab_espejo_ver on public.fab_declaraciones_espejo
  for select to authenticated
  using (exists (
    select 1 from public.fab_instalaciones i
    where i.id = instalacion_id and public.fab_puede_ver(i.proyecto_id)
  ));

-- ESCRITURA: ninguna política. Declarar e instalar pasa por el servidor, que
-- valida el manifiesto antes de guardarlo. Una política de insert acá sería un
-- segundo camino a la misma tabla, sin esa validación.
