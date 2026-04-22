-- =====================================================================
-- Historial de mensajes de WhatsApp por pedido
-- Cada cambio de estado genera un "mensaje pendiente" con el texto
-- a enviar. El operador lo despacha desde la UI cuando puede.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_msg_status') then
    create type whatsapp_msg_status as enum ('pending', 'sent', 'skipped');
  end if;
end$$;

create table if not exists public.whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  status_trigger  order_status not null,
  phone           text,
  message         text not null,
  status          whatsapp_msg_status not null default 'pending',
  sent_at         timestamptz,
  sent_by         uuid references public.users_pedidos(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists whatsapp_messages_order_idx
  on public.whatsapp_messages (order_id, created_at desc);

-- RLS: read sigue la misma regla que orders (admin/operador todo, repartidor
-- solo los de sus pedidos). Write admin/operador.
alter table public.whatsapp_messages enable row level security;

drop policy if exists whatsapp_messages_read on public.whatsapp_messages;
create policy whatsapp_messages_read on public.whatsapp_messages
  for select using (
    public.current_pedidos_role() in ('admin','operador')
    or (
      public.current_pedidos_role() = 'repartidor'
      and exists (
        select 1 from public.orders o
        where o.id = whatsapp_messages.order_id
          and o.assigned_to = auth.uid()
      )
    )
  );

drop policy if exists whatsapp_messages_write on public.whatsapp_messages;
create policy whatsapp_messages_write on public.whatsapp_messages
  for all using (public.current_pedidos_role() in ('admin','operador'))
           with check (public.current_pedidos_role() in ('admin','operador'));
