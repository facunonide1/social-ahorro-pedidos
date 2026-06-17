-- 0039 · Adjuntos / comprobantes polimórficos (F6-T · T13)
--
-- Tabla única para comprobantes de cualquier entidad (facturas, pagos,
-- recepciones, gastos, cheques, devoluciones, …). Los archivos van al bucket
-- privado `comprobantes` (creado en 0037). RLS: cualquier usuario admin activo.

create table if not exists public.adjuntos (
  id           uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,
  entidad_id   uuid not null,
  nombre       text not null,
  url          text not null,          -- path dentro del bucket comprobantes
  tipo_mime    text,
  tamanio      bigint,
  subido_por   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists adjuntos_entidad_idx on public.adjuntos(entidad_tipo, entidad_id);

alter table public.adjuntos enable row level security;

drop policy if exists adjuntos_admin_all on public.adjuntos;
create policy adjuntos_admin_all on public.adjuntos
  for all
  using (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo))
  with check (exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo));
