-- =====================================================================
-- Fase A3 · Código SA-YYYY-XXXX como identificador visible
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Secuencia global de correlativo
create sequence if not exists public.sa_order_seq start 1;

-- 2) Columna codigo (arranca nullable para el backfill)
alter table public.orders
  add column if not exists codigo text;

-- 3) Función y trigger: si codigo es null al insertar, lo asigna.
--    Usa el año local Buenos Aires y la secuencia global, padding a 4 dígitos.
create or replace function public.tg_assign_sa_codigo()
returns trigger
language plpgsql
as $$
declare
  v_year text := to_char((now() at time zone 'America/Argentina/Buenos_Aires'), 'YYYY');
  v_seq  int  := nextval('public.sa_order_seq');
begin
  if new.codigo is null then
    new.codigo := 'SA-' || v_year || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists orders_assign_sa_codigo on public.orders;
create trigger orders_assign_sa_codigo
  before insert on public.orders
  for each row execute function public.tg_assign_sa_codigo();

-- 4) Backfill: asignar código a los pedidos existentes en orden cronológico.
do $$
declare
  r record;
  i int := 0;
begin
  for r in
    select id, extract(year from created_at)::text as yyyy
    from public.orders
    where codigo is null
    order by created_at
  loop
    i := i + 1;
    update public.orders
       set codigo = 'SA-' || r.yyyy || '-' || lpad(i::text, 4, '0')
     where id = r.id;
  end loop;

  -- Ajusto la secuencia para que los nuevos empiecen después
  if i > 0 then
    perform setval('public.sa_order_seq', i);
  end if;
end $$;

-- 5) Unique + not null
create unique index if not exists orders_codigo_unique on public.orders(codigo);
alter table public.orders alter column codigo set not null;
