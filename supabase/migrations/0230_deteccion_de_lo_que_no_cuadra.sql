-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0230 · LO QUE NO CUADRA                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Hasta ahora NORA contesta lo que se le pregunta. Esto es lo que encuentra
-- sin que nadie busque.
--
-- ── LA REGLA QUE VALE PARA LOS SEIS BLOQUES ─────────────────────────────────
--
-- **El sistema describe el hecho, nunca la causa.** Dice que hay una
-- diferencia de 16 unidades. No dice quien, ni por que, ni usa una palabra que
-- alguien pueda leer como acusacion.
--
-- Eso no es delicadeza: es que el sistema no sabe la causa. Una diferencia de
-- stock puede ser un error de carga, una venta que SIFACO registro tarde, una
-- merma que nadie anoto o un faltante. Elegir una es inventarla.
--
-- ── POR QUE SE REUSA `anomalias` ────────────────────────────────────────────
--
-- `anomalias` existe desde la v0.8x con 13.076 filas y seis detectores de
-- catalogo y ofertas. Ya tiene lo que hace falta: `plata_en_juego`, `estado`,
-- `evidencia`, `veces_reaparecio`, `primera_vez`.
--
-- Hacer una tabla nueva habria dejado dos lugares donde mirar lo mismo.
--
-- ── POR QUE `detector` Y NO UN VALOR MAS EN EL ENUM ─────────────────────────
--
-- `anomalias.tipo` es un enum, y `alter type ... add value` no se puede
-- ejecutar desde un bloque: PostgreSQL lo prohibe. Pero el motivo de fondo es
-- mejor que la limitacion: cada detector ahora tiene que declarar cuanta
-- historia necesita y cuantos hallazgos puede publicar por dia (C.7, D.3), y
-- eso son filas de una tabla, no valores de un enum.
--
-- Entonces la clave pasa a ser `detector text` contra el catalogo, y los seis
-- detectores viejos entran al mismo catalogo. `tipo` queda donde esta: 13.076
-- filas ya lo usan.

do $$ begin
  create type detector_familia as enum ('no_cuadra', 'cambio', 'catalogo');
exception when duplicate_object then null; end $$;

create table if not exists public.detectores (
  clave            text primary key,
  familia          detector_familia not null,
  nombre           text not null,
  que_detecta      text not null,
  -- Lo que el sistema NO dice de este hallazgo. Se muestra al lado: es la
  -- mitad de la honestidad.
  que_no_dice      text not null,
  -- C.7 · texto y no un numero a proposito. Lo que hace falta no es «30 dias»
  -- sino «dos fotos de stock por sucursal del mismo producto». Un numero no
  -- dice eso.
  historia_minima  text not null,
  -- D.3 · los cinco peores de cada detector, no los ciento cuarenta.
  tope_diario      integer not null default 5,
  activo           boolean not null default true,
  orden            integer not null default 100,
  created_at       timestamptz not null default now()
);

comment on table public.detectores is
  'Los detectores, con cuanta historia necesita cada uno para hablar y que es '
  'lo que NO dice. Sin la historia declarada, el detector no reporta.';

alter table public.detectores enable row level security;
drop policy if exists detectores_ver on public.detectores;
create policy detectores_ver on public.detectores
  for select to authenticated using (true);

alter table public.anomalias
  add column if not exists detector text references public.detectores(clave),
  add column if not exists sucursal_id uuid references public.sucursales(id) on delete set null,
  add column if not exists hecho text,
  add column if not exists como_se_calculo text;

comment on column public.anomalias.detector is
  'Cual detector lo encontro. Reemplaza a `tipo` para todo lo nuevo: `tipo` es '
  'un enum y un detector tiene que declarar su historia minima y su tope.';
comment on column public.anomalias.hecho is
  'La frase, escrita como un hecho y no como una sospecha. «Hay una diferencia '
  'de 16 unidades», no «faltan 16 unidades».';
comment on column public.anomalias.como_se_calculo is
  'De donde sale plata_en_juego. Un numero sin procedencia es un oraculo.';

insert into public.detectores
  (clave, familia, nombre, que_detecta, que_no_dice, historia_minima, tope_diario, orden)
