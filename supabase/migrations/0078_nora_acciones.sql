-- 0078 · NORA Acciones (motor conversacional — piloto Finanzas)
-- Aditiva. Auditoría de conversaciones + marca de origen en las entidades.

create table if not exists public.nora_conversaciones (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  subapp             text,
  mensajes           jsonb not null default '[]'::jsonb,
  entidades_creadas  uuid[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists nora_conversaciones_user_idx on public.nora_conversaciones(user_id);

drop trigger if exists nora_conversaciones_set_updated_at on public.nora_conversaciones;
create trigger nora_conversaciones_set_updated_at
  before update on public.nora_conversaciones
  for each row execute function public.tg_set_updated_at();

alter table public.nora_conversaciones enable row level security;
drop policy if exists nora_conversaciones_own on public.nora_conversaciones;
create policy nora_conversaciones_own on public.nora_conversaciones
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Marca de origen en las entidades creadas por chat (N-06).
alter table public.pagos
  add column if not exists origen_registro text;
alter table public.caja_general_movimientos
  add column if not exists origen_registro text;
