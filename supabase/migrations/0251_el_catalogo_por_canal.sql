-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0251 · EL CATALOGO POR CANAL                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Hay cuatro canales vendiendo y nadie controla lo que pasa alrededor de cada
-- uno.
--
-- ── LO PRIMERO QUE APARECIO AL MIRAR LA BASE ────────────────────────────────
--
-- **De los cuatro canales, dos no existen en el sistema.** `canales_venta`
-- tiene dos filas: `woo` (la tienda propia) y `meli` (preparado, no
-- conectado). El mostrador no esta declarado como canal, y **PedidosYa no
-- esta en ninguna parte**: ni el canal, ni sus 3.742 + 3.527 productos, ni
-- los 481 que no actualizan, ni los 1.243 apagados.
--
-- Eso cambia que significa este bloque. Los numeros de PedidosYa que trae el
-- enunciado son de un analisis que se hizo afuera del sistema; aca no hay con
-- que verificarlos. Se declaran los canales, se dice que no tienen catalogo
-- cargado y **que lo cargaria**. Lo que no se puede saber, dicho.
--
-- ── Y LOS NUMEROS QUE SI SE PUDIERON MEDIR ──────────────────────────────────
--
-- Contra `canal_publicaciones` (7.737 filas de la tienda propia), los cinco
-- problemas de §1 dan distinto de lo que decia el enunciado:
--
--   §1.b · publicados con receta · **20**, no 11
--   §1.c · los que no actualizan · **137** sin cruzar, 108 con codigo
--          negativo (el «alternativo» de SIFACO)
--   §1.d · publicados sin stock real · **1.042** segun `canal_estado`
--   §1.e · catalogos distintos entre sucursales · **no se puede medir**: la
--          tienda propia es un catalogo unico sin apertura por sucursal
--
-- No es que el enunciado estuviera mal: es que esos numeros son de PedidosYa
-- y de otra fecha. Los de aca son los de hoy, en el canal que si esta.

alter table public.canales_venta
  -- A.6 · un canal sin catalogo cargado no aparece vacio: dice que le falta.
  add column if not exists catalogo_cargado boolean not null default false,
  add column if not exists catalogo_como_se_carga text,
  -- C.7 · la comision de cada plataforma hay que confirmarla. Un numero
  -- estimado que no dice que lo es se convierte en un numero.
  add column if not exists comision_confirmada boolean not null default false,
  add column if not exists comision_de_donde text,
  -- A.5 · como entra lo publicado. Null es «no entra solo».
  add column if not exists sincroniza_como text;

comment on column public.canales_venta.margen_extra_pct is
  'EL RECARGO del canal: cuanto se le suma al precio de mostrador para '
  'publicar. SIFACO es la autoridad de precio (regla de oro 1): NORA calcula '
  'este recargo y nunca lo escribe en SIFACO.';
comment on column public.canales_venta.catalogo_cargado is
  'A.6 · Si el catalogo de este canal esta en el sistema. Falso no es cero '
  'publicaciones: es que no se puede saber cuantas hay.';
comment on column public.canales_venta.comision_confirmada is
  'C.7 · Si la comision la confirmo una persona contra una liquidacion real. '
  'Mientras sea falsa, todo lo que se calcule con ella lo dice.';

-- ── LOS CUATRO CANALES, DECLARADOS ──────────────────────────────────────────
--
-- El mostrador entra como canal con comision 0 y recargo 0. No es un
-- formalismo: **es el patron de comparacion de todo el bloque C.** «Este
-- canal deja menos que el mostrador» necesita que el mostrador sea una fila.
--
-- PedidosYa entra dos veces, una por sucursal, porque la comision y el tiempo
-- de preparacion son del local que despacha. Y porque asi, el dia que entre
-- el catalogo, la comparacion entre sucursales de A.4 corre sola.

