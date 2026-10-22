-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0209 · LA PRESENTACIÓN, POR OBRA SOCIAL Y POR SUCURSAL                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── EL LÍMITE, EN LA TABLA QUE MÁS TIENTA ───────────────────────────────────
--
-- `convenio_comprobantes` es la tabla donde aparece la tentación. Un
-- comprobante de receta TIENE un paciente y un médico en el papel. Acá no.
--
-- Lo que se guarda: número de comprobante, fecha, obra social, sucursal,
-- importes y qué productos se despacharon. Eso alcanza para presentar y para
-- reclamar un débito, que es todo lo que este sistema hace.
--
-- Lo que NO existe como columna, y no es un olvido: nombre, apellido,
-- documento, número de afiliado, plan, diagnóstico, matrícula del médico,
-- nombre del médico. Regla de oro 9.
--
-- `importe_particular` es la parte que paga el que se lleva el remedio. Es un
-- IMPORTE, no una persona: se llama así a propósito para que nadie lo confunda
-- con un campo de afiliado.
--
-- ── POR QUÉ LA SUCURSAL ES OBLIGATORIA ──────────────────────────────────────
--
-- Regla de oro 8. Y además: un débito sin sucursal no se puede atribuir, y la
-- mitad del valor del bloque C es poder decir «esta sucursal tiene el triple
-- de débitos por troquel faltante que las otras tres».
--
-- Incluso cuando el convenio pide presentación CONSOLIDADA, el comprobante
-- tiene su sucursal: la presentación se arma junta y el origen se conserva.

do $$ begin
  create type convenio_presentacion_estado as enum (
    'borrador', 'armada', 'enviada', 'liquidada', 'cerrada'
  );
exception when duplicate_object then null; end $$;

-- B.3 · por qué un comprobante queda afuera. Catálogo y no texto libre: lo que
-- importa es poder contar cuántos quedaron afuera por cada motivo.
do $$ begin
  create type convenio_exclusion as enum (
    'fuera_de_plazo', 'falta_troquel', 'falta_firma', 'fuera_de_vademecum',
    'sin_autorizacion', 'importe_en_cero', 'duplicado', 'otro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type convenio_comprobante_estado as enum (
    'sin_presentar', 'en_presentacion', 'presentado', 'debitado', 'cobrado', 'excluido'
  );
exception when duplicate_object then null; end $$;

-- ── B.1 · UNA PRESENTACIÓN ES UN OBJETO ─────────────────────────────────────

create table if not exists public.convenio_presentaciones (
  id                    uuid primary key default gen_random_uuid(),
  convenio_id           uuid not null references public.convenios(id) on delete restrict,
  -- Regla de oro 8: obligatoria. Ver el encabezado.
  sucursal_id           uuid not null references public.sucursales(id) on delete restrict,
  periodo_desde         date not null,
  periodo_hasta         date not null,
  estado                convenio_presentacion_estado not null default 'borrador',
  fecha_envio           date,
  -- Quién la armó y quién la revisó. Dos personas distintas cuando se puede:
  -- es el mismo criterio que la regla de oro 5, y en el bloque C sirve para
  -- ver si los débitos se concentran en quien arma.
  armada_por            uuid references auth.users(id) on delete set null,
  armada_at             timestamptz,
  revisada_por          uuid references auth.users(id) on delete set null,
  revisada_at           timestamptz,
  -- El total lo escribe `convenio_presentacion_recalcular`, no una pantalla:
  -- un total tipeado a mano no cuadra con los comprobantes que tiene adentro.
  total_declarado       numeric(14,2),
  cantidad_comprobantes integer,
  -- B.6 · la tarea de control que genera al enviarse.
  tarea_control_id      uuid references public.tareas(id) on delete set null,
  notas                 text,
  es_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null,
  check (periodo_hasta >= periodo_desde)
);

