-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0210 · LOS DÉBITOS                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Una farmacia puede estar perdiendo del 3% al 8% de su facturación en débitos
-- que nunca reclamó. Nadie los cuenta porque llegan en un papel, se miran una
-- vez y se archivan.
--
-- ── POR QUÉ EL MOTIVO ES UN CATÁLOGO Y NO TEXTO LIBRE ───────────────────────
--
-- Porque lo único que sirve es poder sumarlos por motivo. «Troquel faltante»
-- escrito de nueve formas distintas son nueve motivos de uno, y la pregunta
-- que importa —cuál es el motivo que más plata se lleva— no se puede
-- contestar.
--
-- El texto original NO se tira: va en `motivo_texto_original`. Lo que no se
-- entiende cae en `otro` con el texto, y queda a la vista para que alguien lo
-- clasifique. Lo que no se hace es inventarle un motivo para que encaje.
--
-- ── Y EL LÍMITE ─────────────────────────────────────────────────────────────
--
-- `afiliado_de_baja` es el nombre de un MOTIVO del catálogo: es lo que dice la
-- obra social. No hay ninguna fila que identifique a un afiliado, ni columna
-- donde ponerlo. Regla de oro 9.

-- ── C.2 · EL CATÁLOGO DE MOTIVOS ────────────────────────────────────────────
--
-- `reclamable` tiene tres valores y no dos:
--
--   si      · se reclama siempre (dentro del plazo)
--   no      · no hay nada que discutir: el débito es correcto
--   depende · depende de una prueba que puede estar o no — el acuse del remito
--             de troqueles, típicamente
--
-- El tercer valor es el que hace que esto sirva. Un débito por troquel
-- faltante con acuse se reclama; el mismo débito sin acuse, no. Sin «depende»,
-- o se reclaman todos (y se pierde tiempo) o ninguno (y se pierde plata).

do $$ begin
  create type convenio_reclamable as enum ('si', 'no', 'depende');
exception when duplicate_object then null; end $$;

create table if not exists public.convenio_debito_motivos (
  clave              text primary key,
  nombre             text not null,
  reclamable         convenio_reclamable not null,
  -- Días desde la liquidación para reclamar. Null = no se sabe, y entonces no
  -- se puede decir si venció.
  plazo_reclamo_dias integer,
  que_es             text not null,
  que_hacer          text not null,
  -- De qué depende, cuando reclamable = 'depende'.
  depende_de         text,
  orden              integer not null default 100
);

comment on table public.convenio_debito_motivos is
  'Los motivos de debito, como catalogo. reclamable tiene tres valores: si, no y depende. El tercero es el que hace que esto sirva: un troquel faltante con acuse se reclama y sin acuse no.';

insert into public.convenio_debito_motivos
  (clave, nombre, reclamable, plazo_reclamo_dias, que_es, que_hacer, depende_de, orden)
