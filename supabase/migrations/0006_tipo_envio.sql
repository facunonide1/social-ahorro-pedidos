-- =====================================================================
-- Fase A2 · Tipo de envío + fuera de horario
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Enum de tipo de envío
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_envio') then
    create type tipo_envio as enum ('express', 'programado', 'retiro');
  end if;
end$$;

-- 2) Columnas en orders
alter table public.orders
  add column if not exists tipo_envio       tipo_envio not null default 'programado',
  add column if not exists fuera_de_horario boolean     not null default false;

create index if not exists orders_tipo_envio_idx on public.orders(tipo_envio);

-- 3) RPC create_manual_order con p_tipo_envio
drop function if exists public.create_manual_order(
  order_origin, text, text, text, text, jsonb, uuid, jsonb, numeric, text, text
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
  v_fuera   boolean := v_hour < 8 or v_hour >= 20;
  v_result  public.orders;
begin
  if v_role is null or v_role not in ('admin','operador') then
    raise exception 'no_autorizado';
  end if;
  if p_origin = 'woo' then
    raise exception 'origin_woo_no_permitido_para_manual';
  end if;

  v_number := nextval('public.manual_order_seq');

  insert into public.orders (
    origin, tipo_envio, fuera_de_horario,
    manual_order_number, status,
    customer_name, customer_phone, customer_email, customer_dni,
    shipping_address, billing_address, zona_id,
    total, payment_method, items, notes
  ) values (
    p_origin, coalesce(p_tipo_envio, 'programado'), v_fuera,
    v_number, 'nuevo',
    nullif(btrim(p_customer_name),''), nullif(btrim(p_customer_phone),''),
    nullif(btrim(p_customer_email),''), nullif(btrim(p_customer_dni),''),
    p_shipping_address, p_shipping_address, p_zona_id,
    coalesce(p_total,0), nullif(btrim(p_payment_method),''),
    coalesce(p_items,'[]'::jsonb), nullif(btrim(p_notes),'')
  ) returning * into v_result;

  return v_result;
end $$;

grant execute on function public.create_manual_order(
  order_origin, tipo_envio, text, text, text, text, jsonb, uuid, jsonb, numeric, text, text
) to authenticated;
