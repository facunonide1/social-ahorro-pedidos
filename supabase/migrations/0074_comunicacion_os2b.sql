-- 0074 · Comunicación OS-2b (gap sobre el diseño NORA OS)
--
-- Aditiva y re-runnable. Sobre el modelo de comunicación existente:
--   · Búsqueda full-text en mensajes (índice GIN 'spanish').
--   · Botón de pánico (panico_eventos + ciclo de de-escalada).
-- No toca canales, membresías ni el realtime core.

-- ============ BÚSQUEDA FULL-TEXT ============================================
-- Índice de expresión que coincide con `to_tsvector('spanish', contenido)`,
-- que es lo que genera Supabase `.textSearch('contenido', q, {config:'spanish'})`.
create index if not exists mensajes_contenido_fts
  on public.mensajes using gin (to_tsvector('spanish', contenido));

-- ============ BOTÓN DE PÁNICO ===============================================
create table if not exists public.panico_eventos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  sucursal_id   uuid references public.sucursales(id) on delete set null,
  canal_id      uuid references public.canales(id) on delete set null,
  mensaje_id    uuid references public.mensajes(id) on delete set null,
  estado        text not null default 'activo',        -- activo | falsa_alarma | resuelto
  creado_at     timestamptz not null default now(),
  resuelto_por  uuid references auth.users(id) on delete set null,
  resuelto_at   timestamptz
);
create index if not exists panico_eventos_estado_idx on public.panico_eventos(estado);
create index if not exists panico_eventos_suc_activo_idx on public.panico_eventos(sucursal_id) where estado = 'activo';

-- ============ RLS ============================================================
alter table public.panico_eventos enable row level security;

drop policy if exists panico_eventos_read on public.panico_eventos;
create policy panico_eventos_read on public.panico_eventos
  for select using (
    exists (select 1 from public.users_admin ua where ua.id = auth.uid() and ua.activo)
  );

-- Escritura vía service role (endpoints). Política de respaldo para encargados+.
drop policy if exists panico_eventos_write on public.panico_eventos;
create policy panico_eventos_write on public.panico_eventos
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