values
  ('troquel_faltante', 'Troquel faltante', 'depende', 30,
   'La obra social dice que el troquel no llego o no estaba pegado.',
   'Si el envio de troqueles de esa presentacion tiene acuse de recibo, se reclama con la foto del remito y del acuse. Si no hay acuse, no hay con que discutir.',
   'el acuse de recibo del remito de troqueles', 10),

  ('receta_mal_cargada', 'Receta mal cargada', 'depende', 30,
   'Un dato del comprobante no coincide con lo que la obra social esperaba: numero, fecha, importe.',
   'Se compara el comprobante cargado contra lo que dice la liquidacion. Si el dato de NORA coincide con el papel, se reclama.',
   'que el comprobante cargado coincida con el papel', 20),

  ('fuera_de_vademecum', 'Fuera de vademecum', 'no', null,
   'El producto despachado no esta en la lista que cubre ese convenio.',
   'No se reclama: no estaba cubierto. Lo que si corresponde es revisar por que se despacho con cobertura, para que no vuelva a pasar.',
   null, 30),

  ('fuera_de_plazo', 'Fuera de plazo', 'no', null,
   'La presentacion entro despues del plazo que da el convenio.',
   'No se reclama. Es la perdida mas evitable de todas: lo que la evita es el aviso antes del cierre.',
   null, 40),

  ('afiliado_de_baja', 'Afiliado dado de baja', 'no', null,
   'La obra social dice que la persona no tenia cobertura activa ese dia. NORA no guarda quien es: guarda que la obra social lo debito por eso.',
   'No se reclama. Lo que corresponde es verificar la cobertura antes de despachar, que es un paso del mostrador y no de este sistema.',
   null, 50),

  ('duplicada', 'Duplicada', 'depende', 30,
   'La obra social dice que ese comprobante ya se habia presentado.',
   'Se mira si el numero aparece en otra presentacion. Si no aparece, el duplicado es de ellos y se reclama.',
   'que el numero no este en otra presentacion', 60),

  ('firma_ilegible', 'Firma ilegible o faltante', 'depende', 30,
   'Falta la conformidad firmada, o no se puede leer. NORA guarda que faltaba la firma, no quien tenia que firmar.',
   'Si la farmacia tiene el comprobante original con la firma, se reclama con una copia.',
   'que exista el comprobante original firmado', 70),

  ('sin_autorizacion_previa', 'Sin autorizacion previa', 'depende', 30,
   'El convenio pedia autorizacion antes de despachar y la liquidacion dice que no estaba.',
   'Si la autorizacion existe y tiene numero, se reclama. Si se despacho sin pedirla, no.',
   'que la autorizacion exista y tenga numero', 80),

  ('supera_el_tope', 'Supera el tope', 'no', null,
   'Se despacharon mas unidades de las que cubre el convenio por comprobante o por periodo.',
   'No se reclama lo que pasa del tope. Lo que corresponde es cargar el tope en el padron para que no vuelva a pasar.',
   null, 90),

  ('otro', 'Otro', 'depende', null,
   'El motivo que dio la obra social no coincide con ninguno de los de arriba. El texto original queda guardado tal cual vino.',
   'Hay que leer el texto original y decidir. Mientras nadie lo lea, el sistema NO dice que sea reclamable ni que no lo sea: dice que no lo sabe.',
   'que una persona lea el texto original', 999)
on conflict (clave) do update set
  nombre = excluded.nombre, reclamable = excluded.reclamable,
  plazo_reclamo_dias = excluded.plazo_reclamo_dias,
  que_es = excluded.que_es, que_hacer = excluded.que_hacer,
  depende_de = excluded.depende_de, orden = excluded.orden;

-- Ahora que el catálogo existe, el requisito de un convenio puede apuntarle.
alter table public.convenio_requisitos
  drop constraint if exists convenio_requisitos_motivo_fk;
alter table public.convenio_requisitos
  add constraint convenio_requisitos_motivo_fk
  foreign key (motivo_debito) references public.convenio_debito_motivos(clave)
  on delete set null;

-- ── C.1 · UN DÉBITO, CON SU MOTIVO ──────────────────────────────────────────

