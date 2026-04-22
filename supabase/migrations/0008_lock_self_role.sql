-- =====================================================================
-- Bloqueo de cambios sobre la propia fila en users_pedidos
-- Nadie puede cambiar su propio role ni desactivarse a sí mismo.
-- Si hace falta corregir (ej. un admin se degradó por error), un
-- superadmin tiene que hacer el UPDATE directo en el SQL Editor
-- (auth.uid() es null ahí, así que el trigger lo permite).
-- =====================================================================

create or replace function public.tg_lock_self_role_and_active()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and auth.uid() = new.id then
    if new.role is distinct from old.role then
      raise exception 'no_podes_cambiar_tu_propio_rol';
    end if;
    if new.active is distinct from old.active then
      raise exception 'no_podes_cambiar_tu_propio_estado';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_pedidos_lock_self on public.users_pedidos;
create trigger users_pedidos_lock_self
  before update on public.users_pedidos
  for each row execute function public.tg_lock_self_role_and_active();
