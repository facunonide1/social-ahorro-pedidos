-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEO CÍCLICO POR ZONA — v0.76
--
-- Un motor de conteo ciego. Se cuenta una lista de items en una zona sin ver lo
-- que el sistema espera, y recién al cerrar aparecen las diferencias.
--
-- ── VOCABULARIO NEUTRO, A PROPÓSITO ────────────────────────────────────────
--
-- punto en vez de sucursal, zona en vez de góndola, item en vez de medicamento,
-- sistema autoridad en vez de SIFACO. La pieza es candidata a viajar al
-- catálogo, y el motor de documentos ya demostró que escribirlo así es lo que
-- lo hace servir para cualquier rubro.
--
-- LÍNEA DE CORTE: este motor NO sabe qué es un psicotrópico, una ventana de
-- devolución ni un rubro farmacéutico. Todo eso se conecta encima, por FK
-- opcional a las tablas de Social Ahorro (`item_id` → productos_catalogo,
-- `punto_id` → sucursales). Sin esas FK el motor funciona igual.
--
-- ── LO QUE NO HACE ─────────────────────────────────────────────────────────
--
-- NO ajusta stock. La autoridad de stock es el sistema autoridad, y la
-- corrección la hace una persona allá. Acá se mide, se registra y se pide.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── El tenant, con el mismo criterio que el motor de documentos ─────────── */

create or replace function public.cnt_tenant_actual()
returns uuid language sql stable set search_path = ''
as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

comment on function public.cnt_tenant_actual is
  'El tenant de esta instalación. Existe para que las políticas no lleven el '
  'literal repetido en veinte lugares: el día que haya más de uno, se cambia acá.';

/**
 * ¿Este usuario ve este punto?
 *
 * La regla ya existe en el resto del sistema —el rol `sucursal` ve sólo el
 * suyo, los demás ven todos— y estaba escrita como la misma subconsulta
 * repetida en cada política. Acá va una vez: una regla en veinte lugares es
 * veinte lugares donde puede quedar distinta.
 *
 * Un punto nulo lo ve cualquiera con acceso: una lista puede ser de todos.
 */
create or replace function public.cnt_ve_punto(p_punto uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users_admin ua
    where ua.id = auth.uid() and ua.activo
      and (ua.rol <> 'sucursal'::admin_role or p_punto is null or ua.sucursal_id = p_punto)
  )
$$;

-- Sólo para quien tiene sesión. Es SECURITY DEFINER —necesita leer users_admin,
-- que el usuario no puede— así que se le saca a `public` y a `anon` en vez de
-- dejarla ejecutable por cualquiera: el linter lo marca, y tiene razón.
revoke all on function public.cnt_ve_punto(uuid) from public, anon;
grant execute on function public.cnt_ve_punto(uuid) to authenticated, service_role;

/* ── A.1 · Listas de conteo por zona ─────────────────────────────────────── */

create table if not exists public.cnt_listas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.cnt_tenant_actual(),
  -- La zona: "Perfumería góndola 3", "Depósito estante A". Es un nombre de
  -- recorrido físico, no una categoría del catálogo.
  zona        text not null,
  punto_id    uuid references public.sucursales(id) on delete set null,
  descripcion text,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

comment on table public.cnt_listas is
  'Una lista de conteo por zona. Se importa una vez y se reutiliza todas las '
  'veces que se cuente esa zona.';

create index if not exists cnt_listas_punto_idx on public.cnt_listas(punto_id) where activa;

/* ── A.2 · Items de la lista ─────────────────────────────────────────────── */

create table if not exists public.cnt_lista_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.cnt_tenant_actual(),
  lista_id     uuid not null references public.cnt_listas(id) on delete cascade,
  -- Opcional a propósito: un item que no matchea el catálogo se cuenta igual.
  -- Crear el producto automáticamente sería inventar catálogo desde una planilla.
  item_id      uuid references public.productos_catalogo(id) on delete set null,
  sku          text,
  -- La descripción TAL COMO VINO del Excel. No se normaliza: si dice
  -- "IBUPIRAC 600 x10", eso es lo que quien cuenta va a leer en la góndola.
  descripcion  text not null,
  unidad       text,
  -- EL ORDEN ES EL RECORRIDO FÍSICO, y es la diferencia entre un conteo de 20
  -- minutos y uno de una hora. Quien cuenta camina la góndola en un orden; que
  -- la lista lo respete es lo que hace que no tenga que ir y volver.
  orden        integer not null default 0,
  -- B.4: al reimportar, lo que ya no está se marca y no se borra. Borrarlo
  -- rompería los renglones de los conteos viejos.
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.cnt_lista_items.orden is
  'El orden del recorrido físico de la zona, no el del catálogo.';

