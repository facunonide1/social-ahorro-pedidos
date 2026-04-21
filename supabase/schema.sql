-- =====================================================================
-- social-ahorro-pedidos · esquema inicial
-- Ejecutar en el SQL Editor de Supabase (proyecto hrjxjbirajbsurobqdca)
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUM de estados del pedido
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'nuevo',
      'confirmado',
      'en_preparacion',
      'listo',
      'en_camino',
      'entregado',
      'cancelado'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pedidos_user_role') then
    create type pedidos_user_role as enum ('admin', 'operador', 'repartidor');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- USUARIOS de la app de pedidos
-- Se vincula 1:1 con auth.users por id. El email y el rol se
-- mantienen aca para no depender del JWT ni de metadata.
-- ---------------------------------------------------------------------
create table if not exists public.users_pedidos (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text,
  role        pedidos_user_role not null default 'operador',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists users_pedidos_role_idx on public.users_pedidos(role);

-- ---------------------------------------------------------------------
-- ORDERS
-- items = array de { product_id, name, qty, price, sku, meta }
-- shipping_address / billing_address = objeto tal cual lo devuelve Woo
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  woo_order_id      bigint not null unique,
  status            order_status not null default 'nuevo',
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  shipping_address  jsonb,
  billing_address   jsonb,
  total             numeric(12,2) not null default 0,
  payment_method    text,
  items             jsonb not null default '[]'::jsonb,
  notes             text,
  assigned_to       uuid references public.users_pedidos(id) on delete set null,
  woo_created_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_status_idx        on public.orders(status);
create index if not exists orders_assigned_to_idx   on public.orders(assigned_to);
create index if not exists orders_created_at_idx    on public.orders(created_at desc);
create index if not exists orders_woo_created_idx   on public.orders(woo_created_at desc);
create index if not exists orders_customer_name_idx on public.orders using gin (to_tsvector('spanish', coalesce(customer_name,'')));
create index if not exists orders_customer_phone_idx on public.orders(customer_phone);

-- ---------------------------------------------------------------------
-- HISTORIAL de cambios de estado
-- ---------------------------------------------------------------------
create table if not exists public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      order_status not null,
  changed_by  uuid references public.users_pedidos(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_status_history_order_idx on public.order_status_history(order_id, created_at desc);

-- ---------------------------------------------------------------------
-- Trigger: updated_at automatico en orders / users_pedidos
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.tg_set_updated_at();

drop trigger if exists users_pedidos_set_updated_at on public.users_pedidos;
create trigger users_pedidos_set_updated_at
  before update on public.users_pedidos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: cuando cambia orders.status, insertar fila en historial.
-- Lee una GUC opcional app.status_note para que el cambio de estado
-- viaje con su nota en la misma transaccion (seteada por la RPC).
-- ---------------------------------------------------------------------
create or replace function public.tg_log_order_status()
returns trigger language plpgsql as $$
declare
  v_note text := nullif(current_setting('app.status_note', true), '');
begin
  if (tg_op = 'INSERT') then
    insert into public.order_status_history(order_id, status, changed_by, note)
    values (new.id, new.status, auth.uid(), v_note);
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.order_status_history(order_id, status, changed_by, note)
    values (new.id, new.status, auth.uid(), v_note);
  end if;
  -- limpio la GUC para que no contamine la siguiente operacion
  perform set_config('app.status_note', '', true);
  return new;
end $$;

drop trigger if exists orders_log_status on public.orders;
create trigger orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.tg_log_order_status();

-- ---------------------------------------------------------------------
-- Helpers de autorizacion
-- ---------------------------------------------------------------------
create or replace function public.current_pedidos_role()
returns pedidos_user_role language sql stable as $$
  select role from public.users_pedidos where id = auth.uid() and active = true;
$$;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.users_pedidos        enable row level security;
alter table public.orders               enable row level security;
alter table public.order_status_history enable row level security;

-- users_pedidos ---------------------------------------------------------
drop policy if exists users_pedidos_self_read on public.users_pedidos;
create policy users_pedidos_self_read on public.users_pedidos
  for select using (
    id = auth.uid()
    or public.current_pedidos_role() in ('admin','operador')
  );

drop policy if exists users_pedidos_admin_write on public.users_pedidos;
create policy users_pedidos_admin_write on public.users_pedidos
  for all using (public.current_pedidos_role() = 'admin')
           with check (public.current_pedidos_role() = 'admin');

-- orders ----------------------------------------------------------------
-- admin/operador: todo. repartidor: solo sus asignados.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders
  for select using (
    public.current_pedidos_role() in ('admin','operador')
    or (public.current_pedidos_role() = 'repartidor' and assigned_to = auth.uid())
  );

drop policy if exists orders_write_admin_operador on public.orders;
create policy orders_write_admin_operador on public.orders
  for all using (public.current_pedidos_role() in ('admin','operador'))
           with check (public.current_pedidos_role() in ('admin','operador'));

-- el repartidor solo puede actualizar estado de sus propios pedidos
-- (y solo pasar a 'en_camino' o 'entregado' desde sus estados previos)
drop policy if exists orders_update_repartidor on public.orders;
create policy orders_update_repartidor on public.orders
  for update
  using (
    public.current_pedidos_role() = 'repartidor'
    and assigned_to = auth.uid()
  )
  with check (
    public.current_pedidos_role() = 'repartidor'
    and assigned_to = auth.uid()
    and status in ('en_camino','entregado')
  );

-- order_status_history --------------------------------------------------
drop policy if exists history_read on public.order_status_history;
create policy history_read on public.order_status_history
  for select using (
    public.current_pedidos_role() in ('admin','operador')
    or (
      public.current_pedidos_role() = 'repartidor'
      and exists (
        select 1 from public.orders o
        where o.id = order_status_history.order_id
          and o.assigned_to = auth.uid()
      )
    )
  );

-- el historial se escribe principalmente por trigger / RPC, pero dejamos
-- insert controlado: admin/operador siempre, repartidor solo en sus pedidos.
drop policy if exists history_insert on public.order_status_history;
create policy history_insert on public.order_status_history
  for insert with check (
    public.current_pedidos_role() in ('admin','operador')
    or (
      public.current_pedidos_role() = 'repartidor'
      and exists (
        select 1 from public.orders o
        where o.id = order_id and o.assigned_to = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- RPC: set_order_status(order_id, nuevo_status, nota_opcional)
--   - admin/operador pueden pasar a cualquier estado
--   - repartidor solo a en_camino/entregado y solo en sus pedidos
--   - la nota queda en order_status_history.note (via trigger)
-- ---------------------------------------------------------------------
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   order_status,
  p_note     text default null
) returns public.orders
language plpgsql
security invoker
as $$
declare
  v_role     pedidos_user_role := public.current_pedidos_role();
  v_assigned uuid;
  v_result   public.orders;
begin
  if v_role is null then
    raise exception 'no_autorizado';
  end if;

  select assigned_to into v_assigned from public.orders where id = p_order_id;
  if not found then
    raise exception 'pedido_no_encontrado';
  end if;

  if v_role = 'repartidor' then
    if v_assigned is distinct from auth.uid() then
      raise exception 'no_asignado_a_vos';
    end if;
    if p_status not in ('en_camino','entregado') then
      raise exception 'estado_no_permitido_para_repartidor';
    end if;
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.orders
     set status = p_status
   where id = p_order_id
   returning * into v_result;

  return v_result;
end $$;

grant execute on function public.set_order_status(uuid, order_status, text) to authenticated;

-- ---------------------------------------------------------------------
-- RPC: add_order_note(order_id, nota)
--   Inserta una observacion en el historial SIN cambiar el estado.
--   El status que queda en la fila es el status actual del pedido.
-- ---------------------------------------------------------------------
create or replace function public.add_order_note(
  p_order_id uuid,
  p_note     text
) returns public.order_status_history
language plpgsql
security invoker
as $$
declare
  v_role     pedidos_user_role := public.current_pedidos_role();
  v_assigned uuid;
  v_current  order_status;
  v_result   public.order_status_history;
begin
  if v_role is null then
    raise exception 'no_autorizado';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'nota_vacia';
  end if;

  select assigned_to, status into v_assigned, v_current
  from public.orders where id = p_order_id;

  if not found then
    raise exception 'pedido_no_encontrado';
  end if;

  if v_role = 'repartidor' and v_assigned is distinct from auth.uid() then
    raise exception 'no_asignado_a_vos';
  end if;

  insert into public.order_status_history(order_id, status, changed_by, note)
  values (p_order_id, v_current, auth.uid(), p_note)
  returning * into v_result;

  return v_result;
end $$;

grant execute on function public.add_order_note(uuid, text) to authenticated;
