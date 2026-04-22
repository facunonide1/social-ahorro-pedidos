-- =====================================================================
-- Fase A1 · Zonas de reparto
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Tabla
create table if not exists public.zonas_reparto (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  barrios     text[] not null default '{}',
  color       text not null default '#FF6D6E',
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists zonas_reparto_activa_idx on public.zonas_reparto(activa);

drop trigger if exists zonas_reparto_set_updated_at on public.zonas_reparto;
create trigger zonas_reparto_set_updated_at
  before update on public.zonas_reparto
  for each row execute function public.tg_set_updated_at();

-- 2) FK en orders
alter table public.orders
  add column if not exists zona_id uuid references public.zonas_reparto(id) on delete set null;

create index if not exists orders_zona_id_idx on public.orders(zona_id);

-- 3) RLS
alter table public.zonas_reparto enable row level security;

drop policy if exists zonas_reparto_read on public.zonas_reparto;
create policy zonas_reparto_read on public.zonas_reparto
  for select using (
    public.current_pedidos_role() in ('admin','operador','repartidor')
  );

drop policy if exists zonas_reparto_admin_write on public.zonas_reparto;
create policy zonas_reparto_admin_write on public.zonas_reparto
  for all using (public.current_pedidos_role() = 'admin')
           with check (public.current_pedidos_role() = 'admin');

-- 4) Recrear RPC create_manual_order aceptando p_zona_id
drop function if exists public.create_manual_order(
  order_origin, text, text, text, text, jsonb, jsonb, numeric, text, text
);

create or replace function public.create_manual_order(
  p_origin           order_origin,
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
    shipping_address, billing_address, zona_id,
    total, payment_method, items, notes
  ) values (
    p_origin, v_number, 'nuevo',
    nullif(btrim(p_customer_name),''), nullif(btrim(p_customer_phone),''),
    nullif(btrim(p_customer_email),''), nullif(btrim(p_customer_dni),''),
    p_shipping_address, p_shipping_address, p_zona_id,
    coalesce(p_total,0), nullif(btrim(p_payment_method),''),
    coalesce(p_items,'[]'::jsonb), nullif(btrim(p_notes),'')
  ) returning * into v_result;
  return v_result;
end $$;

grant execute on function public.create_manual_order(
  order_origin, text, text, text, text, jsonb, uuid, jsonb, numeric, text, text
) to authenticated;