create index if not exists cnt_lista_items_lista_idx on public.cnt_lista_items(lista_id, orden);
create unique index if not exists cnt_lista_items_sku_unico
  on public.cnt_lista_items(lista_id, sku) where sku is not null;

/* ── A.3 · Conteos ───────────────────────────────────────────────────────── */

create table if not exists public.cnt_conteos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.cnt_tenant_actual(),
  lista_id     uuid not null references public.cnt_listas(id) on delete restrict,
  punto_id     uuid references public.sucursales(id) on delete set null,
  contado_por  uuid references auth.users(id) on delete set null,
  pedido_por   uuid references auth.users(id) on delete set null,
  estado       text not null default 'abierto'
               check (estado in ('abierto', 'contando', 'cerrado', 'anulado')),
  iniciado_at  timestamptz not null default now(),
  cerrado_at   timestamptz,
  -- Si nació de una tarea (un recuento, o el ciclo programado).
  tarea_origen_id uuid references public.tareas(id) on delete set null,
  -- El resultado, escrito AL CERRAR. Nulo mientras está abierto: un total en 0
  -- mientras se cuenta se lee como "no hay diferencias", y lo que hay es que
  -- todavía no se miró.
  total_items        integer,
  items_coinciden    integer,
  items_diferencia   integer,
  valor_diferencia   numeric(14,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

comment on column public.cnt_conteos.total_items is
  'Nulo mientras el conteo no cerró. Un cero acá tiene que significar "se contó '
  'y no hubo", nunca "todavía no se contó".';

create index if not exists cnt_conteos_lista_idx on public.cnt_conteos(lista_id, iniciado_at desc);
create index if not exists cnt_conteos_abiertos_idx
  on public.cnt_conteos(punto_id) where estado in ('abierto', 'contando');

/* ── A.4 · Renglones contados ────────────────────────────────────────────── */

create table if not exists public.cnt_renglones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.cnt_tenant_actual(),
  conteo_id      uuid not null references public.cnt_conteos(id) on delete cascade,
  lista_item_id  uuid not null references public.cnt_lista_items(id) on delete restrict,
  cantidad_contada  numeric(14,3),
  -- ── LA REGLA CRÍTICA DEL CONTEO CIEGO ─────────────────────────────────
  -- Estas tres se escriben AL CERRAR y no antes. No es una convención del
  -- código: hay un trigger que rechaza escribirlas con el conteo abierto.
  -- Si el dato estuviera en la fila mientras se cuenta, cualquier `select *`
  -- de cualquier endpoint lo filtra, y el conteo deja de ser ciego sin que
  -- nadie haya escrito una línea de más.
  cantidad_esperada numeric(14,3),
  diferencia        numeric(14,3),
  valor_diferencia  numeric(14,2),
  nota           text,
  -- Saltear se permite, pero con motivo: un item salteado en silencio es
  -- indistinguible de uno contado en cero.
  salteado       boolean not null default false,
  motivo_salteo  text,
  contado_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cnt_renglones_salteo_con_motivo
    check (not salteado or (motivo_salteo is not null and btrim(motivo_salteo) <> ''))
);

create unique index if not exists cnt_renglones_unico
  on public.cnt_renglones(conteo_id, lista_item_id);
create index if not exists cnt_renglones_conteo_idx on public.cnt_renglones(conteo_id);

/**
 * El conteo ciego, como restricción y no como instrucción.
 *
 * Rechaza escribir la esperada, la diferencia o su valor mientras el conteo no
 * esté cerrado. Con esto, dejar de ser ciego deja de ser un descuido posible:
 * hay que romper el trigger a propósito.
 */
create or replace function public.cnt_tg_ciego()
returns trigger language plpgsql set search_path = public as $$
declare
  v_estado text;
begin
  if new.cantidad_esperada is null and new.diferencia is null and new.valor_diferencia is null then
    return new;
  end if;

  select estado into v_estado from public.cnt_conteos where id = new.conteo_id;

  if v_estado is distinct from 'cerrado' then
    raise exception
      'El conteo es ciego: la cantidad esperada se resuelve al cerrar (conteo en estado %).', v_estado
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists cnt_renglones_ciego on public.cnt_renglones;
create trigger cnt_renglones_ciego
  before insert or update on public.cnt_renglones
  for each row execute function public.cnt_tg_ciego();