insert into public.canales_venta
  (id, nombre, tipo, activo, comision_pct, costo_envio, envio_lo_paga,
   impuesto_pct, margen_extra_pct, configurado, catalogo_cargado,
   catalogo_como_se_carga, comision_confirmada, comision_de_donde,
   sincroniza_como, notas)
values
  ('mostrador', 'Mostrador', 'mostrador', true,
   0, 0, 'cliente', 0, 0, true, true,
   'es el catalogo de SIFACO: lo que esta en el maestro se vende en el mostrador',
   true, 'no hay comision: es venta directa',
   'el maestro de SIFACO',
   'El patron de comparacion. Sin esta fila, «este canal deja menos que el mostrador» no se puede calcular.'),

  ('pedidosya_figueiras', 'PedidosYa · Figueiras', 'pedidosya', true,
   24, 0, 'negocio', 0, 19, false, false,
   'exportando el catalogo desde el portal de PedidosYa y subiendolo por el Centro de Datos. Hoy no hay ni una publicacion cargada',
   false, 'el 24% lo dijo Facundo y no esta confirmado contra una liquidacion',
   null,
   'DECLARADO, SIN CATALOGO. El recargo del 19% no cubre la comision del 24%: ver el bloque C.'),

  ('pedidosya_guzman', 'PedidosYa · Guzman', 'pedidosya', true,
   24, 0, 'negocio', 0, 19, false, false,
   'exportando el catalogo desde el portal de PedidosYa y subiendolo por el Centro de Datos. Hoy no hay ni una publicacion cargada',
   false, 'el 24% lo dijo Facundo y no esta confirmado contra una liquidacion',
   null,
   'DECLARADO, SIN CATALOGO. El recargo del 19% no cubre la comision del 24%: ver el bloque C.')
on conflict (id) do update set
  nombre = excluded.nombre, tipo = excluded.tipo,
  comision_pct = excluded.comision_pct, margen_extra_pct = excluded.margen_extra_pct,
  envio_lo_paga = excluded.envio_lo_paga,
  catalogo_cargado = excluded.catalogo_cargado,
  catalogo_como_se_carga = excluded.catalogo_como_se_carga,
  comision_confirmada = excluded.comision_confirmada,
  comision_de_donde = excluded.comision_de_donde,
  sincroniza_como = excluded.sincroniza_como,
  notas = excluded.notas;

update public.canales_venta set
  catalogo_cargado = true,
  catalogo_como_se_carga = 'lo trae el plugin de WooCommerce y cruza por SKU contra el maestro',
  comision_confirmada = true,
  comision_de_donde = 'no hay comision: es tienda propia, no hay marketplace cobrando',
  sincroniza_como = 'el plugin de WooCommerce'
 where id = 'woo';

update public.canales_venta set
  catalogo_cargado = false,
  catalogo_como_se_carga = 'conectando la cuenta de Mercado Libre. Hoy no esta conectada y no hay ninguna publicacion cargada',
  comision_confirmada = false,
  comision_de_donde = 'el 13% es el orden de magnitud tipico de Mercado Libre y hay que confirmarlo contra una liquidacion',
  sincroniza_como = null
 where id = 'meli';

update public.canales_venta cv set sucursal_despacho_id = s.id
  from sucursales s
 where cv.id = 'pedidosya_figueiras'
   and s.activa and not s.es_ecommerce
   and lower(s.nombre) like '%figueiras%';

update public.canales_venta cv set sucursal_despacho_id = s.id
  from sucursales s
 where cv.id = 'pedidosya_guzman'
   and s.activa and not s.es_ecommerce
   and (lower(s.nombre) like '%guzm%');

-- ── A.5 y A.6 · EL ESTADO DE CADA CANAL ─────────────────────────────────────
--
-- (El cuerpo final queda en 0252, que arregla el conteo del mostrador.)

