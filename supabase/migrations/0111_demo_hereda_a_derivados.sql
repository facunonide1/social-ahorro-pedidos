-- 0111 · La marca de demostración viaja a lo derivado (v0.81)
--
-- ── EL PROBLEMA ────────────────────────────────────────────────────────────
--
-- En v0.80 se marcaron los datos de demostración en su origen y el panel
-- aprendió a filtrarlos. El lente tapó el 97%. El 3% que quedaba eran tres
-- avisos que decían «Quedaron 859 u. de Combo cuidado personal»: avisos
-- calculados a partir de ofertas de demostración, guardados en una fila que no
-- decía nada de eso.
--
-- Un aviso derivado de un dato inventado es un dato inventado, aunque la fila
-- donde vive no lo diga.
--
-- ── POR QUÉ NO SE MARCAN LOS TRES A MANO ───────────────────────────────────
--
-- Porque el que filtró no fue el auditor —que sí propaga la marca en sus ocho
-- reglas— sino un productor distinto (lib/ofertas/al-finalizar.ts) que nadie
-- recordó. El próximo productor tampoco se va a acordar. Marcar los tres a mano
-- deja el agujero abierto para el cuarto.
--
-- Entonces la herencia se resuelve donde no se puede olvidar: un trigger que,
-- al insertar, va a buscar la marca a la fuente que la fila ya declara.
--
-- ── ALCANCE ────────────────────────────────────────────────────────────────
--
-- Aplica a las dos tablas de derivados que referencian UNA fila de origen:
-- `nora_avisos` (entidad_ref jsonb) y `notificaciones_admin` (entidad_relacionada
-- + entidad_id). Las tablas de métricas agregadas (por sucursal y fecha) no
-- tienen una fila de origen: no heredan de acá, se frenan en el bloque B.

-- ── 1 · La libreta de equivalencias ────────────────────────────────────────
--
-- `nora_avisos` guarda el nombre real de la tabla ('ofertas', 'clientes').
-- `notificaciones_admin` guarda una etiqueta de negocio ('vencimiento',
-- 'conteo', 'reclamo_proveedor') que casi siempre apunta a una tarea. Traducir
-- eso adivinando sería inventar; queda escrito como dato, se corrige sin tocar
-- código, y lo que no esté acá NO se marca solo: queda visible y se reporta.
create table if not exists public.demo_origen_ref (
  etiqueta text primary key,
  tabla    text not null,
  nota     text
);

comment on table public.demo_origen_ref is
  'Traduce la etiqueta de una notificación a la tabla donde vive su origen, para que la marca de demostración se herede. Agregar una fila alcanza: no hace falta tocar código.';

insert into public.demo_origen_ref (etiqueta, tabla, nota) values
  ('tarea',                'tareas',             'genérica'),
  ('vencimiento',          'tareas',             'la notificación apunta a la tarea de baja, no al vencimiento'),
  ('transferencia',        'tareas',             'idem: apunta a la tarea de recepción'),
  ('devolucion_drogueria', 'tareas',             null),
  ('reclamo_proveedor',    'tareas',             null),
  ('conciliacion',         'tareas',             null),
  ('producto',             'tareas',             'corrección de stock pedida a SIFACO (v0.80)'),
  ('conteo',               'tareas',             null),
  ('export_sifaco',        'tareas',             null),
  ('recartelado',          'listas_recartelado', 'la única que no apunta a tareas')
on conflict (etiqueta) do nothing;

-- ── 2 · Ir a buscar la marca a la fuente ───────────────────────────────────
--
-- Devuelve NULL —no false— cuando no se puede resolver. La diferencia importa:
-- false es «lo miré y es real», NULL es «no pude mirar». Lo segundo deja el
-- valor como vino y se puede contar después.
create or replace function public.demo_fuente_es_demo(p_ref text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tabla text;
  v_res   boolean;
begin
  if p_ref is null or p_id is null then
    return null;
  end if;

  -- Si la referencia ya es una tabla con `es_demo`, se usa tal cual.
  -- Si no, se busca en la libreta.
  select p_ref into v_tabla
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_ref and column_name = 'es_demo'
  );

  if v_tabla is null then
    select r.tabla into v_tabla
    from public.demo_origen_ref r
    where r.etiqueta = p_ref
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tabla and column_name = 'es_demo'
      );
  end if;

  if v_tabla is null then
    return null;
  end if;

  -- %I cita el identificador: la tabla ya se validó contra el catálogo arriba.
  execute format('select es_demo from public.%I where id = $1', v_tabla)
    into v_res using p_id;

  return v_res;
end $$;

-- ── 3 · El trigger, uno solo para las dos formas de referencia ─────────────
--
-- TG_ARGV[0] = columna con el nombre/etiqueta de la fuente, o 'jsonb'
-- TG_ARGV[1] = columna con el id, o el nombre de la columna jsonb
--
-- Nunca desmarca: si la fila ya venía en true, se respeta. Un productor que
-- sabe que su dato es de demostración sabe más que esta función.
create or replace function public.demo_heredar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_id  uuid;
  v_res boolean;
begin
  if coalesce(new.es_demo, false) then
    return new;
  end if;

  if TG_ARGV[0] = 'jsonb' then
    execute format('select ($1.%I)->>''tabla'', (($1.%I)->>''id'')::uuid', TG_ARGV[1], TG_ARGV[1])
      into v_ref, v_id using new;
  else
    execute format('select $1.%I, $1.%I', TG_ARGV[0], TG_ARGV[1])
      into v_ref, v_id using new;
  end if;

  v_res := public.demo_fuente_es_demo(v_ref, v_id);
  if v_res is true then
    new.es_demo := true;
  end if;

  return new;
end $$;

-- ── 4 · La columna que le faltaba a la campana ─────────────────────────────
alter table public.notificaciones_admin
  add column if not exists es_demo boolean not null default false;

-- ── 5 · Enganchar ──────────────────────────────────────────────────────────
drop trigger if exists nora_avisos_hereda_demo on public.nora_avisos;
create trigger nora_avisos_hereda_demo
  before insert or update of entidad_ref on public.nora_avisos
  for each row execute function public.demo_heredar('jsonb', 'entidad_ref');

drop trigger if exists notificaciones_admin_hereda_demo on public.notificaciones_admin;
create trigger notificaciones_admin_hereda_demo
  before insert or update of entidad_id on public.notificaciones_admin
  for each row execute function public.demo_heredar('entidad_relacionada', 'entidad_id');

-- ── 6 · Aplicar la regla a lo que ya estaba ────────────────────────────────
--
-- No es marcar a mano: es la misma función corriendo sobre las filas viejas.
update public.nora_avisos
   set es_demo = true
 where not es_demo
   and public.demo_fuente_es_demo(entidad_ref->>'tabla', (entidad_ref->>'id')::uuid) is true;

update public.notificaciones_admin
   set es_demo = true
 where not es_demo
   and public.demo_fuente_es_demo(entidad_relacionada, entidad_id) is true;

create index if not exists notificaciones_admin_demo_idx
  on public.notificaciones_admin(es_demo) where es_demo;