/* ── updated_at ──────────────────────────────────────────────────────────── */

create or replace function public.cnt_tg_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cnt_listas_touch on public.cnt_listas;
create trigger cnt_listas_touch before update on public.cnt_listas
  for each row execute function public.cnt_tg_touch();
drop trigger if exists cnt_lista_items_touch on public.cnt_lista_items;
create trigger cnt_lista_items_touch before update on public.cnt_lista_items
  for each row execute function public.cnt_tg_touch();
drop trigger if exists cnt_conteos_touch on public.cnt_conteos;
create trigger cnt_conteos_touch before update on public.cnt_conteos
  for each row execute function public.cnt_tg_touch();
drop trigger if exists cnt_renglones_touch on public.cnt_renglones;
create trigger cnt_renglones_touch before update on public.cnt_renglones
  for each row execute function public.cnt_tg_touch();

/* ── A.5 · RLS: por tenant y por punto ───────────────────────────────────── */

alter table public.cnt_listas      enable row level security;
alter table public.cnt_lista_items enable row level security;
alter table public.cnt_conteos     enable row level security;
alter table public.cnt_renglones   enable row level security;

-- Quiénes arman listas y piden conteos. Quién CUENTA es cualquiera activo con
-- acceso al punto: contar es trabajo de mostrador, no de administración.
create policy cnt_listas_sel on public.cnt_listas for select
  using (tenant_id = public.cnt_tenant_actual() and public.cnt_ve_punto(punto_id));
create policy cnt_listas_ins on public.cnt_listas for insert
  with check (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() in ('super_admin','gerente','administrativo','comprador'));
create policy cnt_listas_upd on public.cnt_listas for update
  using (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() in ('super_admin','gerente','administrativo','comprador'))
  with check (tenant_id = public.cnt_tenant_actual());
create policy cnt_listas_del on public.cnt_listas for delete
  using (tenant_id = public.cnt_tenant_actual() and current_admin_role() = 'super_admin');

create policy cnt_lista_items_sel on public.cnt_lista_items for select
  using (tenant_id = public.cnt_tenant_actual() and exists (
    select 1 from public.cnt_listas l
    where l.id = lista_id and public.cnt_ve_punto(l.punto_id)));
create policy cnt_lista_items_ins on public.cnt_lista_items for insert
  with check (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() in ('super_admin','gerente','administrativo','comprador'));
create policy cnt_lista_items_upd on public.cnt_lista_items for update
  using (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() in ('super_admin','gerente','administrativo','comprador'))
  with check (tenant_id = public.cnt_tenant_actual());
create policy cnt_lista_items_del on public.cnt_lista_items for delete
  using (tenant_id = public.cnt_tenant_actual() and current_admin_role() = 'super_admin');

create policy cnt_conteos_sel on public.cnt_conteos for select
  using (tenant_id = public.cnt_tenant_actual() and public.cnt_ve_punto(punto_id));
create policy cnt_conteos_ins on public.cnt_conteos for insert
  with check (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() is not null and public.cnt_ve_punto(punto_id));
create policy cnt_conteos_upd on public.cnt_conteos for update
  using (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() is not null and public.cnt_ve_punto(punto_id))
  with check (tenant_id = public.cnt_tenant_actual());
create policy cnt_conteos_del on public.cnt_conteos for delete
  using (tenant_id = public.cnt_tenant_actual() and current_admin_role() = 'super_admin');

create policy cnt_renglones_sel on public.cnt_renglones for select
  using (tenant_id = public.cnt_tenant_actual() and exists (
    select 1 from public.cnt_conteos c
    where c.id = conteo_id and public.cnt_ve_punto(c.punto_id)));
create policy cnt_renglones_ins on public.cnt_renglones for insert
  with check (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() is not null and exists (
      select 1 from public.cnt_conteos c
      where c.id = conteo_id and public.cnt_ve_punto(c.punto_id)));
create policy cnt_renglones_upd on public.cnt_renglones for update
  using (tenant_id = public.cnt_tenant_actual()
    and current_admin_role() is not null and exists (
      select 1 from public.cnt_conteos c
      where c.id = conteo_id and public.cnt_ve_punto(c.punto_id)))
  with check (tenant_id = public.cnt_tenant_actual());
create policy cnt_renglones_del on public.cnt_renglones for delete
  using (tenant_id = public.cnt_tenant_actual() and current_admin_role() = 'super_admin');
