-- 0048 · Stock con ubicación góndola/depósito (v0.20).
-- stock_items mantiene grano (producto, sucursal); `cantidad` pasa a generada
-- = góndola + depósito. Movimientos llevan `ubicacion`; el trigger aplica el
-- signo a la columna correcta. Reposición interna = 2 movimientos (−dep, +gón).

alter table public.stock_items
  add column if not exists cantidad_gondola numeric not null default 0,
  add column if not exists cantidad_deposito numeric not null default 0;

update public.stock_items set cantidad_gondola = cantidad where cantidad_gondola = 0;

drop index if exists public.stock_items_critico_idx;

create or replace function public.tg_aplicar_movimiento_stock()
returns trigger language plpgsql as $function$
begin
  insert into public.stock_items (producto_id, sucursal_id, cantidad_gondola, cantidad_deposito, updated_at)
  values (
    NEW.producto_id, NEW.sucursal_id,
    case when NEW.ubicacion = 'deposito' then 0 else NEW.cantidad end,
    case when NEW.ubicacion = 'deposito' then NEW.cantidad else 0 end,
    now()
  )
  on conflict (producto_id, sucursal_id) do update set
    cantidad_gondola  = public.stock_items.cantidad_gondola  + (case when NEW.ubicacion = 'deposito' then 0 else NEW.cantidad end),
    cantidad_deposito = public.stock_items.cantidad_deposito + (case when NEW.ubicacion = 'deposito' then NEW.cantidad else 0 end),
    updated_at = now();
  return NEW;
end $function$;

alter table public.stock_items drop column cantidad;
alter table public.stock_items
  add column cantidad numeric generated always as (cantidad_gondola + cantidad_deposito) stored;

create index if not exists stock_items_critico_idx
  on public.stock_items (sucursal_id) where (cantidad <= (stock_minimo)::numeric);

do $$ begin
  create type public.ubicacion_stock as enum ('gondola','deposito');
exception when duplicate_object then null; end $$;
alter table public.movimientos_stock
  add column if not exists ubicacion public.ubicacion_stock not null default 'gondola';

alter table public.sucursales
  add column if not exists usa_deposito boolean not null default false;