create or replace function public.canales_estado()
returns table (
  canal_id text, nombre text, tipo text, activo boolean,
  catalogo_cargado boolean, publicados integer, activos integer, apagados integer,
  comision_pct numeric, comision_confirmada boolean, comision_de_donde text,
  recargo_pct numeric, recargo_cubre_comision boolean,
  ultima_sincronizacion timestamptz, sincroniza_como text,
  que_falta text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    cv.id, cv.nombre, cv.tipo, cv.activo,
    cv.catalogo_cargado,
    case when cv.catalogo_cargado then
      (select count(*)::integer from canal_publicaciones cp where cp.canal_id = cv.id) end,
    case when cv.catalogo_cargado then
      (select count(*)::integer from canal_publicaciones cp
        where cp.canal_id = cv.id and cp.estado = 'publish') end,
    case when cv.catalogo_cargado then
      (select count(*)::integer from canal_publicaciones cp
        where cp.canal_id = cv.id and cp.estado = 'draft') end,
    cv.comision_pct, cv.comision_confirmada, cv.comision_de_donde,
    cv.margen_extra_pct,
    case when cv.comision_confirmada then cv.margen_extra_pct >= cv.comision_pct end,
    case when cv.catalogo_cargado then
      (select max(cp.leido_at) from canal_publicaciones cp where cp.canal_id = cv.id) end,
    cv.sincroniza_como,
    nullif(concat_ws(' · ',
      case when not cv.catalogo_cargado
           then 'el catalogo no esta cargado: ' || coalesce(cv.catalogo_como_se_carga, 'no quedo dicho como se carga') end,
      case when not cv.comision_confirmada
           then 'la comision no esta confirmada: ' || coalesce(cv.comision_de_donde, 'no quedo dicho de donde sale') end,
      case when cv.sincroniza_como is null and cv.catalogo_cargado
           then 'no entra solo: lo que se publique hay que cargarlo a mano' end,
      case when cv.catalogo_cargado
            and (select max(cp.leido_at) from canal_publicaciones cp where cp.canal_id = cv.id) is null
           then 'nunca se registro una sincronizacion' end
    ), '')
  from canales_venta cv
  order by (cv.id = 'mostrador') desc, cv.activo desc, cv.nombre;
$$;

-- ── A.1 · UN PRODUCTO, TODOS SUS CANALES ────────────────────────────────────
--
-- Incluye los canales donde NO esta, porque eso es la mitad de la respuesta:
-- «no esta en Mercado Libre» y «Mercado Libre no esta conectado» son dos
-- cosas distintas y la ficha tiene que distinguirlas.

create or replace function public.producto_canales(p_producto uuid)
returns table (
  canal_id text, canal text, esta_publicado boolean, estado text,
  precio_mostrador numeric, recargo_pct numeric, precio_que_corresponde numeric,
  precio_publicado numeric, diferencia numeric,
  stock_publicado numeric, stock_sifaco numeric,
  desde timestamptz, permalink text, que_no_se_sabe text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with p as (
    select pc.id, pc.precio_sugerido::numeric as mostrador,
           coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                      where ps.producto_id = pc.id and ps.sucursal_id is not null), 0)::numeric as stock
      from productos_catalogo pc where pc.id = p_producto
  )
  select
    cv.id, cv.nombre,
    cp.externo_id is not null,
    cp.estado,
    p.mostrador, cv.margen_extra_pct,
    case when p.mostrador is not null
         then round(p.mostrador * (1 + cv.margen_extra_pct / 100.0), 2) end,
    cp.precio::numeric,
    case when p.mostrador is not null and cp.precio is not null
         then round(cp.precio::numeric - p.mostrador * (1 + cv.margen_extra_pct / 100.0), 2) end,
    cp.stock::numeric, p.stock,
    cp.leido_at, cp.permalink,
    nullif(concat_ws(' · ',
      case when not cv.catalogo_cargado then
        'este canal no tiene catalogo cargado, asi que no se sabe si el producto esta publicado ahi' end,
      case when p.mostrador is null then
        'el producto no tiene precio de mostrador, asi que no se puede decir que precio corresponde' end
    ), '')
  from p
  cross join canales_venta cv
  left join canal_publicaciones cp
    on cp.canal_id = cv.id and cp.producto_id = p.id
  order by (cv.id = 'mostrador') desc, cp.externo_id is not null desc, cv.nombre;
