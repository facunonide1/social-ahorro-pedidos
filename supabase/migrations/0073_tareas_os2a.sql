-- 0073 · Tareas OS-2a (gap sobre el diseño NORA OS)
--
-- Aditiva y re-runnable. Extiende el modelo de tareas SIN tocar workflow ni
-- estados existentes:
--   · Posponer (Mi día mobile): motivo obligatorio + hasta cuándo.
--   · Evidencia por default: registro del opt-out explícito (quién lo destildó).
--   · Agenda del día por sucursal: ciclo borrador → publicada (idempotente).
--
-- NO agrega valores de enum (evita el problema ADD VALUE + uso en la misma tx):
--   - "posponer"  → se historiza con la acción existente 'cambio_vencimiento'.
--   - "bloqueada" → NO es un estado nuevo; se computa de dependencias_ids.
--   - "liberada"  → se historiza con la acción existente 'dependencia'.

-- ============ ALTER tareas ===================================================
alter table public.tareas
  add column if not exists pospuesta_motivo      text,
  add column if not exists pospuesta_hasta       timestamptz,
  add column if not exists evidencia_opt_out      boolean not null default false,
  add column if not exists evidencia_opt_out_por  uuid references auth.users(id) on delete set null;

-- ============ AGENDA DEL DÍA (por sucursal) ==================================
-- Una fila por (sucursal, fecha). El ciclo:
--   borrador  → el encargado ajusta las propuestas de NORA
--   publicada → las tareas ya cayeron a las bandejas (idempotente por marca).
create table if not exists public.agendas_dia (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid references public.sucursales(id) on delete cascade,
  fecha          date not null,
  estado         text not null default 'borrador',      -- borrador | publicada
  auto_hora      time,                                   -- hora límite de auto-publicación
  publicada_at   timestamptz,
  publicada_por  uuid references auth.users(id) on delete set null,
  tareas_creadas int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (sucursal_id, fecha)
);
create index if not exists agendas_dia_fecha_idx on public.agendas_dia(fecha);

drop trigger if exists agendas_dia_set_updated_at on public.agendas_dia;
create trigger agendas_dia_set_updated_at
  before update on public.agendas_dia
  for each row execute function public.tg_set_updated_at();

-- Marca de origen en las tareas creadas por una agenda publicada (idempotencia).
alter table public.tareas
  add column if not exists agenda_dia_id uuid references public.agendas_dia(id) on delete set null;
create index if not exists tareas_agenda_dia_idx on public.tareas(agenda_dia_id);

-- ============ RLS ============================================================
alter table public.agendas_dia enable row level security;

drop policy if exists agendas_dia_read on public.agendas_dia;
create policy agendas_dia_read on public.agendas_dia
  for select using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo)
  );

drop policy if exists agendas_dia_write on public.agendas_dia;
create policy agendas_dia_write on public.agendas_dia
  for all using (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and ua.rol in ('super_admin','gerente','sucursal','encargado_sucursal','administrativo')
    )
  ) with check (
    exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and ua.rol in ('super_admin','gerente','sucursal','encargado_sucursal','administrativo')
    )
  );