create index if not exists convenio_pres_conv on public.convenio_presentaciones (convenio_id, periodo_desde desc);
create index if not exists convenio_pres_suc on public.convenio_presentaciones (sucursal_id, periodo_desde desc);
-- Una sola presentación por convenio, sucursal y período: dos presentaciones
-- del mismo período es plata contada dos veces.
create unique index if not exists convenio_pres_unica
  on public.convenio_presentaciones (convenio_id, sucursal_id, periodo_desde, periodo_hasta);

comment on table public.convenio_presentaciones is
  'Una presentacion a una obra social, por sucursal y periodo. sucursal_id es NOT NULL por la regla de oro 8 y porque un debito sin sucursal no se puede atribuir. total_declarado lo escribe la base, no la pantalla.';

-- ── B.2 · QUÉ ENTRA: EL COMPROBANTE ─────────────────────────────────────────

create table if not exists public.convenio_comprobantes (
  id                 uuid primary key default gen_random_uuid(),
  convenio_id        uuid not null references public.convenios(id) on delete restrict,
  sucursal_id        uuid not null references public.sucursales(id) on delete restrict,
  -- Null mientras no entró a ninguna presentación. B.3: los que no entran NO
  -- desaparecen, quedan acá con presentacion_id en null y su motivo.
  presentacion_id    uuid references public.convenio_presentaciones(id) on delete set null,

  numero             text not null,
  fecha              date not null,
  importe_total      numeric(14,2) not null,
  -- Lo que cubre la obra social y lo que paga el que se lleva el remedio.
  -- `importe_particular` es un IMPORTE: no hay ninguna columna de persona.
  importe_cobertura  numeric(14,2),
  importe_particular numeric(14,2),

  estado             convenio_comprobante_estado not null default 'sin_presentar',
  -- B.3 · por qué quedó afuera, si quedó.
  motivo_exclusion   convenio_exclusion,
  exclusion_detalle  text,

  cargado_por        uuid references auth.users(id) on delete set null,
  es_demo            boolean not null default false,
  created_at         timestamptz not null default now(),

  -- Un comprobante excluido tiene que decir por qué. Lo contrario es una fila
  -- que desapareció de la presentación sin explicación.
  check (estado <> 'excluido' or motivo_exclusion is not null)
);

create index if not exists convenio_comp_pres on public.convenio_comprobantes (presentacion_id);
create index if not exists convenio_comp_conv on public.convenio_comprobantes (convenio_id, fecha desc);
create index if not exists convenio_comp_suc on public.convenio_comprobantes (sucursal_id, fecha desc);
create unique index if not exists convenio_comp_unico
  on public.convenio_comprobantes (convenio_id, sucursal_id, numero);

comment on table public.convenio_comprobantes is
  'El comprobante de la receta: numero, fecha, obra social, sucursal e importes. NO tiene paciente, afiliado, medico ni diagnostico, y no es un olvido: es la regla de oro 9. importe_particular es un importe, no una persona.';
comment on column public.convenio_comprobantes.importe_particular is
  'Lo que paga quien se lleva el remedio. Es un importe. No identifica a nadie.';

create table if not exists public.convenio_comprobante_items (
  id              uuid primary key default gen_random_uuid(),
  comprobante_id  uuid not null references public.convenio_comprobantes(id) on delete cascade,
  -- Null cuando el SKU no cruzó con el catálogo. Se guarda lo leído igual: un
  -- renglón sin match es un renglón que existe.
  producto_id     uuid references public.productos_catalogo(id) on delete set null,
  sku_leido       text,
  nombre_leido    text,
  cantidad        numeric(12,3) not null default 1,
  precio_unitario numeric(14,4),
  importe         numeric(14,2),
  cobertura_pct   numeric(5,2),
  created_at      timestamptz not null default now()
);

create index if not exists convenio_comp_items_comp on public.convenio_comprobante_items (comprobante_id);

comment on table public.convenio_comprobante_items is
  'Que se despacho y a que precio. Sin esto un debito por fuera de vademecum no se puede discutir producto por producto.';

-- ── B.4 · LOS TROQUELES ─────────────────────────────────────────────────────
--
-- Es lo que después define si un débito es RECLAMABLE. Un débito por troquel
-- faltante con acuse de recibo del remito se reclama; sin acuse, no hay con
-- qué discutir.
--
-- Por eso el acuse es una columna y no una nota, y por eso hay foto.

