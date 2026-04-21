-- =====================================================================
-- DNI del cliente en orders + búsqueda por DNI
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Columna customer_dni
alter table public.orders
  add column if not exists customer_dni text;

create index if not exists orders_customer_dni_idx
  on public.orders (customer_dni);

-- 2) RPC create_manual_order recreada con el parámetro p_customer_dni
drop function if exists public.create_manual_order(
  order_origin, text, text, text, jsonb, jsonb, numeric, text, text
);

create or replace function public.create_manual_order(
  p_origin           order_origin,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
  p_customer_dni     text,
  p_shipping_address jsonb,
  p_items            jsonb,
  p_total            numeric,
  p_payment_method   text,
  p_notes            text
) returns public.orders
language plpgsql
security invoker
as $$
declare
  v_role   pedidos_user_role := public.current_pedidos_role();
  v_number int;
  v_result public.orders;
begin
  if v_role is null or v_role not in ('admin','operador') then
    raise exception 'no_autorizado';
  end if;
  if p_origin = 'woo' then
    raise exception 'origin_woo_no_permitido_para_manual';
  end if;

  v_number := nextval('public.manual_order_seq');

  insert into public.orders (
    origin, manual_order_number, status,
    customer_name, customer_phone, customer_email, customer_dni,
    shipping_address, billing_address,
    total, payment_method, items, notes
  ) values (
    p_origin, v_number, 'nuevo',
    nullif(btrim(p_customer_name),  ''),
    nullif(btrim(p_customer_phone), ''),
    nullif(btrim(p_customer_email), ''),
    nullif(btrim(p_customer_dni),   ''),
    p_shipping_address, p_shipping_address,
    coalesce(p_total, 0),
    nullif(btrim(p_payment_method), ''),
    coalesce(p_items, '[]'::jsonb),
    nullif(btrim(p_notes), '')
  )
  returning * into v_result;

  return v_result;
end $$;

grant execute on function public.create_manual_order(
  order_origin, text, text, text, text, jsonb, jsonb, numeric, text, text
) to authenticated;
