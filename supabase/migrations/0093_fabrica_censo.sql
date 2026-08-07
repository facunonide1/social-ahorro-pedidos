-- ============================================================================
-- 0093 · FÁBRICA NORA · proyectos y censo (v0.58)
-- ============================================================================
-- PRIMERA MIGRACIÓN DE UN PRODUCTO NUEVO.
--
-- La fábrica compone software de gestión a partir de piezas estandarizadas
-- (pools) declaradas como DATO. Cada negocio es un proyecto; Social Ahorro es
-- el proyecto 1.
--
-- FRONTERA — esta migración y todas las de la fábrica:
--   · SOLO crean tablas fab_*
--   · NUNCA alteran, renombran ni agregan columnas a una tabla existente
--   · La fábrica LEE el sistema existente; jamás le escribe
-- Si alguna vez una migración fab_* necesita un ALTER sobre una tabla que no
-- es suya, la frontera se rompió y hay que parar.
--
-- Vocabulario NEUTRO a propósito: proyecto, pool, entidad, acción, molde. Nada
-- de vocabulario de farmacia adentro de fab_*.
--
-- fab_proyectos entra acá (y no en la migración del esquema de pools) porque el
-- censo describe los sectores DE UN PROYECTO y necesita a qué colgarse.
-- ============================================================================

create table if not exists public.fab_proyectos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text not null unique,
  rubro         text,
  descripcion   text,
  estado        text not null default 'alta'
                  check (estado in ('alta','armando','operando','pausado')),
  fecha_alta    date not null default current_date,
  /** tema, moneda, zona horaria: lo que cambia entre negocios sin cambiar código. */
  configuracion jsonb not null default '{}'::jsonb,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

comment on table public.fab_proyectos is
  'Un negocio con su software compuesto. Social Ahorro es el proyecto 1.';

-- El proyecto 1 lleva el MISMO uuid que ya se usa como tenant en las tablas
-- doc_*. Que coincidan es lo que permite, más adelante, leer el motor de
-- documentos desde la fábrica sin una tabla de equivalencias.
insert into public.fab_proyectos (id, nombre, slug, rubro, descripcion, estado, configuracion, notas)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Social Ahorro',
  'social-ahorro',
  'retail_farmacia',
  'Cadena de 4 sucursales en Ituzaingó: farmacia con controlados, perfumería y supermercado. Orquesta a SIFACO sin reemplazarlo.',
  'operando',
  jsonb_build_object('moneda','ARS','zona_horaria','America/Argentina/Buenos_Aires','tema','nora'),
  'Proyecto fundacional. Su sistema (NORA HQ) es de donde sale el catálogo de pools.'
where not exists (select 1 from public.fab_proyectos where slug = 'social-ahorro');

-- ============================================================================
-- Censo de sectores
-- ============================================================================
-- No se puede declarar un catálogo que no se sabe cuál es. Esta tabla es la
-- foto de lo que existe hoy, para que la fábrica pueda consultarla sin volver
-- a recorrer el repo.
--
-- Es OBSERVACIÓN: describir, no corregir.

create table if not exists public.fab_censo_sectores (
  id                uuid primary key default gen_random_uuid(),
  proyecto_id       uuid not null references public.fab_proyectos(id) on delete cascade,

  clave             text not null,
  nombre            text not null,
  ruta_base         text,

  /** completo | a_medias | placeholder */
  completitud       text not null default 'completo'
                      check (completitud in ('completo','a_medias','placeholder')),
  /** nucleo | generico | vertical | a_medida | incompleto */
  clasificacion     text not null
                      check (clasificacion in ('nucleo','generico','vertical','a_medida','incompleto')),

  /** Tablas que el sector posee (escribe). */
  entidades_propias jsonb not null default '[]'::jsonb,
  /** Tablas que solo lee. La distinción define después qué se puede desinstalar. */
  entidades_leidas  jsonb not null default '[]'::jsonb,

  pantallas         int not null default 0,
  /** {molde: cantidad}. Los moldes nuevos salen de acá. */
  moldes            jsonb not null default '{}'::jsonb,
  acciones_chat     int not null default 0,
  permisos          jsonb not null default '[]'::jsonb,
  depende_de        jsonb not null default '[]'::jsonb,
  tiene_datos       boolean not null default false,
  notas             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,

  unique (proyecto_id, clave)
);

create index if not exists fab_censo_proyecto_idx on public.fab_censo_sectores(proyecto_id);
create index if not exists fab_censo_clasif_idx on public.fab_censo_sectores(proyecto_id, clasificacion);

comment on table public.fab_censo_sectores is
  'Foto de los sectores existentes de un proyecto. Observación, no configuración: describe lo que hay, no lo que debería haber.';

-- ============================================================================
-- RLS
-- ============================================================================
-- Se filtra SIEMPRE por proyecto, aunque hoy haya uno solo: ésta es la política
-- que mañana separa un cliente de otro.
--
-- La tabla de membresías llega en la migración siguiente, así que por ahora el
-- acceso queda cerrado a todo el mundo salvo service_role. Cerrado de más es
-- recuperable; abierto de más es una fuga.

alter table public.fab_proyectos      enable row level security;
alter table public.fab_censo_sectores enable row level security;

revoke all on public.fab_proyectos      from anon, authenticated;
revoke all on public.fab_censo_sectores from anon, authenticated;