create table if not exists public.convenio_troqueles (
  id              uuid primary key default gen_random_uuid(),
  presentacion_id uuid not null references public.convenio_presentaciones(id) on delete cascade,
  cantidad        integer,
  remito_numero   text,
  transporte      text,
  enviado_at      date,
  enviado_por     uuid references auth.users(id) on delete set null,
  foto_remito_url text,
  -- El acuse: lo que convierte un débito en reclamable.
  acuse_at        date,
  acuse_por       uuid references auth.users(id) on delete set null,
  acuse_foto_url  text,
  notas           text,
  created_at      timestamptz not null default now()
);

create index if not exists convenio_troqueles_pres on public.convenio_troqueles (presentacion_id);

comment on table public.convenio_troqueles is
  'Que troqueles se mandaron, con que remito y con que acuse. El acuse es lo que define si un debito por troquel faltante es reclamable: sin acuse no hay con que discutir.';

-- ── EL TOTAL LO CALCULA LA BASE ─────────────────────────────────────────────
--
-- `total_declarado` no se tipea. Un total escrito a mano que no cuadra con sus
-- comprobantes es exactamente la clase de número que nadie revisa hasta que la
-- obra social lo debita entero.

create or replace function public.convenio_presentacion_recalcular(p_presentacion uuid)
returns table (cantidad integer, total numeric)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_cant int;
  v_total numeric;
begin
  select count(*)::int, coalesce(sum(coalesce(importe_cobertura, importe_total)), 0)
    into v_cant, v_total
    from convenio_comprobantes
   where presentacion_id = p_presentacion
     and estado <> 'excluido';

  update convenio_presentaciones
     set cantidad_comprobantes = v_cant, total_declarado = v_total
   where id = p_presentacion;

  return query select v_cant, v_total;
end $$;

comment on function public.convenio_presentacion_recalcular(uuid) is
  'Recalcula cantidad y total de una presentacion desde sus comprobantes. El total nunca se tipea a mano.';

-- ── B.6 · LA TAREA DE CONTROL ───────────────────────────────────────────────
--
-- Regla de oro 5: toda tarea completada genera tarea de control. Enviar una
-- presentación es completar una tarea.
--
-- ── POR QUÉ ES UNA FUNCIÓN Y NO UN TRIGGER ──────────────────────────────────
--
-- Porque el que envía necesita que la respuesta le diga qué tarea se creó, y
-- porque un rechazo tiene que llegar con su explicación. En la v0.98 un
-- trigger escribía el registro y después lanzaba la excepción que lo
-- revertía: acá el rechazo se DEVUELVE, no se lanza.

