-- =====================================================================
-- Incidencias por pedido (cliente ausente, dirección incorrecta, etc.)
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'incident_type') then
    create type incident_type as enum (
      'cliente_ausente',
      'direccion_incorrecta',
      'sin_stock',
      'dano_entrega',
      'otro'
    );
  end if;
end$$;

create table if not exists public.order_incidents (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  tipo           incident_type not null,
  descripcion    text,
  registrado_by  uuid references public.users_pedidos(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists order_incidents_order_idx
  on public.order_incidents (order_id, created_at desc);

alter table public.order_incidents enable row level security;

drop policy if exists order_incidents_read on public.order_incidents;
create policy order_incidents_read on public.order_incidents
  for select using (
    public.current_pedidos_role() in ('admin','operador')
    or (
      public.current_pedidos_role() = 'repartidor'
      and exists (select 1 from public.orders o where o.id = order_incidents.order_id and o.assigned_to = auth.uid())
    )
  );

drop policy if exists order_incidents_write on public.order_incidents;
create policy order_incidents_write on public.order_incidents
  for all using (public.current_pedidos_role() in ('admin','operador','repartidor'))
           with check (public.current_pedidos_role() in ('admin','operador','repartidor'));