values
  -- Los seis que ya existian, al mismo catalogo.
  ('sin_costo_cargado', 'catalogo', 'Un producto sin costo',
   'Esta publicado y no tiene costo cargado, asi que no se sabe si se gana o se pierde.',
   'No dice cuanto es el costo. Dice que no esta.',
   'ninguna: es un hecho de hoy', 5, 200),
  ('producto_duplicado', 'catalogo', 'El mismo producto en dos registros',
   'Dos registros del catalogo con el mismo nombre.',
   'No dice cual hay que dar de baja. Propone el que mas vendio y deja decidir.',
   'los meses cerrados de venta, para saber cual de los dos vendio', 5, 210),
  ('oferta_bajo_costo', 'catalogo', 'Una oferta por debajo del costo',
   'El precio de oferta quedo abajo del costo cargado.',
   'No dice que sea un error: una liquidacion de vencimiento se hace a perdida a proposito.',
   'ninguna: es un hecho de hoy', 5, 220),
  ('precio_lista_bajo_costo', 'catalogo', 'Un precio de lista por debajo del costo',
   'El precio publicado quedo abajo del costo cargado.',
   'No dice cual de los dos esta mal. SIFACO es la autoridad de precio.',
   'ninguna: es un hecho de hoy', 5, 230),
  ('descuento_imposible', 'catalogo', 'Un descuento que no se puede sostener',
   'El descuento deja el precio abajo del costo.',
   'No dice que no se pueda hacer: dice cuanto cuesta hacerlo.',
   'ninguna: es un hecho de hoy', 5, 240),
  ('descuento_sin_vencimiento', 'catalogo', 'Un descuento sin fecha de fin',
   'Una oferta sin vencimiento se queda para siempre y nadie se acuerda.',
   'No dice que haya que cortarla hoy: dice que no tiene fecha.',
   'ninguna: es un hecho de hoy', 5, 250),

  -- B · lo que no cuadra.
  ('stock_no_cuadra', 'no_cuadra', 'Stock que no cuadra',
   'El modelo dice que deberian quedar N y hay M, sin venta, transferencia ni merma que lo explique.',
   'No dice por que ni quien. Una diferencia puede ser un error de carga, una venta que SIFACO registro tarde, una merma que nadie anoto, o un faltante.',
   'dos fotos de stock POR SUCURSAL del mismo producto, y las ventas del periodo entre las dos',
   5, 10),
  ('caja_diferencias_repetidas', 'no_cuadra', 'Diferencias de caja que se repiten',
   'Una diferencia no dice nada. Varias en la misma sucursal y el mismo turno, si.',
   'No dice quien cerro. El dato existe para quien pueda verlo; en el listado aparece la sucursal y el turno, no la persona.',
   '90 dias de arqueos cerrados y al menos 5 arqueos reales en esa sucursal',
   5, 20),
  ('comprobante_duplicado', 'no_cuadra', 'Un comprobante cargado dos veces',
   'Mismo proveedor, mismo numero de comprobante, montos que difieren menos del 5%.',
   'No dice si se pago dos veces: dice que esta cargado dos veces.',
   'ninguna: es un hecho de hoy', 5, 30),
  ('monto_fuera_de_lo_habitual', 'no_cuadra', 'Un monto muy distinto del habitual',
   'Una factura que se sale de lo que ese proveedor factura siempre.',
   'No dice que este mal. Un pedido grande es un monto distinto y puede estar perfecto.',
   '5 facturas del mismo proveedor para saber que es «lo habitual»', 5, 40),
  ('faltante_sin_nota_credito', 'no_cuadra', 'Un faltante sin nota de credito',
   'Pasaron los dias y la nota de credito del faltante no llego.',
   'No dice que el proveedor no la vaya a mandar: dice cuantos dias pasaron.',
   'ninguna: cuenta dias desde que se registro el faltante', 5, 50),
  ('barras_con_dos_precios', 'no_cuadra', 'Un producto en dos lugares con precio distinto',
   'El mismo codigo de barras en dos registros del catalogo, con precios que no coinciden.',
   'No dice cual de los dos precios esta bien. SIFACO es la autoridad de precio (regla de oro 1).',
   'ninguna: es un hecho de hoy', 5, 60)
on conflict (clave) do update set
  familia = excluded.familia, nombre = excluded.nombre,
  que_detecta = excluded.que_detecta, que_no_dice = excluded.que_no_dice,
  historia_minima = excluded.historia_minima, tope_diario = excluded.tope_diario,
  orden = excluded.orden;

