-- ============================================================================
-- 0097 · FÁBRICA NORA · el flag del lector (v0.62)
-- ============================================================================
-- Hasta acá la declaración DESCRIBÍA. Desde acá puede GOBERNAR: un sector
-- puede leer su definición de la base en vez de tenerla escrita en el código.
--
-- Todo entra detrás de un interruptor APAGADO, y por pool. Un flag global
-- sería todo o nada, y "todo" no es una opción con seis sectores sin declarar.
--
-- Los tres estados, y por qué son tres:
--   apagado   el sector lee del código. Es exactamente lo de hoy.
--   sombra    lee del código, pero la fábrica calcula en paralelo qué habría
--             devuelto y registra las diferencias. Sin afectar nada.
--   prendido  lee de la declaración.
--
-- `sombra` es lo que hace que esto sea seguro. Se puede dejar corriendo días
-- en producción, con tráfico real, y recién prender cuando quedó demostrado
-- que la declaración habría devuelto lo mismo.
--
-- FRONTERA: sólo tablas fab_*. La fábrica sigue sin escribir una fila en
-- ninguna tabla de Social Ahorro.
-- ============================================================================

alter table public.fab_instalaciones
  add column if not exists lector text not null default 'apagado'
    check (lector in ('apagado','sombra','prendido'));

comment on column public.fab_instalaciones.lector is
  'apagado = el sector lee del código · sombra = lee del código y se comparan las diferencias · prendido = lee de la declaración. Arranca siempre apagado.';

-- ============================================================================
-- Auditoría de los cambios de estado
-- ============================================================================
-- Prender el lector cambia el comportamiento del sistema. Quién lo prendió y
-- cuándo tiene que quedar registrado con la misma seriedad que un movimiento de
-- caja: cuando algo se rompe, la primera pregunta es qué cambió.

create table if not exists public.fab_lector_cambios (
  id             uuid primary key default gen_random_uuid(),
  instalacion_id uuid references public.fab_instalaciones(id) on delete cascade,
  /** null cuando el cambio fue masivo (el interruptor de pánico). */
  proyecto_id    uuid not null references public.fab_proyectos(id) on delete cascade,
  pool_clave     text,

  desde          text not null,
  hasta          text not null,
  /** true = lo disparó el interruptor de pánico, no un cambio pool por pool. */
  panico         boolean not null default false,
  motivo         text,

  cambiado_por   uuid references auth.users(id) on delete set null,
  cambiado_at    timestamptz not null default now()
);

create index if not exists fab_lector_cambios_proyecto_idx
  on public.fab_lector_cambios(proyecto_id, cambiado_at desc);

comment on table public.fab_lector_cambios is
  'Quién prendió o apagó el lector de un pool, cuándo, y de qué estado a cuál. Cuando algo se rompe, la primera pregunta es qué cambió.';

-- ============================================================================
-- Eventos del lector: fallbacks y diferencias de sombra
-- ============================================================================
-- Dos cosas distintas que conviene tener juntas porque se miran juntas:
--
--   fallback    el flag estaba prendido y el sector igual usó el código.
--               Si este número no es cero, hay algo mal.
--   diferencia  en sombra, la declaración habría devuelto otra cosa que el
--               código.
--
-- Un fallback que nadie ve es un problema que nadie arregla.

create table if not exists public.fab_lector_eventos (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references public.fab_proyectos(id) on delete cascade,
  pool_clave     text not null,

  tipo           text not null check (tipo in ('fallback','diferencia')),
  /** Qué parte del manifiesto se estaba leyendo: 'pantallas', 'presentacion'… */
  aspecto        text not null,
  /** Para un fallback: por qué se cayó al código. */
  motivo         text,
  /** Para una diferencia: qué decía cada lado. */
  detalle        jsonb not null default '{}'::jsonb,

  ocurrido_at    timestamptz not null default now()
);

create index if not exists fab_lector_eventos_busqueda_idx
  on public.fab_lector_eventos(proyecto_id, pool_clave, tipo, ocurrido_at desc);

comment on table public.fab_lector_eventos is
  'Fallbacks (el flag estaba prendido y se usó el código igual) y diferencias detectadas en modo sombra.';

-- ============================================================================
-- RLS
-- ============================================================================
-- Lectura para quien esté en el proyecto. Escritura sólo por el servidor: los
-- eventos los escribe el lector con service_role y los cambios de estado pasan
-- por una acción del portal que verifica el rol antes de tocar nada.

alter table public.fab_lector_cambios  enable row level security;
alter table public.fab_lector_eventos  enable row level security;

revoke all on public.fab_lector_cambios from anon;
revoke all on public.fab_lector_eventos from anon;

grant select on public.fab_lector_cambios, public.fab_lector_eventos to authenticated;

drop policy if exists fab_lector_cambios_ver on public.fab_lector_cambios;
create policy fab_lector_cambios_ver on public.fab_lector_cambios
  for select to authenticated using (public.fab_puede_ver(proyecto_id));

drop policy if exists fab_lector_eventos_ver on public.fab_lector_eventos;
create policy fab_lector_eventos_ver on public.fab_lector_eventos
  for select to authenticated using (public.fab_puede_ver(proyecto_id));

-- ============================================================================
-- El interruptor de pánico
-- ============================================================================
-- Un solo botón que devuelve TODOS los pools a apagado. Existe como función y
-- no como diez updates desde el portal porque el momento en que hace falta es
-- exactamente el momento en que no se puede depender de apagar diez
-- interruptores uno por uno.
--
-- Es idempotente: apagar lo que ya está apagado no registra nada.

create or replace function public.fab_lector_panico(
  p_proyecto uuid,
  p_usuario  uuid,
  p_motivo   text default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apagados int;
begin
  with afectadas as (
    select i.id, i.lector, p.clave
    from public.fab_instalaciones i
    join public.fab_pools p on p.id = i.pool_id
    where i.proyecto_id = p_proyecto and i.lector <> 'apagado'
  ), registro as (
    insert into public.fab_lector_cambios
      (instalacion_id, proyecto_id, pool_clave, desde, hasta, panico, motivo, cambiado_por)
    select a.id, p_proyecto, a.clave, a.lector, 'apagado', true,
           coalesce(p_motivo, 'Interruptor de pánico'), p_usuario
    from afectadas a
    returning 1
  )
  update public.fab_instalaciones
  set lector = 'apagado', updated_at = now()
  where id in (select id from afectadas);

  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke all on function public.fab_lector_panico(uuid, uuid, text) from public, anon, authenticated;

comment on function public.fab_lector_panico is
  'Devuelve todos los pools del proyecto a apagado y deja el registro. Sólo service_role: pasa por una acción del portal que verifica el rol.';
