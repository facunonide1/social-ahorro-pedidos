-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0208 · EL PADRÓN DE CONVENIOS                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── EL LÍMITE QUE NO SE CRUZA ───────────────────────────────────────────────
--
-- Regla de oro 9. NORA **no registra al paciente, ni al médico, ni el
-- contenido de la receta**. Ninguna tabla de este archivo ni de los que vienen
-- después tiene un campo de nombre, documento, afiliado, matrícula médica ni
-- diagnóstico, y no es un olvido: es la constitución del sistema.
--
-- Lo que se registra es el COMPROBANTE: un número, una fecha, una obra social,
-- una sucursal y un importe. Una presentación es un hecho administrativo. Qué
-- le recetaron a quién es terreno clínico y no entra, ni de paso.
--
-- ── POR QUÉ ESTE PADRÓN EXISTE ──────────────────────────────────────────────
--
-- Entre el 50% y el 70% de lo que despacha la farmacia pasa por una obra
-- social. SIFACO factura; lo que viene después —presentar, que te debiten,
-- reclamar— no lo cubre nadie. Y los plazos son lo que convierte un débito
-- recuperable en plata perdida: sin el plazo escrito, nadie sabe si todavía
-- llega a reclamar.
--
-- Por eso cada plazo es una columna y no una nota. Un plazo en una nota no se
-- puede restar de una fecha.
--
-- ── Y POR QUÉ CASI TODO ES NULLABLE ────────────────────────────────────────
--
-- Porque hoy no se sabe. Facundo todavía no dijo con qué convenios trabajan.
-- Un `plazo_pago_dias` en 0 diría «paga el mismo día»; en null dice «no lo
-- sé», y la pantalla puede pedirlo. Cero es «lo miré y no hay». Null es «no lo
-- puedo saber».

-- ── CATÁLOGOS ───────────────────────────────────────────────────────────────