create or replace function public.convenio_presentacion_enviar(
  p_presentacion uuid,
  p_fecha_envio date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  p record;
  v_conv text;
  v_suc text;
  v_resp uuid;
  v_tarea uuid;
  v_codigo text;
  v_cant int;
  v_total numeric;
begin
  select * into p from convenio_presentaciones where id = p_presentacion;
  if p.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'la presentacion no existe');
  end if;
  if p.estado in ('enviada', 'liquidada', 'cerrada') then
    return jsonb_build_object('ok', false, 'motivo',
      'esta presentacion ya se envio el ' || coalesce(p.fecha_envio::text, '(sin fecha)') ||
      '. Una presentacion enviada no se vuelve a enviar: se corrige con una nota.');
  end if;

  select cantidad, total into v_cant, v_total
    from convenio_presentacion_recalcular(p_presentacion);

  if coalesce(v_cant, 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo',
      'la presentacion no tiene ningun comprobante adentro. Mandar una presentacion vacia es perder el periodo entero.');
  end if;

  select nombre into v_conv from convenios where id = p.convenio_id;
  select nombre into v_suc from sucursales where id = p.sucursal_id;

  -- El control lo hace el encargado de ESA sucursal. Si no hay uno asignado,
  -- la tarea queda al pool de la sucursal: sin dueño no se hace nunca, pero
  -- inventarle un dueño de otra sucursal es peor.
  select id into v_resp from users_admin
   where activo and sucursal_id = p.sucursal_id
     and rol in ('encargado_sucursal', 'sucursal')
   order by rol limit 1;

  v_codigo := 'OS-' || to_char(now(), 'YYMMDD') || '-' || substr(p_presentacion::text, 1, 4);

  insert into tareas (
    codigo, tipo_origen, titulo, descripcion, prioridad, estado,
    asignacion_tipo, responsable_id, rol_destinatario, sucursal_id,
    entidad_relacionada, entidad_id, entidad_url,
    verificacion_humana, fecha_vencimiento, creado_por_nombre, es_demo
  ) values (
    v_codigo, 'auto_sistema'::tarea_origen,
    'Controlar la presentacion de ' || v_conv || ' — ' || v_suc,
    'Se envio la presentacion de ' || v_conv || ' de ' || v_suc ||
    ' por el periodo ' || p.periodo_desde || ' a ' || p.periodo_hasta ||
    ': ' || v_cant || ' comprobantes por $' || to_char(round(v_total), 'FM999G999G999') || '.' ||
    E'\n\nQue hay que controlar: que los troqueles se hayan mandado con remito y que el acuse ' ||
    'este guardado. Sin acuse, un debito por troquel faltante no se puede reclamar.',
    -- Los casts son obligatorios: `estado`, `prioridad` y `asignacion_tipo`
    -- son enums, y un `case ... end` devuelve text. Sin esto el insert falla
    -- con «column estado is of type tarea_estado but expression is of type
    -- text» — lo encontró scripts/prueba-convenios.ts en su primera corrida.
    'alta'::tarea_prioridad,
    (case when v_resp is null then 'pendiente' else 'asignada' end)::tarea_estado,
    (case when v_resp is null then 'pool_sucursal' else 'usuario_especifico' end)::tarea_asignacion,
    v_resp,
    case when v_resp is null then 'encargado_sucursal' else null end,
    p.sucursal_id,
    'convenio_presentacion', p_presentacion,
    '/admin/convenios/presentaciones/' || p_presentacion::text,
    true, (current_date + 3)::timestamptz, 'NORA · Convenios', p.es_demo
  ) returning id into v_tarea;

  update convenio_presentaciones
     set estado = 'enviada',
         fecha_envio = coalesce(p_fecha_envio, current_date),
         tarea_control_id = v_tarea
   where id = p_presentacion;

  update convenio_comprobantes
     set estado = 'presentado'
   where presentacion_id = p_presentacion and estado <> 'excluido';

  return jsonb_build_object(
    'ok', true, 'tarea_id', v_tarea, 'tarea_codigo', v_codigo,
    'comprobantes', v_cant, 'total', v_total,
    'control', case when v_resp is null
      then 'La tarea de control quedo al pool de la sucursal: no hay encargado asignado.'
      else 'La tarea de control quedo asignada al encargado de la sucursal.' end
  );
end $$;

comment on function public.convenio_presentacion_enviar(uuid, date) is
  'Envia una presentacion y genera la tarea de control (regla de oro 5). Devuelve el motivo del rechazo en vez de lanzar excepcion, para que el rechazo quede registrado y no se revierta.';

-- ── B.5 · EL AVISO ANTES DEL CIERRE ─────────────────────────────────────────
--
-- Qué convenio cierra pronto y no tiene la presentación armada, por sucursal.
-- La anticipación sale de `convenios.aviso_dias_antes`: un convenio que exige
-- troquel físico necesita más días que uno digital.
--
-- `cierre` en null cuando no se puede saber, con el motivo al lado. Sin
-- periodicidad ni día de cierre no hay fecha, y una fecha inventada hace que
-- el aviso suene el día equivocado.

