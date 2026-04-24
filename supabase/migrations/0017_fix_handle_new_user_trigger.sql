-- =====================================================================
-- 0017 · Fix retrocompatible del trigger handle_new_user
--
-- PROBLEMA
-- --------
-- La cuponera tiene un trigger `on_auth_user_created` → función
-- `public.handle_new_user` que en algún momento falla cuando un admin
-- API crea un usuario sin DNI en `raw_user_meta_data`. Eso bloquea la
-- creación de usuarios de Admin Hub (y cualquier otro signup no
-- estándar).
--
-- SOLUCIÓN
-- --------
-- Esta migración NO reescribe la lógica original a mano (no queremos
-- romper la cuponera). En lugar de eso:
--
--   1. Crea una tabla `auth_trigger_errors` para guardar errores del
--      trigger sin bloquear el insert en auth.users.
--   2. Toma el body actual de `handle_new_user` (si existe), y lo
--      envuelve con:
--        - guard al inicio: si `raw_user_meta_data->>'is_admin_hub'`
--          es true, salta toda la lógica (solo `return new`).
--        - exception handler al final: si el body original tira
--          excepción, la captura, la guarda en `auth_trigger_errors`
--          y devuelve `new` para que el auth user se cree igual.
--      Esto respeta 100% lo que hacía la función para signups de
--      cuponera con metadata correcto y le da resiliencia para el
--      resto.
--   3. Si no existe la función (proyecto sin la cuponera), crea una
--      versión mínima que solo chequea el flag y retorna.
--
-- SEGURIDAD
-- ---------
-- Idempotente: si ya la envolvió una vez, detecta la marca y no la
-- vuelve a envolver. (Usa un comentario en la función como marca.)
-- =====================================================================

-- 1) Tabla de errores del trigger
create table if not exists public.auth_trigger_errors (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  error_message   text,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  resolved        boolean not null default false
);

create index if not exists auth_trigger_errors_unresolved_idx
  on public.auth_trigger_errors(created_at desc)
  where resolved = false;

-- RLS mínimo: solo super_admin/gerente/auditor pueden leer; nadie
-- escribe desde la app (lo escribe el trigger con security definer).
alter table public.auth_trigger_errors enable row level security;

drop policy if exists auth_trigger_errors_read on public.auth_trigger_errors;
create policy auth_trigger_errors_read on public.auth_trigger_errors
  for select using (public.current_admin_role() in ('super_admin', 'gerente', 'auditor'));

drop policy if exists auth_trigger_errors_update on public.auth_trigger_errors;
create policy auth_trigger_errors_update on public.auth_trigger_errors
  for update using (public.current_admin_role() in ('super_admin', 'gerente'))
             with check (public.current_admin_role() in ('super_admin', 'gerente'));

-- 2) Reemplazo auto-adaptativo de handle_new_user
do $wrap$
declare
  v_exists boolean;
  v_already_wrapped boolean;
  v_body text;
  v_new_def text;
  MARKER constant text := 'SA_WRAPPED_V1';
begin
  -- ¿Existe la función?
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) into v_exists;

  -- ¿Ya está envuelta?
  if v_exists then
    select (pg_get_functiondef(p.oid) like '%' || MARKER || '%')
      into v_already_wrapped
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_new_user';
  else
    v_already_wrapped := false;
  end if;

  if v_exists and v_already_wrapped then
    raise notice 'handle_new_user ya está envuelta (marcador %). No se vuelve a tocar.', MARKER;
    return;
  end if;

  if not v_exists then
    -- Crear una versión mínima que solo respete el flag de admin hub.
    -- (Si la cuponera agrega su propia función después, esta migración
    -- no hay que re-correrla; sino, la próxima instalación de
    -- cuponera debería correr 0017 después.)
    execute $body$
      create or replace function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      -- SA_WRAPPED_V1 · auto-mínimo sin función previa
      begin
        -- Flag de Admin Hub: no creamos perfil de cuponera
        if coalesce((new.raw_user_meta_data->>'is_admin_hub')::boolean, false) then
          return new;
        end if;
        return new;
      end;
      $fn$;
    $body$;

    -- Asegurar que el trigger existe
    if not exists (
      select 1 from pg_trigger
      where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created'
    ) then
      execute $trig$
        create trigger on_auth_user_created
        after insert on auth.users
        for each row execute function public.handle_new_user();
      $trig$;
    end if;

    raise notice 'Se creó public.handle_new_user mínima (sin función previa).';
    return;
  end if;

  -- Si existe y no está envuelta: extraer body original y envolver.
  -- pg_get_functiondef devuelve todo el CREATE; necesitamos extraer
  -- solo el cuerpo entre AS $...$ y $...$. Usamos prosrc que es
  -- directamente el código entre los dollar quotes.
  select p.prosrc into v_body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user';

  -- Construimos la nueva definición con wrapper. Usamos un dollar
  -- quote distinto ($fn_wrap$) para no colisionar con el código
  -- original que puede usar $$ o $body$. El body original ya es un
  -- bloque plpgsql completo (`[declare ...] begin ... end`), así que
  -- se inserta tal cual como sub-bloque anidado; el handler de
  -- excepción al nivel externo captura cualquier error.
  v_new_def := format(
    $fmt$
    create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn_wrap$
    -- SA_WRAPPED_V1 · wrapper que preserva la lógica original
    --                 y la protege con guard + exception handler.
    begin
      -- Guard: si el user viene marcado como admin_hub, skippear
      -- toda la lógica de cuponera.
      if coalesce((new.raw_user_meta_data->>'is_admin_hub')::boolean, false) then
        return new;
      end if;

      -- >>> body original insertado como sub-bloque <<<
      %s
      -- <<< fin body original

      return new;
    exception when others then
      -- Cualquier error dentro del body original queda registrado,
      -- pero no bloquea el insert en auth.users.
      begin
        insert into public.auth_trigger_errors (user_id, error_message, metadata)
        values (new.id, SQLERRM, new.raw_user_meta_data);
      exception when others then
        null; -- si hasta esto falla, seguimos
      end;
      return new;
    end;
    $fn_wrap$;
    $fmt$,
    v_body
  );

  execute v_new_def;

  raise notice 'handle_new_user envuelta con marcador %. Original preservada adentro.', MARKER;
end
$wrap$;
