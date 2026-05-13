-- ============================================================================
-- 0027_ia_aprobaciones_tickets.sql · F4 IA + F5.8 Aprobaciones + F4.7 Tickets
-- ============================================================================

-- F4 IA conversaciones y resúmenes -----------------------------------------
create table if not exists public.ai_conversaciones (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  mensajes            jsonb not null,
  tools_called        jsonb,
  tokens_input        integer,
  tokens_output       integer,
  model               text,
  created_at          timestamptz not null default now()
);

create index if not exists ai_conv_user_idx on public.ai_conversaciones(user_id, created_at desc);

create table if not exists public.ai_resumenes_diarios (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null unique,
  resumen_markdown    text not null,
  metricas            jsonb,
  generado_at         timestamptz not null default now()
);

-- F5.8 Aprobaciones --------------------------------------------------------
do $$ begin
  create type public.tipo_aprobacion as enum (
    'pago_alto','nuevo_proveedor','campania','transferencia','devolucion_grande','otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_aprobacion as enum (
    'pendiente','aprobada','rechazada','solicita_info'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.aprobaciones (
  id                  uuid primary key default gen_random_uuid(),
  tipo                public.tipo_aprobacion not null,
  entidad_tipo        text,
  entidad_id          uuid,
  solicitante_id      uuid references auth.users(id) on delete set null,
  aprobador_id        uuid references auth.users(id) on delete set null,
  rol_aprobador       admin_role,
  monto_afectado      numeric(14,2),
  descripcion         text,
  estado              public.estado_aprobacion not null default 'pendiente',
  comentarios         text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists aprobaciones_pendientes_idx
  on public.aprobaciones(rol_aprobador, created_at desc) where estado = 'pendiente';

-- F4.7 Tickets validación (OCR) ---------------------------------------------
-- NOTA: customers vive en repo cuponera. Aquí guardamos referencia por DNI/teléfono.
do $$ begin
  create type public.estado_ticket_validacion as enum (
    'pendiente','auto_validado','manual_aprobado','rechazado','dudoso'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.tickets_validacion (
  id                       uuid primary key default gen_random_uuid(),
  cliente_dni              text,
  cliente_telefono         text,
  cliente_id               uuid, -- ref cross-repo
  foto_url                 text not null,
  hash_imagen              text,
  fecha_carga              timestamptz not null default now(),
  fecha_ticket_extraida    date,
  total_extraido           numeric(12,2),
  sucursal_extraida        text,
  numero_ticket_extraido   text,
  raw_ocr                  jsonb,
  estado                   public.estado_ticket_validacion not null default 'pendiente',
  puntos_asignados         integer,
  validado_por             uuid references auth.users(id) on delete set null,
  validado_at              timestamptz,
  observaciones            text
);

create index if not exists tickets_pendientes_idx
  on public.tickets_validacion(estado, fecha_carga desc) where estado in ('pendiente','dudoso');
create index if not exists tickets_hash_idx on public.tickets_validacion(hash_imagen) where hash_imagen is not null;

-- RLS bulk -----------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'ai_conversaciones','ai_resumenes_diarios','aprobaciones','tickets_validacion'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ai_conversaciones: cada user ve solo las propias
drop policy if exists ai_conv_own on public.ai_conversaciones;
create policy ai_conv_own on public.ai_conversaciones
  for all using (user_id = auth.uid());

-- ai_resumenes: solo super_admin y gerente
drop policy if exists ai_resumenes_ro on public.ai_resumenes_diarios;
create policy ai_resumenes_ro on public.ai_resumenes_diarios
  for select using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','auditor'))
  );

-- aprobaciones: ven los con rol aprobador o el solicitante
drop policy if exists aprob_read on public.aprobaciones;
create policy aprob_read on public.aprobaciones
  for select using (
    solicitante_id = auth.uid()
    or exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and (ua.rol = aprobaciones.rol_aprobador or ua.rol in ('super_admin','gerente'))
    )
  );
drop policy if exists aprob_write on public.aprobaciones;
create policy aprob_write on public.aprobaciones
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente'))
  );

-- tickets_validacion: operadores comerciales + super_admin
drop policy if exists tickets_rw on public.tickets_validacion;
create policy tickets_rw on public.tickets_validacion
  for all using (
    exists (select 1 from public.users_admin where id = auth.uid() and activo
      and rol in ('super_admin','gerente','administrativo'))
  );
