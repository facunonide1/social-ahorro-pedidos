-- =====================================================================
-- Fase 1 · Pedidos manuales (creados por WhatsApp, teléfono, etc.)
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Enum de origen del pedido
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_origin') then
    create type order_origin as enum ('woo', 'whatsapp', 'telefono', 'instagram', 'otro');
  end if;
end$$;

-- 2) Columna origin en orders
alter table public.orders
  add column if not exists origin order_origin not null default 'woo';

-- 3) woo_order_id pasa a ser nullable (solo lo tienen los Woo)
alter table public.orders
  alter column woo_order_id drop not null;

-- 4) Numeración propia para los manuales
create sequence if not exists public.manual_order_seq start 1;

alter table public.orders
  add column if not exists manual_order_number int unique;

-- 5) Integridad: cada pedido tiene UN número (woo_order_id XOR manual_order_number)
alter table public.orders
  drop constraint if exists orders_origin_number_ck;
alter table public.orders
  add constraint orders_origin_number_ck check (
    (origin = 'woo'     and woo_order_id is not null       and manual_order_number is null)
    or
    (origin <> 'woo'   and woo_order_id is null           and manual_order_number is not null)
  );

-- 6) RPC para crear un pedido manual. security invoker para respetar
--    current_pedidos_role(); solo admin/operador pueden crear.
create or replace function public.create_manual_order(
  p_origin           order_origin,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_email   text,
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
    customer_name, customer_phone, customer_email,
    shipping_address, billing_address,
    total, payment_method, items, notes
  ) values (
    p_origin, v_number, 'nuevo',
    nullif(btrim(p_customer_name),  ''),
    nullif(btrim(p_customer_phone), ''),
    nullif(btrim(p_customer_email), ''),
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
  order_origin, text, text, text, jsonb, jsonb, numeric, text, text
) to authenticated;