do $$ begin
  create type convenio_tipo as enum ('obra_social', 'prepaga', 'mutual', 'pami', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type convenio_troquel as enum ('fisico', 'digital', 'ambos', 'ninguno');
exception when duplicate_object then null; end $$;

do $$ begin
  create type convenio_periodicidad as enum ('semanal', 'quincenal', 'mensual', 'bimestral', 'otra');
exception when duplicate_object then null; end $$;

-- A.1 · «Si la presentación es por sucursal o consolidada».
-- Importa de verdad: una consolidada se arma una vez para las cuatro, y un
-- débito consolidado hay que repartirlo para saber qué sucursal lo generó.
do $$ begin
  create type convenio_modo_presentacion as enum ('por_sucursal', 'consolidada');
exception when duplicate_object then null; end $$;

-- ── A.1 · EL PADRÓN ─────────────────────────────────────────────────────────

create table if not exists public.convenios (
  id                      uuid primary key default gen_random_uuid(),
  nombre                  text not null,
  sigla                   text,
  tipo                    convenio_tipo not null default 'obra_social',
  cuit                    text,
  activo                  boolean not null default true,

  -- Qué porcentaje cubre, en general. El desglose por tipo de producto va en
  -- `convenio_cobertura`: acá queda el caso de los que cubren igual todo.
  cobertura_general_pct   numeric(5,2),

  -- Hasta cuántos días después del despacho se puede presentar. Es el plazo
  -- que, vencido, convierte un comprobante en plata perdida sin que nadie
  -- haya hecho nada mal.
  plazo_presentacion_dias integer,

  -- A cuántos días paga, DECLARADO. No es lo que tarda: es lo que dice el
  -- convenio. Lo que tarde de verdad se va a poder comparar contra esto
  -- cuando haya liquidaciones cargadas.
  plazo_pago_dias         integer,

  troquel                 convenio_troquel,
  periodicidad            convenio_periodicidad,
  modo_presentacion       convenio_modo_presentacion,

  -- Día del mes en que cierra la presentación (1-31). Con `periodicidad`
  -- alcanza para calcular el próximo cierre sin inventar un calendario.
  dia_cierre              integer check (dia_cierre is null or dia_cierre between 1 and 31),

  -- B.5 · con cuánta anticipación avisar. Configurable por convenio porque un
  -- convenio que exige troquel físico necesita más días que uno digital.
  aviso_dias_antes        integer not null default 7 check (aviso_dias_antes >= 0),

  firmado_at              date,
  notas                   text,
  es_demo                 boolean not null default false,
  created_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null,
  updated_at              timestamptz not null default now()
);

create unique index if not exists convenios_nombre_unico
  on public.convenios (lower(nombre));

comment on table public.convenios is
  'Padron de obras sociales y prepagas. NO contiene datos de pacientes ni de '
  'medicos: regla de oro 9. Los plazos son columnas y no notas porque un plazo '
  'en una nota no se puede restar de una fecha.';
comment on column public.convenios.plazo_presentacion_dias is
  'Dias despues del despacho para presentar. Null = no se sabe todavia, NO cero.';
comment on column public.convenios.plazo_pago_dias is
  'Dias de pago DECLARADOS por el convenio. Lo que tarda de verdad se compara '
  'contra esto cuando haya liquidaciones.';

-- ── A.1 · LA COBERTURA, CUANDO VARÍA POR TIPO DE PRODUCTO ──────────────────
--
-- `categoria` y `condicion_venta` son las dos dimensiones que ya existen en
-- `productos_catalogo`. No se inventa una tercera: si mañana hace falta por
-- rubro, se agrega la columna y se declara.

create table if not exists public.convenio_cobertura (
  id              uuid primary key default gen_random_uuid(),
  convenio_id     uuid not null references public.convenios(id) on delete cascade,
  -- Una de las dos, o ninguna si es el caso general. Las dos a la vez es una
  -- regla más fina: «medicamentos de venta libre».
  categoria       text,
  condicion_venta text,
  cobertura_pct   numeric(5,2) not null check (cobertura_pct >= 0 and cobertura_pct <= 100),
  notas           text,
  created_at      timestamptz not null default now()
);

create index if not exists convenio_cobertura_conv on public.convenio_cobertura (convenio_id);

comment on table public.convenio_cobertura is
  'Cobertura por tipo de producto, cuando varia. Si un convenio cubre igual '
  'todo, no tiene filas aca y se usa convenios.cobertura_general_pct.';

-- ── A.2 · QUÉ EXIGE CADA UNO ────────────────────────────────────────────────
--
-- Estas son las reglas que después explican los débitos. Se escriben acá y se
-- enlazan con el motivo de débito que generan: así, cuando aparece un débito
-- por «troquel faltante», el sistema puede mostrar la regla que lo predecía.
--
-- Sin esto, un débito es una sorpresa. Con esto, es el incumplimiento de algo
-- que estaba escrito.

do $$ begin
  create type convenio_exigencia as enum (
    'troquel', 'firma', 'vademecum', 'autorizacion_previa', 'tope_unidades',
    'sello_farmaceutico', 'fecha_legible', 'otra'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.convenio_requisitos (
  id             uuid primary key default gen_random_uuid(),
  convenio_id    uuid not null references public.convenios(id) on delete cascade,
  exigencia      convenio_exigencia not null,
  -- Qué pide exactamente, en palabras del convenio. «Troquel pegado en el
  -- cuerpo de la receta, no en el reverso» no es lo mismo que «troquel».
  detalle        text,
  obligatorio    boolean not null default true,
  -- El motivo de débito que aparece cuando esto no se cumple. Se puebla
  -- después del catálogo de motivos (migración 0210) con una FK diferida.
  motivo_debito  text,
  created_at     timestamptz not null default now()
);

create index if not exists convenio_requisitos_conv on public.convenio_requisitos (convenio_id);

comment on table public.convenio_requisitos is
  'Lo que exige cada convenio. Son las reglas que explican los debitos: un '
  'debito por troquel faltante se lee contra el requisito que lo pedia.';

-- ── A.3 · EL CONTACTO Y EL PORTAL ───────────────────────────────────────────
--
-- Dónde se presenta y quién atiende. **Sin integrar nada**: la URL es un link
-- para abrir en otra pestaña, no una integración.

create table if not exists public.convenio_contactos (
  id           uuid primary key default gen_random_uuid(),
  convenio_id  uuid not null references public.convenios(id) on delete cascade,
  nombre       text,
  rol          text,
  telefono     text,
  email        text,
  -- Donde se presenta: puede ser un portal web o una direccion fisica.
  portal_url   text,
  direccion    text,
  notas        text,
  principal    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists convenio_contactos_conv on public.convenio_contactos (convenio_id);

comment on table public.convenio_contactos is
  'Donde se presenta y quien atiende. portal_url es un link para abrir a mano: '
  'NO hay integracion con ningun portal de obra social y no la va a haber acá.';

-- ── A.4 · EL HISTÓRICO ──────────────────────────────────────────────────────
--
-- Cuándo se firmó, si cambió el porcentaje, desde cuándo.
--
-- Importa por una razón concreta: un débito de hace cuatro meses se evalúa con
-- la cobertura que estaba vigente entonces, no con la de hoy. Sin histórico,
-- cambiar un porcentaje reescribe el pasado.

create table if not exists public.convenio_historico (
  id             uuid primary key default gen_random_uuid(),
  convenio_id    uuid not null references public.convenios(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  -- Desde cuando vale el valor nuevo. Puede ser anterior a la fecha de carga:
  -- un convenio cambia el porcentaje en marzo y alguien lo carga en mayo.
  desde          date not null default current_date,
  por_que        text,
  registrado_por uuid references auth.users(id) on delete set null,
  registrado_at  timestamptz not null default now()
);

create index if not exists convenio_historico_conv on public.convenio_historico (convenio_id, desde desc);

comment on table public.convenio_historico is
  'Que cambio de un convenio y desde cuando. Un debito viejo se evalua con la '
  'cobertura vigente en su momento: sin esto, cambiar un porcentaje reescribe '
  'el pasado.';

-- El histórico se escribe solo para los campos que cambian la plata. Los demás
-- (teléfono, notas) no hacen falta: nadie reclama por un teléfono viejo.
create or replace function public.tg_convenio_historico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campo text;
  v_ant text;
  v_nue text;
begin
  foreach v_campo in array array[
    'cobertura_general_pct', 'plazo_presentacion_dias', 'plazo_pago_dias',
    'troquel', 'periodicidad', 'modo_presentacion', 'dia_cierre', 'activo'
  ] loop
    execute format('select ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      into v_ant, v_nue using old, new;
    if v_ant is distinct from v_nue then
      insert into public.convenio_historico (convenio_id, campo, valor_anterior, valor_nuevo, registrado_por)
      values (new.id, v_campo, v_ant, v_nue, auth.uid());
    end if;
  end loop;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists convenios_historico on public.convenios;
create trigger convenios_historico
  before update on public.convenios
  for each row execute function public.tg_convenio_historico();

-- ── LO QUE SABE EL PADRÓN HOY ───────────────────────────────────────────────
--
-- Cuánto del padrón está realmente cargado. Lo usa la pantalla para no decir
-- «0 convenios al día» cuando lo que pasa es que no hay ninguno cargado.

create or replace function public.convenios_estado()
returns table (
  total                  integer,
  activos                integer,
  sin_plazo_presentacion integer,
  sin_plazo_pago         integer,
  sin_cobertura          integer,
  sin_requisitos         integer,
  sin_contacto           integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    count(*)::int,
    count(*) filter (where activo)::int,
    count(*) filter (where plazo_presentacion_dias is null)::int,
    count(*) filter (where plazo_pago_dias is null)::int,
    count(*) filter (where cobertura_general_pct is null
                       and not exists (select 1 from convenio_cobertura c where c.convenio_id = v.id))::int,
    count(*) filter (where not exists (select 1 from convenio_requisitos r where r.convenio_id = v.id))::int,
    count(*) filter (where not exists (select 1 from convenio_contactos k where k.convenio_id = v.id))::int
  from convenios v;
$$;

comment on function public.convenios_estado() is
  'Cuanto del padron esta cargado de verdad. La pantalla lo usa para distinguir '
  '«ningun convenio tiene problemas» de «no hay ningun convenio».';

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- El padrón es de la empresa: las obras sociales no son de una sucursal. Lo ve
-- cualquiera que tenga el módulo `convenios`; lo edita quien pueda crear.
--
-- NO se usa `FOR ALL`: en la v0.97 había 130 políticas `FOR ALL` que además
-- daban SELECT y anulaban el filtro por sucursal. Una política por operación.

alter table public.convenios            enable row level security;
alter table public.convenio_cobertura    enable row level security;
alter table public.convenio_requisitos   enable row level security;
alter table public.convenio_contactos    enable row level security;
alter table public.convenio_historico    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['convenios','convenio_cobertura','convenio_requisitos',
                           'convenio_contactos','convenio_historico'] loop
    execute format('drop policy if exists %I_ver on public.%I', t, t);
    execute format($p$create policy %I_ver on public.%I for select to authenticated
                     using ((select hub_puede_ver('convenios')))$p$, t, t);

    execute format('drop policy if exists %I_crear on public.%I', t, t);
    execute format($p$create policy %I_crear on public.%I for insert to authenticated
                     with check ((select hub_puede('convenios','crear')))$p$, t, t);

    execute format('drop policy if exists %I_editar on public.%I', t, t);
    execute format($p$create policy %I_editar on public.%I for update to authenticated
                     using ((select hub_puede('convenios','editar')))
                     with check ((select hub_puede('convenios','editar')))$p$, t, t);

    execute format('drop policy if exists %I_borrar on public.%I', t, t);
    execute format($p$create policy %I_borrar on public.%I for delete to authenticated
                     using ((select hub_puede('convenios','eliminar')))$p$, t, t);
  end loop;
end $$;

-- El histórico no se edita ni se borra: es el registro de lo que pasó. Las dos
-- políticas de arriba se sacan para esta tabla puntual.
drop policy if exists convenio_historico_editar on public.convenio_historico;
drop policy if exists convenio_historico_borrar on public.convenio_historico;

-- Los permisos, después del último `create or replace`: una función nueva nace
-- con EXECUTE para PUBLIC y `create or replace` conserva la ACL vieja.
revoke all on function public.convenios_estado() from public, anon;
grant execute on function public.convenios_estado() to authenticated, service_role;