create or replace view public.convenio_cierres_proximos
with (security_invoker = true)
as
with calend as (
  select
    c.id as convenio_id, c.nombre as convenio, c.aviso_dias_antes,
    c.periodicidad, c.dia_cierre, c.modo_presentacion, c.troquel,
    s.id as sucursal_id, s.nombre as sucursal,
    case
      when c.periodicidad is null or c.dia_cierre is null then null
      else (
        select case when d >= current_date then d else d2 end
        from (
          select
            make_date(
              extract(year from current_date)::int, extract(month from current_date)::int,
              least(c.dia_cierre, extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int)
            ) as d,
            make_date(
              extract(year from (current_date + interval '1 month'))::int,
              extract(month from (current_date + interval '1 month'))::int,
              least(c.dia_cierre, extract(day from (date_trunc('month', current_date + interval '1 month') + interval '1 month - 1 day'))::int)
            ) as d2
        ) x
      )
    end as cierre
  from convenios c
  cross join sucursales s
  where c.activo and s.activa and not s.es_ecommerce
    -- Un convenio consolidado no se presenta por sucursal: el aviso va una
    -- sola vez, a la central. Si no se sabe el modo, se avisa por sucursal,
    -- que es lo conservador.
    and (c.modo_presentacion is distinct from 'consolidada' or s.codigo = 'SA-01')
)
select
  k.convenio_id, k.convenio, k.sucursal_id, k.sucursal,
  k.cierre,
  case when k.cierre is null then null else (k.cierre - current_date)::int end as dias,
  k.aviso_dias_antes,
  k.troquel,
  case
    when k.cierre is null then 'no se puede calcular: ' ||
      case when k.periodicidad is null then 'falta cada cuanto se presenta'
           else 'falta el dia de cierre' end
    else null
  end as por_que_no_se_sabe,
  exists (
    select 1 from convenio_presentaciones p
     where p.convenio_id = k.convenio_id and p.sucursal_id = k.sucursal_id
       and p.estado <> 'borrador'
       and k.cierre between p.periodo_desde and p.periodo_hasta + 45
  ) as ya_presentada,
  (select count(*) from convenio_comprobantes cc
    where cc.convenio_id = k.convenio_id and cc.sucursal_id = k.sucursal_id
      and cc.presentacion_id is null and cc.estado = 'sin_presentar') as comprobantes_sueltos
from calend k;

comment on view public.convenio_cierres_proximos is
  'Que convenio cierra pronto, por sucursal, y si ya esta presentado. cierre en null = no se puede calcular, con el motivo: una fecha inventada hace que el aviso suene el dia equivocado.';

-- ── RLS: EL ENCARGADO VE LO DE SU SUCURSAL ──────────────────────────────────
--
-- F.2 · Un encargado ve las presentaciones de SU sucursal. El módulo
-- `convenios` habilita el sector; `hub_ve_sucursal` acota la fila.
--
-- Una política por operación. No `FOR ALL`: en la v0.97 había 130 que además
-- daban SELECT y anulaban el filtro por sucursal.

alter table public.convenio_presentaciones    enable row level security;
alter table public.convenio_comprobantes      enable row level security;
alter table public.convenio_comprobante_items enable row level security;
alter table public.convenio_troqueles         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['convenio_presentaciones','convenio_comprobantes'] loop
    execute format('drop policy if exists %I_ver on public.%I', t, t);
    execute format($p$create policy %I_ver on public.%I for select to authenticated
      using ((select hub_puede_ver('convenios')) and (select hub_ve_sucursal(sucursal_id)))$p$, t, t);

    execute format('drop policy if exists %I_crear on public.%I', t, t);
    execute format($p$create policy %I_crear on public.%I for insert to authenticated
      with check ((select hub_puede('convenios','crear')) and (select hub_ve_sucursal(sucursal_id)))$p$, t, t);

    execute format('drop policy if exists %I_editar on public.%I', t, t);
    execute format($p$create policy %I_editar on public.%I for update to authenticated
      using ((select hub_puede('convenios','editar')) and (select hub_ve_sucursal(sucursal_id)))
      with check ((select hub_puede('convenios','editar')) and (select hub_ve_sucursal(sucursal_id)))$p$, t, t);

    execute format('drop policy if exists %I_borrar on public.%I', t, t);
    execute format($p$create policy %I_borrar on public.%I for delete to authenticated
      using ((select hub_puede('convenios','eliminar')) and (select hub_ve_sucursal(sucursal_id)))$p$, t, t);
  end loop;