-- Las 13.076 filas que ya estaban quedan apuntando a su detector.
update public.anomalias set detector = tipo::text where detector is null;

create index if not exists anomalias_detector on public.anomalias (detector, estado);
create index if not exists anomalias_suc on public.anomalias (sucursal_id, detectada_en desc);

-- ── C.7 · SI PUEDE CORRER, Y SI NO, POR QUE ─────────────────────────────────
--
-- Antes de reportar, cada detector contesta si tiene con que. Lo que no puede
-- correr **no reporta cero**: dice que no puede, y eso es informacion.
--
-- Cero es «lo mire y no hay». Null es «no lo puedo saber».

create or replace function public.deteccion_estado(p_detector text default null)
returns table (
  clave text, nombre text, familia text, historia_minima text,
  puede_correr boolean, por_que_no text, lo_que_hay text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with h as (
    select
      -- B.1 · fotos de stock POR SUCURSAL. Hoy hay una sola.
      (select count(distinct importacion_id) from producto_stock_sifaco
        where sucursal_id is not null) as fotos_stock,
      (select count(*) from arqueos_caja where not es_demo) as arqueos_reales,
      (select count(*) from facturas_proveedor where not es_demo) as facturas,
      (select count(*) from avisos_faltante where not es_demo) as faltantes,
      (select count(*) from productos_catalogo where activo and not es_demo) as productos
  )
  select d.clave, d.nombre, d.familia::text, d.historia_minima,
    case d.clave
      when 'stock_no_cuadra' then h.fotos_stock >= 2
      when 'caja_diferencias_repetidas' then h.arqueos_reales >= 5
      when 'comprobante_duplicado' then h.facturas > 0
      when 'monto_fuera_de_lo_habitual' then h.facturas >= 5
      when 'faltante_sin_nota_credito' then h.faltantes > 0
      else true
    end,
    case d.clave
      when 'stock_no_cuadra' then
        case when h.fotos_stock < 2 then
          format('hay %s foto de stock por sucursal y hacen falta 2 para comparar. El maestro de agosto no trae apertura por sucursal: la primera con apertura es la del 14/10', h.fotos_stock)
        end
      when 'caja_diferencias_repetidas' then
        case when h.arqueos_reales < 5 then
          format('hay %s arqueos reales. Los que estan cargados son de demostracion', h.arqueos_reales)
        end
      when 'comprobante_duplicado' then
        case when h.facturas = 0 then 'no hay comprobantes cargados' end
      when 'monto_fuera_de_lo_habitual' then
        case when h.facturas < 5 then 'hacen falta al menos 5 facturas para saber que es lo habitual' end
      when 'faltante_sin_nota_credito' then
        case when h.faltantes = 0 then 'no hay ningun faltante registrado' end
    end,
    case d.clave
      when 'stock_no_cuadra' then format('%s foto(s) de stock por sucursal', h.fotos_stock)
      when 'caja_diferencias_repetidas' then format('%s arqueos reales', h.arqueos_reales)
      when 'comprobante_duplicado' then format('%s comprobantes', h.facturas)
      when 'monto_fuera_de_lo_habitual' then format('%s comprobantes', h.facturas)
      when 'faltante_sin_nota_credito' then format('%s faltantes registrados', h.faltantes)
      else format('%s productos en el catalogo', h.productos)
    end
  from detectores d, h
  where d.activo and (p_detector is null or d.clave = p_detector)
  order by d.orden;
$$;

comment on function public.deteccion_estado(text) is
  'C.7 · Si cada detector tiene con que hablar. Lo que no puede correr no '
  'reporta cero: dice que no puede, y eso es informacion.';

-- ── B.3 · UN COMPROBANTE CARGADO DOS VECES ──────────────────────────────────
-- (el cuerpo final de los seis detectores queda en 0232, que arregla el
--  formato de la plata; aca nacieron)

create or replace function public.detectar_comprobante_duplicado()
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with pares as (
    select f.proveedor_id, p.razon_social, f.numero_factura,
           count(*) as veces,
           min(f.total) as menor, max(f.total) as mayor,
           min(f.fecha_emision) as primera, max(f.fecha_emision) as ultima,
           array_agg(f.id order by f.created_at) as ids,
           (array_agg(f.sucursal_id order by f.created_at))[1] as suc
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
     where not f.es_demo
       and f.numero_factura is not null and btrim(f.numero_factura) <> ''
     group by f.proveedor_id, p.razon_social, f.numero_factura
    having count(*) > 1
       -- Montos parecidos: si difieren mas del 5% probablemente sean dos
       -- comprobantes distintos con el mismo numero mal tipeado, que es otro
       -- problema y no este.
       and max(f.total) > 0
       and (max(f.total) - min(f.total)) / max(f.total) <= 0.05
  )
  select
    'dup_comprobante:' || proveedor_id::text || ':' || numero_factura,
    suc, null::uuid,
    format('El comprobante %s de %s esta cargado %s veces, con montos que difieren menos del 5%%. El primero es del %s y el ultimo del %s.',
           numero_factura, razon_social, veces, primera, ultima),
    -- La plata en juego es lo que esta cargado de mas: las copias.
    round((veces - 1) * mayor, 2),
    format('%s copia(s) de mas x $%s cada una. Es lo que esta cargado de mas, no necesariamente lo que se pago de mas.',
           veces - 1, to_char(round(mayor), 'FM999G999G999')),
    jsonb_build_object(
      'proveedor', razon_social, 'numero', numero_factura, 'veces', veces,
      'menor', menor, 'mayor', mayor, 'ids', ids,
      'primera_carga', primera, 'ultima_carga', ultima)
  from pares;
$$;

comment on function public.detectar_comprobante_duplicado() is
  'B.3 · Mismo proveedor, mismo numero, montos parecidos (<=5%). Si difieren '
  'mas, probablemente sean dos comprobantes distintos con el numero mal '
  'tipeado, que es otro problema.';

-- ── B.4 · UN MONTO MUY DISTINTO DEL HABITUAL ────────────────────────────────
--
-- «Lo habitual» se mide con la mediana y el rango intercuartil, no con el
-- promedio: un solo pedido grande mueve el promedio y despues nada parece
-- raro. Con la mediana, el pedido grande es el que se marca.

create or replace function public.detectar_monto_fuera_de_lo_habitual()
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with base as (
    select f.proveedor_id, p.razon_social,
           (percentile_cont(0.5) within group (order by f.total))::numeric as mediana,
           (percentile_cont(0.75) within group (order by f.total))::numeric as q3,
           (percentile_cont(0.25) within group (order by f.total))::numeric as q1,
           count(*) as n
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
     where not f.es_demo and f.total > 0
     group by f.proveedor_id, p.razon_social
    having count(*) >= 5
  ),
  raras as (
    select f.id, b.razon_social, f.numero_factura, f.total,
           f.fecha_emision, f.sucursal_id, b.mediana, b.n,
           b.q3 + 3 * (b.q3 - b.q1) as techo
      from facturas_proveedor f
      join base b on b.proveedor_id = f.proveedor_id
     where not f.es_demo
       and b.q3 > b.q1
       and f.total > b.q3 + 3 * (b.q3 - b.q1)
       -- Solo lo reciente: una factura rara de hace ocho meses ya no es una
       -- noticia, es un numero.
       and f.fecha_emision >= current_date - 90
  )
  select
    'monto_raro:' || id::text,
    sucursal_id, null::uuid,
    format('El comprobante %s de %s es de $%s. Las %s facturas de ese proveedor tienen una mediana de $%s.',
           coalesce(numero_factura, 'sin numero'), razon_social,
           to_char(round(total), 'FM999G999G999'), n,
           to_char(round(mediana), 'FM999G999G999')),
    -- La plata en juego es la diferencia contra lo habitual, no el total: el
    -- total ya se iba a gastar.
    round(total - mediana, 2),
    format('$%s de este comprobante menos la mediana de $%s de las %s facturas de ese proveedor. El umbral es el tercer cuartil mas tres veces el rango intercuartil ($%s): se usa la mediana y no el promedio porque un solo pedido grande corre el promedio y despues nada parece raro.',
           to_char(round(total), 'FM999G999G999'), to_char(round(mediana), 'FM999G999G999'),
           n, to_char(round(techo), 'FM999G999G999')),
    jsonb_build_object(
      'factura_id', id, 'proveedor', razon_social, 'numero', numero_factura,
      'total', total, 'mediana', round(mediana, 2), 'techo', round(techo, 2),
      'facturas_del_proveedor', n, 'fecha', fecha_emision)
  from raras;
$$;

comment on function public.detectar_monto_fuera_de_lo_habitual() is
  'B.4 · Mediana y rango intercuartil, no promedio: un solo pedido grande mueve '
  'el promedio y despues nada parece raro.';

-- ── B.6 · UN PRODUCTO EN DOS LUGARES CON PRECIO DISTINTO ────────────────────
--
-- Lo que aparecio con las soluciones fisiologicas: el mismo codigo de barras
-- en dos registros del catalogo, con precios que no se parecen.
--
-- No es lo mismo que `producto_duplicado`, que ya existia y compara por
-- NOMBRE. Dos registros pueden tener nombres distintos y el mismo codigo de
-- barras, y ese es el caso que mas plata mueve: el mostrador escanea y le sale
-- el precio del registro equivocado.

create or replace function public.detectar_barras_con_dos_precios(p_veces numeric default 2.0)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with g as (
    select p.codigo_barras,
           count(*) as registros,
           min(p.precio_sugerido)::numeric as menor,
           max(p.precio_sugerido)::numeric as mayor,
           (array_agg(p.id order by p.precio_sugerido))[1] as id_menor,
           (array_agg(p.id order by p.precio_sugerido desc))[1] as id_mayor,
           (array_agg(p.nombre order by p.precio_sugerido))[1] as nombre_menor,
           (array_agg(p.nombre order by p.precio_sugerido desc))[1] as nombre_mayor,
           (array_agg(p.sku order by p.precio_sugerido))[1] as sku_menor,
           (array_agg(p.sku order by p.precio_sugerido desc))[1] as sku_mayor
      from productos_catalogo p
     where p.activo and not p.es_demo
       and p.codigo_barras is not null and btrim(p.codigo_barras) <> ''
       and p.precio_sugerido is not null and p.precio_sugerido > 0
     group by p.codigo_barras
    having count(*) > 1
       and max(p.precio_sugerido) / min(p.precio_sugerido) >= p_veces
  ),
  conventa as (
    select g.*,
      coalesce((select sum(v.unidades)::numeric from producto_ventas_sucursal v
                 where v.producto_id in (g.id_menor, g.id_mayor)
                   and v.periodo >= to_char(current_date - 90, 'YYYY-MM')), 0) as unidades_3m
    from g
  )
  select
    'barras_2precios:' || codigo_barras,
    null::uuid, id_mayor,
    format('El codigo de barras %s esta en %s registros del catalogo: «%s» a $%s y «%s» a $%s. Son %s veces de diferencia.',
           codigo_barras, registros, nombre_menor, to_char(round(menor), 'FM999G999G999'),
           nombre_mayor, to_char(round(mayor), 'FM999G999G999'),
           round(mayor / menor, 1)),
    -- La plata es la diferencia por lo que se vendio en tres meses: es lo que
    -- se cobro de mas o de menos segun cual registro salio al escanear.
    case when unidades_3m > 0 then round((mayor - menor) * unidades_3m, 2) end,
    case when unidades_3m > 0
         then format('la diferencia de $%s por las %s unidades vendidas en 3 meses entre los dos registros. Es lo que se cobro de mas o de menos segun cual salio al escanear.',
                     to_char(round(mayor - menor), 'FM999G999G999'), round(unidades_3m))
         else format('no se puede costear: los dos registros juntos no registran ventas en 3 meses, asi que la diferencia de $%s no se multiplico por nada',
                     to_char(round(mayor - menor), 'FM999G999G999')) end,
    jsonb_build_object(
      'codigo_barras', codigo_barras, 'registros', registros,
      'menor', jsonb_build_object('id', id_menor, 'sku', sku_menor, 'nombre', nombre_menor, 'precio', menor),
      'mayor', jsonb_build_object('id', id_mayor, 'sku', sku_mayor, 'nombre', nombre_mayor, 'precio', mayor),
      'veces', round(mayor / menor, 1), 'unidades_3m', unidades_3m)
  from conventa;
$$;

comment on function public.detectar_barras_con_dos_precios(numeric) is
  'B.6 · Mismo codigo de barras, precios que difieren 2 veces o mas. NO es '
  '`producto_duplicado`, que compara por nombre: dos registros con nombres '
  'distintos y el mismo codigo son el caso que mas plata mueve, porque el '
  'mostrador escanea y sale el precio del registro equivocado.';
