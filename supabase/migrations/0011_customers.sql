-- =====================================================================
-- Tabla customers: entidad cliente como first-class con historial
-- y notas propias, independiente del pedido.
-- =====================================================================

-- 1) Tabla
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  phone         text,
  email         text,
  dni           text,
  address       jsonb,
  tags          text[] not null default '{}',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_email_idx on public.customers (email);
create index if not exists customers_dni_idx   on public.customers (dni);
create index if not exists customers_name_idx  on public.customers ((lower(name)));

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- 2) RLS
alter table public.customers enable row level security;

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (public.current_pedidos_role() in ('admin','operador','repartidor'));

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all using (public.current_pedidos_role() in ('admin','operador'))
           with check (public.current_pedidos_role() in ('admin','operador'));

-- 3) FK en orders
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists orders_customer_id_idx on public.orders (customer_id);

-- 4) Backfill: por cada order existente, matchea o crea el customer.
--    Prioridad: DNI > teléfono > email > (si no hay nada, customer nuevo).
do $$
declare
  o record;
  v_customer_id uuid;
  v_phone text;
  v_email text;
  v_dni   text;
begin
  for o in
    select * from public.orders where customer_id is null order by created_at
  loop
    v_customer_id := null;
    v_dni   := nullif(btrim(o.customer_dni),   '');
    v_phone := nullif(btrim(o.customer_phone), '');
    v_email := lower(nullif(btrim(o.customer_email), ''));

    if v_dni is not null then
      select id into v_customer_id from public.customers where dni = v_dni limit 1;
    end if;
    if v_customer_id is null and v_phone is not null then
      select id into v_customer_id from public.customers where phone = v_phone limit 1;
    end if;
    if v_customer_id is null and v_email is not null then
      select id into v_customer_id from public.customers where email = v_email limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (name, phone, email, dni, address)
      values (
        nullif(btrim(o.customer_name), ''),
        v_phone, v_email, v_dni,
        coalesce(o.shipping_address, o.billing_address)
      )
      returning id into v_customer_id;
    else
      -- Completamos campos que falten en el customer con los de este order
      update public.customers c
      set
        name    = coalesce(c.name,    nullif(btrim(o.customer_name), '')),
        phone   = coalesce(c.phone,   v_phone),
        email   = coalesce(c.email,   v_email),
        dni     = coalesce(c.dni,     v_dni),
        address = coalesce(c.address, o.shipping_address, o.billing_address)
      where c.id = v_customer_id;
    end if;

    update public.orders set customer_id = v_customer_id where id = o.id;
  end loop;
end $$;

-- 5) Recrear RPC create_manual_order:
--    ahora matchea/crea customer y setea customer_id en la fila.
drop function if exists public.create_manual_order(
  order_origin, tipo_envio, text, text, text, text, jsonb, uuid, jsonb, numeric, text, text
);

create or replace function public.create_manual_order(
  p_origin           order_origin,
  p_tipo_envio       tipo_envio,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_customer_dni     text,
  p_shipping_address jsonb,
  p_zona_id          uuid,
  p_items            jsonb,
  p_total            numeric,
  p_payment_method   text,
  p_notes            text
) returns public.orders
language plpgsql security invoker as $$
declare
  v_role    pedidos_user_role := public.current_pedidos_role();
  v_number  int;
  v_hour    int := extract(hour from (now() at time zone 'America/Argentina/Buenos_Aires'))::int;
  v_open    smallint;
  v_close   smallint;
  v_fuera   boolean;
  v_result  public.orders;
  v_customer_id uuid;
  v_phone   text := nullif(btrim(p_customer_phone), '');
  v_email   text := lower(nullif(btrim(p_customer_email), ''));
  v_dni     text := nullif(btrim(p_customer_dni),   '');
  v_name    text := nullif(btrim(p_customer_name),  '');
begin
  if v_role is null or v_role not in ('admin','operador') then
    raise exception 'no_autorizado';
  end if;
  if p_origin = 'woo' then
    raise exception 'origin_woo_no_permitido_para_manual';
  end if;

  select hora_apertura, hora_cierre into v_open, v_close
  from public.app_settings where id = 1;
  v_open  := coalesce(v_open, 8);
  v_close := coalesce(v_close, 20);
  v_fuera := v_hour < v_open or v_hour >= v_close;

  -- Match customer por dni, phone o email
  if v_dni is not null then
    select id into v_customer_id from public.customers where dni = v_dni limit 1;
  end if;
  if v_customer_id is null and v_phone is not null then
    select id into v_customer_id from public.customers where phone = v_phone limit 1;
  end if;
  if v_customer_id is null and v_email is not null then
    select id into v_customer_id from public.customers where email = v_email limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, email, dni, address)
    values (v_name, v_phone, v_email, v_dni, p_shipping_address)
    returning id into v_customer_id;
  else
    update public.customers c
    set
      name    = coalesce(c.name,    v_name),
      phone   = coalesce(c.phone,   v_phone),
      email   = coalesce(c.email,   v_email),
      dni     = coalesce(c.dni,     v_dni),
      address = coalesce(c.address, p_shipping_address)
    where c.id = v_customer_id;
  end if;

  v_number := nextval('public.manual_order_seq');

  insert into public.orders (
    origin, tipo_envio, fuera_de_horario,
    manual_order_number, status,
    customer_id, customer_name, customer_phone, customer_email, customer_dni,
    shipping_address, billing_address, zona_id,
    total, payment_method, items, notes
  ) values (
    p_origin, coalesce(p_tipo_envio,'programado'), v_fuera,
    v_number, 'nuevo',
    v_customer_id, v_name, v_phone, v_email, v_dni,
    p_shipping_address, p_shipping_address, p_zona_id,
    coalesce(p_total,0), nullif(btrim(p_payment_method),''),
    coalesce(p_items,'[]'::jsonb), nullif(btrim(p_notes),'')
  ) returning * into v_result;

  return v_result;
end $$;

grant execute on function public.create_manual_order(
  order_origin, tipo_envio, text, text, text, text, jsonb, uuid, jsonb, numeric, text, text
) to authenticated;