end $$;

-- Items y troqueles: la sucursal la heredan del padre. Se mira ahí en vez de
-- duplicar la columna, que es lo que se desincroniza.
drop policy if exists convenio_comprobante_items_ver on public.convenio_comprobante_items;
create policy convenio_comprobante_items_ver on public.convenio_comprobante_items
  for select to authenticated using (
    exists (select 1 from convenio_comprobantes c
             where c.id = comprobante_id
               and (select hub_puede_ver('convenios'))
               and (select hub_ve_sucursal(c.sucursal_id))));

drop policy if exists convenio_comprobante_items_crear on public.convenio_comprobante_items;
create policy convenio_comprobante_items_crear on public.convenio_comprobante_items
  for insert to authenticated with check (
    exists (select 1 from convenio_comprobantes c
             where c.id = comprobante_id
               and (select hub_puede('convenios','crear'))
               and (select hub_ve_sucursal(c.sucursal_id))));

drop policy if exists convenio_comprobante_items_borrar on public.convenio_comprobante_items;
create policy convenio_comprobante_items_borrar on public.convenio_comprobante_items
  for delete to authenticated using (
    exists (select 1 from convenio_comprobantes c
             where c.id = comprobante_id
               and (select hub_puede('convenios','eliminar'))
               and (select hub_ve_sucursal(c.sucursal_id))));

drop policy if exists convenio_troqueles_ver on public.convenio_troqueles;
create policy convenio_troqueles_ver on public.convenio_troqueles
  for select to authenticated using (
    exists (select 1 from convenio_presentaciones p
             where p.id = presentacion_id
               and (select hub_puede_ver('convenios'))
               and (select hub_ve_sucursal(p.sucursal_id))));

drop policy if exists convenio_troqueles_crear on public.convenio_troqueles;
create policy convenio_troqueles_crear on public.convenio_troqueles
  for insert to authenticated with check (
    exists (select 1 from convenio_presentaciones p
             where p.id = presentacion_id
               and (select hub_puede('convenios','crear'))
               and (select hub_ve_sucursal(p.sucursal_id))));

drop policy if exists convenio_troqueles_editar on public.convenio_troqueles;
create policy convenio_troqueles_editar on public.convenio_troqueles
  for update to authenticated
  using (
    exists (select 1 from convenio_presentaciones p
             where p.id = presentacion_id
               and (select hub_puede('convenios','editar'))
               and (select hub_ve_sucursal(p.sucursal_id))))
  with check (
    exists (select 1 from convenio_presentaciones p
             where p.id = presentacion_id
               and (select hub_puede('convenios','editar'))
               and (select hub_ve_sucursal(p.sucursal_id))));

-- ── EL BUCKET DE LAS FOTOS ──────────────────────────────────────────────────
--
-- Privado. El remito y el acuse son la prueba ante un tercero: si se pierden,
-- un débito por troquel faltante deja de ser reclamable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('convenios-troqueles', 'convenios-troqueles', false, 12582912,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists convenios_troqueles_leer on storage.objects;
create policy convenios_troqueles_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'convenios-troqueles' and (select public.hub_puede_ver('convenios')));

drop policy if exists convenios_troqueles_subir on storage.objects;
create policy convenios_troqueles_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'convenios-troqueles' and (select public.hub_puede('convenios','crear')));

-- Los permisos, después del último `create or replace`.
revoke all on function public.convenio_presentacion_recalcular(uuid) from public, anon;
revoke all on function public.convenio_presentacion_enviar(uuid, date) from public, anon;
grant execute on function public.convenio_presentacion_recalcular(uuid) to authenticated, service_role;
grant execute on function public.convenio_presentacion_enviar(uuid, date) to authenticated, service_role;