$$;

comment on function public.producto_canales(uuid) is
  'A.1 · Un producto en todos sus canales, incluidos los que no lo tienen: «no '
  'esta en Mercado Libre» y «Mercado Libre no esta conectado» son dos cosas '
  'distintas y la ficha las distingue.';

-- ── A.4 · COMPARAR DOS CANALES ──────────────────────────────────────────────
--
-- **Hoy no se puede correr con lo que el enunciado pedia** —Figueiras contra
-- Guzman en PedidosYa— porque ninguno de los dos tiene catalogo cargado.
--
-- Y con la tienda propia tampoco: es un catalogo unico, sin apertura por
-- sucursal. Por eso PedidosYa se declaro como DOS canales y no como uno con
-- dos sucursales: el dia que entre el catalogo, esta funcion corre sola.

create or replace function public.canales_comparar(p_a text, p_b text)
returns table (
  sku text, nombre text, en_a boolean, en_b boolean,
  estado_a text, estado_b text,
  precio_a numeric, precio_b numeric, stock_sifaco numeric,
  solo_en text, por_que_puede_ser text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with a as (select * from canal_publicaciones where canal_id = p_a),
       b as (select * from canal_publicaciones where canal_id = p_b),
  juntos as (
    select coalesce(a.sku, b.sku) as sku,
           coalesce(a.nombre, b.nombre) as nombre,
           coalesce(a.producto_id, b.producto_id) as producto_id,
           a.externo_id is not null as en_a, b.externo_id is not null as en_b,
           a.estado as estado_a, b.estado as estado_b,
           a.precio::numeric as precio_a, b.precio::numeric as precio_b
      from a full outer join b on b.sku = a.sku
  )
  select j.sku, j.nombre, j.en_a, j.en_b, j.estado_a, j.estado_b,
         j.precio_a, j.precio_b,
         coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                    where ps.producto_id = j.producto_id and ps.sucursal_id is not null), 0)::numeric,
         case when j.en_a and not j.en_b then p_a
              when j.en_b and not j.en_a then p_b end,
         case
           when j.en_a and j.en_b then null
           when j.producto_id is null then
             'el SKU no cruza con el maestro de SIFACO, asi que no se puede saber si falta a proposito'
           when coalesce((select sum(ps.stock) from producto_stock_sifaco ps
                           where ps.producto_id = j.producto_id
                             and ps.sucursal_id is not null), 0) = 0 then
             'no hay stock en ninguna sucursal: puede ser que no se publique por eso'
           when exists (select 1 from productos_catalogo pc
                         where pc.id = j.producto_id
                           and (pc.requiere_receta or pc.es_controlado or pc.es_psicotropico
                                or pc.condicion_venta in ('requiere_receta','receta_archivada','estupefaciente_psico_ii'))) then
             'es un producto de condicion legal: no deberia estar en ningun canal abierto'
           else
             'hay stock y no es de condicion legal, asi que no se encuentra el motivo en los datos'
         end
  from juntos j
  where not (j.en_a and j.en_b)
  order by j.sku;
$$;

comment on function public.canales_comparar(text, text) is
  'A.4 · Que tiene un canal que el otro no. Con el motivo cuando esta en los '
  'datos y diciendo que no se encuentra cuando no. Hoy no corre para PedidosYa '
  'Figueiras contra Guzman: ninguno tiene catalogo cargado.';

revoke all on function public.canales_estado() from public, anon, authenticated;
revoke all on function public.producto_canales(uuid) from public, anon, authenticated;
revoke all on function public.canales_comparar(text, text) from public, anon, authenticated;
grant execute on function public.canales_estado() to service_role;
grant execute on function public.producto_canales(uuid) to service_role;
grant execute on function public.canales_comparar(text, text) to service_role;
