-- ============================================================================
-- 0064 · CRM UNIFICADO (B2C + B2B) — maestro de clientes accionable
-- ----------------------------------------------------------------------------
-- Unifica las 5 fuentes (cuponera/Club `users`, CRM pedidos `customers`, tickets
-- OCR `tickets_validacion`, web/WooCommerce, SIFACO vía Centro de Datos) en una
-- ficha única. NO toca la cuponera (users/user_points/point_transactions/
-- customers/coupons/notifications) ni el CRM de pedidos (users_pedidos/orders):
-- las LEE y, para puntos/push, escribe en SU formato. clientes_crm (0 filas)
-- queda como legacy.
-- ============================================================================

-- ===== Enums =====
do $$ begin create type public.cliente_tipo as enum ('b2c','b2b'); exception when duplicate_object then null; end $$;
do $$ begin create type public.cliente_nivel as enum ('socio','plus','premium'); exception when duplicate_object then null; end $$;
do $$ begin create type public.cliente_riesgo as enum ('bajo','medio','alto'); exception when duplicate_object then null; end $$;
do $$ begin create type public.segmento_tipo as enum ('auto','manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.campania_estado as enum ('borrador','programada','enviada','finalizada'); exception when duplicate_object then null; end $$;
do $$ begin create type public.envio_estado as enum ('encolado','enviado','abierto','convertido','error'); exception when duplicate_object then null; end $$;
do $$ begin create type public.automatizacion_trigger as enum ('cumpleanos','inactividad_30d','recompra_cronico','nivel_alcanzado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.puntos_evento as enum ('compra','cargar_ticket','resena','encuesta','ajuste'); exception when duplicate_object then null; end $$;

-- ===== Maestro unificado =====
create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  public.cliente_tipo not null default 'b2c',
  nombre                text not null,
  dni                   text,
  cuit                  text,
  telefono              text,
  email                 text,
  fecha_nacimiento      date,
  sucursal_habitual_id  uuid references public.sucursales(id) on delete set null,
  fuentes               text[] not null default '{}',   -- cuponera/crm_pedidos/tickets/web/sifaco
  cuponera_user_id      uuid,                            -- ref a public.users (Club), sin FK dura
  nivel                 public.cliente_nivel,
  puntos                integer not null default 0,
  total_gastado_12m     numeric(14,2) not null default 0,
  n_compras_12m         integer not null default 0,
  ultima_compra         date,
  frecuencia_compra_dias numeric(8,2),
  riesgo_churn          public.cliente_riesgo not null default 'bajo',
  score_valor           numeric(8,2) not null default 0,
  notas                 text,
  activo                boolean not null default true,
  es_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists clientes_tipo_idx on public.clientes(tipo);
create index if not exists clientes_dni_idx on public.clientes(dni) where dni is not null;
create index if not exists clientes_tel_idx on public.clientes(telefono) where telefono is not null;
create index if not exists clientes_riesgo_idx on public.clientes(riesgo_churn);
create index if not exists clientes_suc_idx on public.clientes(sucursal_habitual_id);

-- ===== Trazabilidad de fuentes =====
create table if not exists public.cliente_fuentes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  fuente      text not null,                 -- cuponera/crm_pedidos/tickets/web/sifaco
  id_externo  text,                          -- id del cliente en la fuente original
  datos       jsonb not null default '{}',
  es_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (cliente_id, fuente, id_externo)
);
create index if not exists cliente_fuentes_cli_idx on public.cliente_fuentes(cliente_id);

-- ===== Compras unificadas (alimenta churn / recompra / atribución) =====
create table if not exists public.cliente_compras (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  fecha       date not null,
  monto       numeric(14,2) not null default 0,
  sucursal_id uuid references public.sucursales(id) on delete set null,
  canal       text,                          -- local/web/pedido/ticket
  fuente      text,
  productos   jsonb,                         -- para crónicos/recompra
  es_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists cliente_compras_cli_fecha_idx on public.cliente_compras(cliente_id, fecha desc);

-- ===== Cola de deduplicación =====
create table if not exists public.dedup_pendientes (
  id          uuid primary key default gen_random_uuid(),
  cliente_a   uuid not null references public.clientes(id) on delete cascade,
  cliente_b   uuid not null references public.clientes(id) on delete cascade,
  score_match numeric(5,2) not null default 0,
  criterio    text,                          -- dni/telefono/email/nombre
  estado      text not null default 'pendiente', -- pendiente/fusionado/separado
  es_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists dedup_estado_idx on public.dedup_pendientes(estado) where estado = 'pendiente';

-- ===== Segmentos =====
create table if not exists public.segmentos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  tipo        public.segmento_tipo not null default 'auto',
  regla       jsonb not null default '{}',   -- {gasto_min, frecuencia, ultima_compra_dias, nivel, sucursal, rubro, riesgo}
  clave_auto  text,                          -- riesgo/vip/cronicos/cumple (para los de NORA)
  n_clientes  integer not null default 0,
  dinamico    boolean not null default true,
  es_demo     boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ===== Campañas =====
create table if not exists public.campanias_crm (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  segmento_id   uuid references public.segmentos(id) on delete set null,
  objetivo      text,                        -- reactivar/fidelizar/promo/cumpleanos
  canales       text[] not null default '{}',-- push/email/whatsapp
  mensaje       jsonb not null default '{}', -- {push:{title,body}, email:{subject,html}, whatsapp:{body}}
  cupon_ref     uuid,                        -- oferta del módulo Ofertas / coupon de la cuponera
  estado        public.campania_estado not null default 'borrador',
  programada_at timestamptz,
  redactado_por text not null default 'usuario', -- nora/usuario
  metricas      jsonb not null default '{}', -- {enviados, abiertos, convirtieron, facturacion}
  es_demo       boolean not null default false,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists campanias_estado_idx on public.campanias_crm(estado, created_at desc);

create table if not exists public.campania_envios (
  id          uuid primary key default gen_random_uuid(),
  campania_id uuid not null references public.campanias_crm(id) on delete cascade,
  cliente_id  uuid references public.clientes(id) on delete set null,
  canal       text not null,                 -- push/email/whatsapp
  estado      public.envio_estado not null default 'encolado',
  enviado_at  timestamptz,
  abierto_at  timestamptz,
  error       text,
  es_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists campania_envios_camp_idx on public.campania_envios(campania_id);
create index if not exists campania_envios_cli_idx on public.campania_envios(cliente_id);

-- ===== Automatizaciones =====
create table if not exists public.automatizaciones (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  trigger         public.automatizacion_trigger not null,
  config          jsonb not null default '{}', -- {dias_inactividad, dias_antes_recompra, nivel}
  canales         text[] not null default '{push}',
  mensaje_template jsonb not null default '{}',
  cupon_ref       uuid,
  activa          boolean not null default true,
  ultima_corrida  timestamptz,
  n_disparos      integer not null default 0,
  es_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ===== Motor de puntos (reglas en NORA HQ; saldo/canje en la cuponera) =====
create table if not exists public.puntos_reglas (
  id          uuid primary key default gen_random_uuid(),
  evento      public.puntos_evento not null,
  descripcion text,
  puntos      integer not null default 0,     -- puntos fijos por evento
  ratio_monto numeric(10,2),                  -- 1 punto cada $ratio_monto (para compra)
  activa      boolean not null default true,
  es_demo     boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (evento)
);

create table if not exists public.puntos_movimientos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id) on delete cascade,
  evento          public.puntos_evento not null,
  puntos          integer not null default 0,
  referencia_tipo text,                       -- ticket/compra/campania
  referencia_id   uuid,
  sincronizado    boolean not null default false, -- escrito en point_transactions de la cuponera
  es_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists puntos_mov_cli_idx on public.puntos_movimientos(cliente_id, created_at desc);

-- ===== B2B =====
create table if not exists public.b2b_cuenta_corriente (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  saldo           numeric(14,2) not null default 0,
  limite_credito  numeric(14,2) not null default 0,
  lista_precios_id uuid,
  es_demo         boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (cliente_id)
);

create table if not exists public.b2b_pedidos_recurrentes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nombre      text,
  productos   jsonb not null default '[]',
  frecuencia  text not null default 'mensual', -- semanal/quincenal/mensual
  proximo     date,
  activo      boolean not null default true,
  es_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ===== updated_at triggers (reusa set_updated_at) =====
do $$ declare t text; begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    foreach t in array array['clientes','segmentos','campanias_crm','automatizaciones'] loop
      execute format('drop trigger if exists %I_updated on public.%I', t, t);
      execute format('create trigger %I_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
    end loop;
  end if;
end $$;

-- ===== RLS (lectura: admin activo · escritura: super_admin/gerente/marketing) =====
do $$ declare t text; begin
  foreach t in array array[
    'clientes','cliente_fuentes','cliente_compras','dedup_pendientes','segmentos',
    'campanias_crm','campania_envios','automatizaciones','puntos_reglas',
    'puntos_movimientos','b2b_cuenta_corriente','b2b_pedidos_recurrentes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''marketing'',''administrativo''))) with check (exists (select 1 from public.users_admin ua where ua.id=auth.uid() and ua.activo and ua.rol in (''super_admin'',''gerente'',''marketing'',''administrativo'')))', t, t);
  end loop;
end $$;

-- Seed de reglas de puntos por defecto (idempotente)
insert into public.puntos_reglas (evento, descripcion, puntos, ratio_monto, activa) values
  ('compra', 'Puntos por compra (1 cada $100)', 0, 100, true),
  ('cargar_ticket', 'Bonus por cargar ticket', 50, null, true),
  ('resena', 'Bonus por reseña/encuesta', 30, null, true)
on conflict (evento) do nothing;