do $$ begin
  create type convenio_debito_estado as enum (
    'abierto', 'reclamado', 'recuperado', 'perdido', 'no_reclamable'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.convenio_debitos (
  id                    uuid primary key default gen_random_uuid(),
  convenio_id           uuid not null references public.convenios(id) on delete restrict,
  -- Regla de oro 8, y C.3: sin sucursal no se puede decir «esta sucursal
  -- debita el triple por troquel faltante».
  sucursal_id           uuid not null references public.sucursales(id) on delete restrict,
  presentacion_id       uuid references public.convenio_presentaciones(id) on delete set null,
  comprobante_id        uuid references public.convenio_comprobantes(id) on delete set null,

  motivo                text not null references public.convenio_debito_motivos(clave),
  -- E.2 · lo que decía el archivo, tal cual. Si el motivo cayó en `otro`, esto
  -- es lo único que permite clasificarlo después.
  motivo_texto_original text,

  importe               numeric(14,2) not null,
  fecha_liquidacion     date not null,
  liquidacion_id        uuid,

  estado                convenio_debito_estado not null default 'abierto',
  -- C.3 · quién armó la presentación de la que sale este débito. Se copia al
  -- crear el débito y no se mira por join: si la presentación se borra, la
  -- atribución no se pierde.
  --
  -- El sistema MUESTRA el número. No acusa a nadie.
  armo_presentacion     uuid references auth.users(id) on delete set null,

  notas                 text,
  es_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null
);

create index if not exists convenio_deb_conv on public.convenio_debitos (convenio_id, fecha_liquidacion desc);
create index if not exists convenio_deb_suc on public.convenio_debitos (sucursal_id, fecha_liquidacion desc);
create index if not exists convenio_deb_motivo on public.convenio_debitos (motivo);
create index if not exists convenio_deb_estado on public.convenio_debitos (estado);
create index if not exists convenio_deb_liq on public.convenio_debitos (liquidacion_id);

comment on table public.convenio_debitos is
  'Un debito: de que presentacion, de que comprobante, cuanto y por que. El motivo es del catalogo; el texto original del archivo queda en motivo_texto_original. Ninguna columna identifica a una persona.';
comment on column public.convenio_debitos.armo_presentacion is
  'Quien armo la presentacion. Sirve para ver si los debitos se concentran. El sistema muestra el numero, no acusa a nadie.';

-- ── C.4 · QUÉ SE PUEDE RECUPERAR Y HASTA CUÁNDO ─────────────────────────────
--
-- ── CÓMO SE DECIDE ──────────────────────────────────────────────────────────
--
-- Tres preguntas, en este orden:
--
--   1 · Qué dice el motivo. `no` cierra el tema: un afiliado de baja no se
--       reclama y no hay nada que mirar.
--   2 · Si el motivo dice `depende`, de qué depende. Para troquel faltante es
--       el acuse del remito: si está, reclamable; si no está, no.
--   3 · Si todavía está a tiempo. El plazo corre desde la liquidación.
--
-- Y hay un cuarto resultado que no es ni sí ni no: **null**. Cuando el motivo
-- es `otro`, o cuando no se sabe el plazo, la respuesta es «no lo puedo saber»
-- con el motivo escrito. Un `false` ahí diría «lo miré y no se puede
-- reclamar», y eso es justamente la plata que se pierde sin que nadie la mire.

create or replace function public.convenio_debito_reclamable(p_debito uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  d record;
  m record;
  v_acuse boolean;
  v_vence date;
  v_dias int;
begin
  select * into d from convenio_debitos where id = p_debito;
  if d.id is null then
    return jsonb_build_object('reclamable', null, 'por_que', 'el debito no existe');
  end if;
  select * into m from convenio_debito_motivos where clave = d.motivo;

  -- 1 · el motivo cierra el tema
  if m.reclamable = 'no' then
    return jsonb_build_object('reclamable', false, 'vence_at', null, 'por_que', m.que_hacer);
  end if;

  -- el plazo, para los dos casos que siguen
  if m.plazo_reclamo_dias is not null then
    v_vence := d.fecha_liquidacion + m.plazo_reclamo_dias;
    v_dias := v_vence - current_date;
  end if;

  -- 2 · depende de una prueba
  if m.reclamable = 'depende' then
    if d.motivo = 'troquel_faltante' then
      if d.presentacion_id is null then
        return jsonb_build_object('reclamable', null, 'vence_at', v_vence,
          'por_que', 'el debito no esta atado a ninguna presentacion, asi que no se puede saber si los troqueles tenian acuse');
      end if;
      select exists (
        select 1 from convenio_troqueles t
         where t.presentacion_id = d.presentacion_id and t.acuse_at is not null
      ) into v_acuse;
      if not v_acuse then
        return jsonb_build_object('reclamable', false, 'vence_at', v_vence,
          'por_que', 'los troqueles de esa presentacion no tienen acuse de recibo guardado: no hay con que discutir');
      end if;
      if v_dias is not null and v_dias < 0 then
        return jsonb_build_object('reclamable', false, 'vence_at', v_vence, 'dias', v_dias,
          'por_que', 'habia acuse y era reclamable, pero el plazo vencio hace ' || (-v_dias) || ' dias');
      end if;
      return jsonb_build_object('reclamable', true, 'vence_at', v_vence, 'dias', v_dias,
        'por_que', 'los troqueles de esa presentacion tienen acuse de recibo: se reclama con la foto del remito y del acuse');
    end if;

    if d.motivo = 'duplicada' then
      if d.comprobante_id is null then
        return jsonb_build_object('reclamable', null, 'vence_at', v_vence,
          'por_que', 'el debito no esta atado a un comprobante, asi que no se puede verificar si estaba duplicado de verdad');
      end if;
      if exists (
        select 1
          from convenio_comprobantes a
          join convenio_comprobantes b
            on b.convenio_id = a.convenio_id and b.numero = a.numero and b.id <> a.id
         where a.id = d.comprobante_id
           and b.presentacion_id is not null
           and b.presentacion_id is distinct from a.presentacion_id
      ) then
        return jsonb_build_object('reclamable', false, 'vence_at', v_vence,
          'por_que', 'ese numero aparece en mas de una presentacion: el duplicado es nuestro');
      end if;
      return jsonb_build_object('reclamable', true, 'vence_at', v_vence, 'dias', v_dias,
        'por_que', 'ese numero no aparece en ninguna otra presentacion: el duplicado es de ellos y se reclama');
    end if;

    -- El resto de los `depende` necesita que una persona mire el papel. El
    -- sistema no lo adivina: dice que no lo sabe y de qué depende.
    return jsonb_build_object('reclamable', null, 'vence_at', v_vence, 'dias', v_dias,
      'por_que', 'depende de ' || coalesce(m.depende_de, 'algo que el sistema no tiene') ||
                 ', y eso no esta en NORA: tiene que mirarlo una persona');
  end if;

  -- 3 · reclamable = 'si': sólo queda el plazo
  if v_dias is null then
    return jsonb_build_object('reclamable', null,
      'por_que', 'el motivo se reclama, pero no esta cargado el plazo de reclamo: no se puede decir si todavia llega');
  end if;
  if v_dias < 0 then
    return jsonb_build_object('reclamable', false, 'vence_at', v_vence, 'dias', v_dias,
      'por_que', 'era reclamable pero el plazo vencio hace ' || (-v_dias) || ' dias');
  end if;
  return jsonb_build_object('reclamable', true, 'vence_at', v_vence, 'dias', v_dias,
    'por_que', m.que_hacer);
end $$;

comment on function public.convenio_debito_reclamable(uuid) is
  'Si un debito se puede reclamar y hasta cuando. Devuelve null cuando no se puede saber, con el motivo: un false diria «lo mire y no se puede», y esa es justo la plata que se pierde sin que nadie la mire.';

-- ── C.5 · EL RECLAMO ────────────────────────────────────────────────────────
--
-- Abierto hasta que alguien lo cierre. `resultado` en null NO es «sin
-- respuesta»: es que todavía nadie lo cerró. Son dos cosas distintas y la
-- diferencia es quién tiene la pelota.

do $$ begin
  create type convenio_reclamo_resultado as enum (
    'recuperado', 'recuperado_parcial', 'rechazado', 'sin_respuesta'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.convenio_reclamos (
  id                 uuid primary key default gen_random_uuid(),
  debito_id          uuid not null references public.convenio_debitos(id) on delete cascade,
  reclamado_at       date not null default current_date,
  reclamado_por      uuid references auth.users(id) on delete set null,
  -- Por dónde se reclamó. Sirve para saber qué vía funciona.
  como               text,
  -- Con qué respaldo: urls de fotos, números de remito, lo que se adjuntó.
  respaldo           jsonb,
  que_se_dijo        text,

  respuesta          text,
  respuesta_at       date,
  -- Null = nadie lo cerró todavía. No es «sin respuesta»: `sin_respuesta` es
  -- un valor explícito que alguien eligió.
  resultado          convenio_reclamo_resultado,
  importe_recuperado numeric(14,2),
  cerrado_por        uuid references auth.users(id) on delete set null,
  cerrado_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists convenio_reclamos_deb on public.convenio_reclamos (debito_id);
create index if not exists convenio_reclamos_abiertos on public.convenio_reclamos (resultado)
  where resultado is null;

comment on table public.convenio_reclamos is
  'Que se reclamo, cuando, con que respaldo y que paso. resultado en null = nadie lo cerro todavia, que no es lo mismo que sin_respuesta.';

-- ── C.6 · LA TAREA DEL DÉBITO RECLAMABLE ────────────────────────────────────
--
-- Un débito reclamable sin tarea es un débito que nadie va a reclamar. La
-- tarea lleva el plazo: lo que hace perder la plata no es no saber, es
-- enterarse tarde.

create or replace function public.convenio_debito_tarea(p_debito uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  d record;
  m record;
  r jsonb;
  v_conv text;
  v_suc text;
  v_resp uuid;
  v_tarea uuid;
  v_codigo text;
begin
  select * into d from convenio_debitos where id = p_debito;
  if d.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'el debito no existe');
  end if;

  r := convenio_debito_reclamable(p_debito);
  if (r ->> 'reclamable') is distinct from 'true' then
    return jsonb_build_object('ok', false,
      'motivo', 'este debito no es reclamable o no se puede saber: ' || (r ->> 'por_que'));
  end if;

  if exists (select 1 from tareas where entidad_relacionada = 'convenio_debito'
              and entidad_id = p_debito and estado not in ('completada','descartada')) then
    return jsonb_build_object('ok', false, 'motivo', 'ya hay una tarea abierta para este debito');
  end if;

  select * into m from convenio_debito_motivos where clave = d.motivo;
  select nombre into v_conv from convenios where id = d.convenio_id;
  select nombre into v_suc from sucursales where id = d.sucursal_id;

  select id into v_resp from users_admin
   where activo and sucursal_id = d.sucursal_id
     and rol in ('encargado_sucursal', 'sucursal')
   order by rol limit 1;

  v_codigo := 'OSD-' || to_char(now(), 'YYMMDD') || '-' || substr(p_debito::text, 1, 4);

  insert into tareas (
    codigo, tipo_origen, titulo, descripcion, prioridad, estado,
    asignacion_tipo, responsable_id, rol_destinatario, sucursal_id,
    entidad_relacionada, entidad_id, entidad_url,
    verificacion_humana, fecha_vencimiento, creado_por_nombre, es_demo
  ) values (
    v_codigo, 'auto_sistema'::tarea_origen,
    'Reclamar $' || to_char(round(d.importe), 'FM999G999G999') || ' a ' || v_conv,
    'Debito de ' || v_conv || ' (' || v_suc || ') por «' || m.nombre || '»: $' ||
    to_char(round(d.importe), 'FM999G999G999') || ', liquidado el ' || d.fecha_liquidacion || '.' ||
    E'\n\nPor que se puede reclamar: ' || (r ->> 'por_que') ||
    E'\n\nQue hacer: ' || m.que_hacer ||
    coalesce(E'\n\nVence el ' || (r ->> 'vence_at') || '.', ''),
    -- Casts explícitos: ver la nota en 0209. Un `case` devuelve text y las
    -- columnas de `tareas` son enums.
    (case when coalesce((r ->> 'dias')::int, 99) <= 7 then 'critica' else 'alta' end)::tarea_prioridad,
    (case when v_resp is null then 'pendiente' else 'asignada' end)::tarea_estado,
    (case when v_resp is null then 'pool_sucursal' else 'usuario_especifico' end)::tarea_asignacion,
    v_resp,
    case when v_resp is null then 'encargado_sucursal' else null end,
    d.sucursal_id,
    'convenio_debito', p_debito,
    '/admin/convenios/debitos?debito=' || p_debito::text,
    true,
    coalesce((r ->> 'vence_at')::date, current_date + 7)::timestamptz,
    'NORA · Convenios', d.es_demo
  ) returning id into v_tarea;

  return jsonb_build_object('ok', true, 'tarea_id', v_tarea, 'tarea_codigo', v_codigo,
    'vence_at', r ->> 'vence_at');
end $$;

comment on function public.convenio_debito_tarea(uuid) is
  'Crea la tarea de reclamo de un debito reclamable, con el plazo. Devuelve el motivo si no corresponde, en vez de lanzar excepcion.';

-- ── C.7 · LO QUE SE VE ──────────────────────────────────────────────────────

-- Por motivo, ORDENADO POR PLATA. Es la pregunta que importa: cuál es el
-- motivo que más se lleva.
create or replace view public.convenio_debitos_por_motivo
with (security_invoker = true)
as
select
  d.motivo,
  m.nombre as motivo_nombre,
  m.reclamable,
  m.que_hacer,
  count(*)::int as cantidad,
  sum(d.importe) as plata,
  count(*) filter (where d.estado = 'recuperado')::int as recuperados,
  coalesce(sum(d.importe) filter (where d.estado = 'recuperado'), 0) as plata_recuperada,
  count(*) filter (where d.estado = 'perdido')::int as perdidos,
  coalesce(sum(d.importe) filter (where d.estado = 'perdido'), 0) as plata_perdida,
  count(*) filter (where d.estado = 'abierto')::int as abiertos,
  min(d.fecha_liquidacion) as desde,
  max(d.fecha_liquidacion) as hasta
from convenio_debitos d
join convenio_debito_motivos m on m.clave = d.motivo
group by d.motivo, m.nombre, m.reclamable, m.que_hacer, m.orden
order by sum(d.importe) desc;

comment on view public.convenio_debitos_por_motivo is
  'Cuanto se debito por cada motivo, ordenado por plata. Es la pregunta que importa: cual es el motivo que mas se lleva.';

-- C.3 · Por sucursal y por motivo. El número, no el culpable.
create or replace view public.convenio_debitos_por_sucursal
with (security_invoker = true)
as
with por as (
  select d.sucursal_id, s.nombre as sucursal, d.motivo, m.nombre as motivo_nombre,
         count(*)::int as cantidad, sum(d.importe) as plata
    from convenio_debitos d
    join sucursales s on s.id = d.sucursal_id
    join convenio_debito_motivos m on m.clave = d.motivo
   group by d.sucursal_id, s.nombre, d.motivo, m.nombre
),
promedio as (
  select motivo, avg(plata) as plata_promedio, count(*) as sucursales
    from por group by motivo
)
select p.*, pr.plata_promedio, pr.sucursales as sucursales_con_ese_motivo,
  -- Cuántas veces el promedio de las otras. Null cuando hay una sola sucursal
  -- con ese motivo: con un solo dato no hay con qué comparar.
  case when pr.sucursales > 1 and pr.plata_promedio > 0
       then round(p.plata / pr.plata_promedio, 2) end as veces_el_promedio
from por p
join promedio pr on pr.motivo = p.motivo
order by p.plata desc;

comment on view public.convenio_debitos_por_sucursal is
  'Debitos por sucursal y motivo, con cuantas veces el promedio. Si una sucursal tiene el triple por el mismo motivo, hay un problema de proceso. El sistema muestra el numero; el motivo lo pone una persona.';

-- C.3 · Y por quién armó la presentación. Mismo criterio: el número.
create or replace view public.convenio_debitos_por_quien_armo
with (security_invoker = true)
as
select
  d.armo_presentacion,
  count(*)::int as debitos,
  sum(d.importe) as plata,
  count(distinct d.presentacion_id)::int as presentaciones,
  count(*) filter (where d.motivo = 'troquel_faltante')::int as por_troquel,
  count(*) filter (where d.motivo = 'receta_mal_cargada')::int as por_carga,
  min(d.fecha_liquidacion) as desde,
  max(d.fecha_liquidacion) as hasta
from convenio_debitos d
where d.armo_presentacion is not null
group by d.armo_presentacion
order by sum(d.importe) desc;

comment on view public.convenio_debitos_por_quien_armo is
  'Debitos agrupados por quien armo la presentacion. NO es un ranking de personas: es para encontrar un problema de proceso o de capacitacion.';

-- C.7 · Qué se recuperó y qué se perdió por dejarlo vencer.
--
-- «Perdido por dejarlo vencer» es la única categoría que duele de verdad: era
-- plata recuperable y se fue porque nadie reclamó a tiempo.
create or replace view public.convenio_recupero
with (security_invoker = true)
as
select
  d.id, d.convenio_id, c.nombre as convenio, d.sucursal_id, s.nombre as sucursal,
  d.motivo, m.nombre as motivo_nombre, d.importe, d.fecha_liquidacion, d.estado,
  r.reclamable, r.vence_at, r.dias, r.por_que,
  case
    when d.estado = 'recuperado' then 'recuperado'
    when d.estado = 'reclamado' then 'reclamado, esperando respuesta'
    when r.reclamable = 'true' then 'reclamable y sin reclamar'
    when r.reclamable = 'false' and r.dias is not null and r.dias::int < 0
         and m.reclamable <> 'no' then 'se perdio por dejarlo vencer'
    when r.reclamable = 'false' then 'no reclamable'
    else 'no se puede saber'
  end as situacion
from convenio_debitos d
join convenios c on c.id = d.convenio_id
join sucursales s on s.id = d.sucursal_id
join convenio_debito_motivos m on m.clave = d.motivo
cross join lateral (
  select
    (convenio_debito_reclamable(d.id) ->> 'reclamable') as reclamable,
    (convenio_debito_reclamable(d.id) ->> 'vence_at') as vence_at,
    (convenio_debito_reclamable(d.id) ->> 'dias') as dias,
    (convenio_debito_reclamable(d.id) ->> 'por_que') as por_que
) r;

comment on view public.convenio_recupero is
  'Cada debito con su situacion. «Se perdio por dejarlo vencer» es la unica categoria que duele: era recuperable y se fue porque nadie reclamo.';

-- El resumen que lee el agente Convenio. Un viaje, agregado en la base.
create or replace function public.convenios_resumen(p_sucursal uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'padron', (select jsonb_build_object(
        'convenios', count(*), 'activos', count(*) filter (where activo),
        'sin_plazo', count(*) filter (where plazo_presentacion_dias is null))
      from convenios),
    'cierres', (select jsonb_build_object(
        'por_vencer', count(*) filter (where dias is not null and not ya_presentada and dias <= aviso_dias_antes),
        'sin_calcular', count(*) filter (where cierre is null),
        'proximo_dias', min(dias) filter (where dias is not null and not ya_presentada))
      from convenio_cierres_proximos
      where p_sucursal is null or sucursal_id = p_sucursal),
    'presentaciones', (select jsonb_build_object(
        'borradores', count(*) filter (where estado = 'borrador'),
        'enviadas', count(*) filter (where estado = 'enviada'),
        'sin_acuse_troquel', count(*) filter (
          where estado in ('enviada','liquidada')
            and not exists (select 1 from convenio_troqueles t
                             where t.presentacion_id = convenio_presentaciones.id
                               and t.acuse_at is not null)))
      from convenio_presentaciones
      where p_sucursal is null or sucursal_id = p_sucursal),
    'debitos', (select jsonb_build_object(
        'cantidad', count(*), 'plata', coalesce(sum(importe), 0),
        'abiertos', count(*) filter (where estado = 'abierto'),
        'plata_abierta', coalesce(sum(importe) filter (where estado = 'abierto'), 0),
        'recuperado', coalesce(sum(importe) filter (where estado = 'recuperado'), 0),
        'ultimo_trimestre', coalesce(sum(importe) filter (
          where fecha_liquidacion >= current_date - 90), 0))
      from convenio_debitos
      where p_sucursal is null or sucursal_id = p_sucursal),
    'reclamables', (select jsonb_build_object(
        'cantidad', count(*), 'plata', coalesce(sum(importe), 0),
        'vencen_en_7', count(*) filter (where dias is not null and dias::int between 0 and 7),
        'se_perdieron', count(*) filter (where situacion = 'se perdio por dejarlo vencer'),
        'plata_perdida', coalesce(sum(importe) filter (where situacion = 'se perdio por dejarlo vencer'), 0),
        'no_se_sabe', count(*) filter (where situacion = 'no se puede saber'))
      from convenio_recupero
      where (p_sucursal is null or sucursal_id = p_sucursal)
        and situacion in ('reclamable y sin reclamar', 'se perdio por dejarlo vencer', 'no se puede saber'))
  );
$$;

comment on function public.convenios_resumen(uuid) is
  'El resumen del sector, agregado en la base. Lo lee el agente Convenio y el tablero: un viaje y sin contar filas en memoria.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.convenio_debitos        enable row level security;
alter table public.convenio_reclamos       enable row level security;
alter table public.convenio_debito_motivos enable row level security;

drop policy if exists convenio_motivos_ver on public.convenio_debito_motivos;
create policy convenio_motivos_ver on public.convenio_debito_motivos
  for select to authenticated using ((select hub_puede_ver('convenios')));

drop policy if exists convenio_debitos_ver on public.convenio_debitos;
create policy convenio_debitos_ver on public.convenio_debitos
  for select to authenticated
  using ((select hub_puede_ver('convenios')) and (select hub_ve_sucursal(sucursal_id)));

drop policy if exists convenio_debitos_crear on public.convenio_debitos;
create policy convenio_debitos_crear on public.convenio_debitos
  for insert to authenticated
  with check ((select hub_puede('convenios','crear')) and (select hub_ve_sucursal(sucursal_id)));

drop policy if exists convenio_debitos_editar on public.convenio_debitos;
create policy convenio_debitos_editar on public.convenio_debitos
  for update to authenticated
  using ((select hub_puede('convenios','editar')) and (select hub_ve_sucursal(sucursal_id)))
  with check ((select hub_puede('convenios','editar')) and (select hub_ve_sucursal(sucursal_id)));

-- Un débito NO se borra: no hay política de delete, a propósito. Es lo que la
-- obra social te sacó, y taparlo es exactamente lo que este bloque viene a
-- impedir. Se cierra como perdido, con el motivo.

drop policy if exists convenio_reclamos_ver on public.convenio_reclamos;
create policy convenio_reclamos_ver on public.convenio_reclamos
  for select to authenticated using (
    exists (select 1 from convenio_debitos d
             where d.id = debito_id
               and (select hub_puede_ver('convenios'))
               and (select hub_ve_sucursal(d.sucursal_id))));

drop policy if exists convenio_reclamos_crear on public.convenio_reclamos;
create policy convenio_reclamos_crear on public.convenio_reclamos
  for insert to authenticated with check (
    exists (select 1 from convenio_debitos d
             where d.id = debito_id
               and (select hub_puede('convenios','crear'))
               and (select hub_ve_sucursal(d.sucursal_id))));

drop policy if exists convenio_reclamos_editar on public.convenio_reclamos;
create policy convenio_reclamos_editar on public.convenio_reclamos
  for update to authenticated
  using (exists (select 1 from convenio_debitos d
                  where d.id = debito_id
                    and (select hub_puede('convenios','editar'))
                    and (select hub_ve_sucursal(d.sucursal_id))))
  with check (exists (select 1 from convenio_debitos d
                       where d.id = debito_id
                         and (select hub_puede('convenios','editar'))
                         and (select hub_ve_sucursal(d.sucursal_id))));

-- Los permisos, después del último `create or replace`.
revoke all on function public.convenio_debito_reclamable(uuid) from public, anon;
revoke all on function public.convenio_debito_tarea(uuid) from public, anon;
revoke all on function public.convenios_resumen(uuid) from public, anon;
grant execute on function public.convenio_debito_reclamable(uuid) to authenticated, service_role;
grant execute on function public.convenio_debito_tarea(uuid) to authenticated, service_role;
grant execute on function public.convenios_resumen(uuid) to authenticated, service_role;
