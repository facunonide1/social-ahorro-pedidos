-- =====================================================================
-- Horarios de atención configurables desde /admin/configuracion
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Tabla singleton (siempre id = 1)
create table if not exists public.app_settings (
  id              integer primary key check (id = 1),
  hora_apertura   smallint not null default 8  check (hora_apertura between 0 and 23),
  hora_cierre     smallint not null default 20 check (hora_cierre   between 1 and 24),
  updated_at      timestamptz not null default now(),
  constraint apertura_antes_de_cierre check (hora_apertura < hora_cierre)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

-- 2) RLS
alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (public.current_pedidos_role() in ('admin','operador','repartidor'));

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for all using (public.current_pedidos_role() = 'admin')
           with check (public.current_pedidos_role() = 'admin');

-- 3) RPC create_manual_order consulta app_settings para "fuera_de_horario"
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

  v_number := nextval('public.manual_order_seq');

  insert into public.orders (
    origin, tipo_envio, fuera_de_horario,
    manual_order_number, status,
    customer_name, customer_phone, customer_email, customer_dni,
    shipping_address, billing_address, zona_id,
    total, payment_method, items, notes
  ) values (
    p_origin, coalesce(p_tipo_envio,'programado'), v_fuera,
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
