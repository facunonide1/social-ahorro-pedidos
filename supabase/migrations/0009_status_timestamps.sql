-- =====================================================================
-- Timestamps explícitos de los hitos del pedido + backfill
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Columnas
alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists ready_at     timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists orders_confirmed_at_idx on public.orders(confirmed_at);
create index if not exists orders_ready_at_idx     on public.orders(ready_at);
create index if not exists orders_delivered_at_idx on public.orders(delivered_at);

-- 2) Trigger que completa los timestamps al cambiar el status
create or replace function public.tg_set_status_timestamps()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    if new.status = 'confirmado' and new.confirmed_at is null then
      new.confirmed_at := now();
    end if;
    if new.status = 'listo'      and new.ready_at     is null then
      new.ready_at := now();
    end if;
    if new.status = 'entregado'  and new.delivered_at is null then
      new.delivered_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_set_status_ts on public.orders;
create trigger orders_set_status_ts
  before update of status on public.orders
  for each row execute function public.tg_set_status_timestamps();

-- 3) Backfill desde order_status_history (toma la primera vez que el
--    pedido entró a cada estado).
update public.orders o
set confirmed_at = sub.ts
from (
  select order_id, min(created_at) as ts
  from public.order_status_history
  where status = 'confirmado'
  group by order_id
) sub
where o.id = sub.order_id and o.confirmed_at is null;

update public.orders o
set ready_at = sub.ts
from (
  select order_id, min(created_at) as ts
  from public.order_status_history
  where status = 'listo'
  group by order_id
) sub
where o.id = sub.order_id and o.ready_at is null;

update public.orders o
set delivered_at = sub.ts
from (
  select order_id, min(created_at) as ts
  from public.order_status_history
  where status = 'entregado'
  group by order_id
) sub
where o.id = sub.order_id and o.delivered_at is null;
