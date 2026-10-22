-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0223 · EL FALTANTE REGISTRADO                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Es lo más valioso del prompt y lo más barato de construir.
--
-- Cuando alguien pide algo que no hay, esa información se pierde. Nadie la
-- anota. **Es la demanda invisible del negocio**: lo único que convierte «se
-- fue sin comprar» en un dato.
--
-- ── LO QUE YA EXISTÍA, Y POR QUÉ NO SE HIZO UNA TABLA NUEVA ─────────────────
--
-- `demanda_invisible` existe desde la v0.50 con texto_pedido, producto_id,
-- sucursal_id, registrado_por y created_at. Tiene **cero filas**: se construyó
-- y nadie la usó, probablemente porque registrar costaba más de un toque.
--
-- Hacer una tabla nueva habría dejado dos lugares donde buscar la misma cosa.
-- Se extiende la que está.
--
-- ── D.2 · LO QUE FALTABA ────────────────────────────────────────────────────
--
-- `desenlace`: qué pasó. Es la mitad del valor — «se fue» y «se llevó otra
-- cosa» son dos hechos distintos y hoy los dos se veían igual, como una venta
-- perdida. Si se llevó otra cosa, la venta no se perdió: cambió de producto.
--
-- `precio_al_pedir`: el precio del producto EN ESE MOMENTO. Se guarda en vez
-- de mirarlo después porque los precios cambian todas las semanas, y una venta
-- perdida de marzo valuada a precio de octubre es un número inventado.
--
-- ── Y LA LÍNEA QUE NO SE CRUZA ──────────────────────────────────────────────
--
-- `texto_pedido` es **lo que el empleado escribió para buscar un producto**.
-- No es el motivo de la consulta, no es un síntoma y no es una pregunta
-- clínica: cuando la pregunta es clínica, el mostrador no busca y no registra
-- nada (ver `SENAL_CLINICA` en la pantalla).
--
-- No hay columna de paciente, de síntoma ni de motivo de compra, y no la va a
-- haber: «para mejorar la sugerencia» es exactamente la frase que la haría
-- aparecer.

do $$ begin
  create type demanda_desenlace as enum (
    'se_fue',              -- no se le pudo ofrecer nada
    'se_llevo_otra',       -- se le ofreció un equivalente y lo aceptó
    'se_le_ofrecio_traer', -- quedó un pedido o una transferencia
    'no_se_registro'       -- el empleado no contestó. Honesto: no se sabe.
  );
exception when duplicate_object then null; end $$;

alter table public.demanda_invisible
  add column if not exists desenlace demanda_desenlace not null default 'no_se_registro',
  add column if not exists cantidad numeric,
  -- Null cuando no se matcheó contra el catálogo: ahí no hay precio que
  -- guardar, y es justamente el caso que dice que no se trabaja algo que te
  -- piden.
  add column if not exists precio_al_pedir numeric,
  add column if not exists reemplazo_producto_id uuid
    references public.productos_catalogo(id) on delete set null,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists transferencia_id uuid
    references public.transferencias_sucursal(id) on delete set null,
  -- El texto normalizado, para poder agrupar «ibupirac» con «ibu pirac».
  add column if not exists texto_norm text;

create index if not exists demanda_inv_suc on public.demanda_invisible (sucursal_id, created_at desc);
create index if not exists demanda_inv_prod on public.demanda_invisible (producto_id)
  where producto_id is not null;
create index if not exists demanda_inv_norm on public.demanda_invisible (texto_norm)
  where producto_id is null;
create index if not exists demanda_inv_fecha on public.demanda_invisible (created_at desc);

comment on table public.demanda_invisible is
  'Lo que pidieron y no habia. texto_pedido es lo que el empleado escribio para BUSCAR UN PRODUCTO: no es un sintoma ni el motivo de la consulta, y no hay columna donde ponerlos.';
comment on column public.demanda_invisible.desenlace is
  'Que paso. «se fue» y «se llevo otra cosa» son dos hechos distintos y hasta la v1.2 los dos se veian igual.';
comment on column public.demanda_invisible.precio_al_pedir is
  'El precio de ESE momento. Los precios cambian todas las semanas: una venta perdida de marzo valuada a precio de octubre es un numero inventado.';
comment on column public.demanda_invisible.texto_norm is
  'El texto normalizado, para agrupar «ibupirac» con «ibu pirac» al contar que piden y no se trabaja.';

create or replace function public.tg_demanda_invisible_norm()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  new.texto_norm := convenio_normalizar(coalesce(new.texto_pedido, ''));
  return new;
end $$;

drop trigger if exists demanda_invisible_norm on public.demanda_invisible;
create trigger demanda_invisible_norm
  before insert or update of texto_pedido on public.demanda_invisible
  for each row execute function public.tg_demanda_invisible_norm();

-- Función de trigger: no se llama por RPC nunca. Nace con EXECUTE para PUBLIC.
revoke all on function public.tg_demanda_invisible_norm() from public, anon, authenticated;

-- ── D.1 · REGISTRARLO CUESTA UN TOQUE ───────────────────────────────────────

create or replace function public.demanda_registrar(
  p_texto text, p_sucursal uuid, p_desenlace text default 'no_se_registro',
  p_producto uuid default null, p_usuario uuid default null, p_cantidad numeric default 1,
  p_reemplazo uuid default null, p_order uuid default null, p_transf uuid default null
)
returns jsonb
language plpgsql volatile security definer set search_path to 'public'
as $$
declare v_id uuid; v_precio numeric; v_veces int;
begin
  if coalesce(btrim(p_texto), '') = '' and p_producto is null then
    return jsonb_build_object('ok', false, 'motivo',
      'no hay nada que registrar: falta el texto o el producto');
  end if;

  -- El precio de ESTE momento, si se pudo matchear. La oferta cuenta: es lo
  -- que el cliente habría pagado.
  if p_producto is not null then
    select coalesce(o.precio_con_descuento, p.precio_sugerido) into v_precio
      from productos_catalogo p
      left join lateral (
        select precio_con_descuento from ofertas_sifaco of
         where of.producto_id = p.id and of.estado in ('vigente', 'sin_vencimiento')
         order by of.descuento_efectivo_pct desc nulls last limit 1) o on true
     where p.id = p_producto;
  end if;

  insert into demanda_invisible (
    texto_pedido, producto_id, sucursal_id, registrado_por, desenlace,
    cantidad, precio_al_pedir, reemplazo_producto_id, order_id, transferencia_id, es_demo
  ) values (
    nullif(btrim(coalesce(p_texto, '')), ''), p_producto, p_sucursal, p_usuario,
    p_desenlace::demanda_desenlace,
    coalesce(p_cantidad, 1), v_precio, p_reemplazo, p_order, p_transf, false
  ) returning id into v_id;

  -- Cuántas veces ya pasó lo mismo. Es lo que le da sentido al registro: una
  -- vez es una anécdota, doce veces es una compra que hay que hacer.
  select count(*) into v_veces
    from demanda_invisible d
   where d.sucursal_id = p_sucursal and d.created_at >= current_date - 90
     and (case when p_producto is not null then d.producto_id = p_producto
               else d.texto_norm = convenio_normalizar(p_texto) end);

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'veces_en_90_dias', v_veces,
    'precio_al_pedir', v_precio, 'se_matcheo', p_producto is not null,
    'que_significa', case
      when p_producto is null then
        'Quedo guardado el texto tal cual. Esto es lo que mas sirve: dice que te piden y no trabajas.'
      when v_veces >= 5 then
        format('Van %s veces en 90 dias. Esto ya no es una anecdota: entra al plan de compra como demanda real.', v_veces)
      else format('Van %s vez/veces en 90 dias.', v_veces)
    end
  );
end $$;

comment on function public.demanda_registrar(text, uuid, text, uuid, uuid, numeric, uuid, uuid, uuid) is
  'D.1 · El faltante, en un toque. Guarda el precio del momento: los precios cambian todas las semanas y una venta perdida valuada a precio de hoy es un numero inventado.';

-- ── D.4 · LO QUE SE PUEDE VER DESPUÉS ───────────────────────────────────────

create or replace view public.demanda_invisible_resumen
with (security_invoker = true) as
select
  d.producto_id, p.sku, p.nombre, p.laboratorio,
  d.sucursal_id, s.nombre as sucursal,
  count(*)::int as veces,
  sum(coalesce(d.cantidad, 1)) as unidades_pedidas,
  -- La venta perdida MEDIDA: lo pedido por el precio de ese momento.
  sum(coalesce(d.cantidad, 1) * coalesce(d.precio_al_pedir, 0)) as venta_perdida_medida,
  count(*) filter (where d.desenlace = 'se_fue')::int as se_fueron,
  count(*) filter (where d.desenlace = 'se_llevo_otra')::int as se_llevaron_otra,
  count(*) filter (where d.desenlace = 'se_le_ofrecio_traer')::int as se_ofrecio_traer,
  count(*) filter (where d.desenlace = 'no_se_registro')::int as sin_desenlace,
  -- La que de verdad se perdió: si se llevó otra cosa, la venta cambió de
  -- producto, no se perdió.
  sum(case when d.desenlace = 'se_fue'
           then coalesce(d.cantidad, 1) * coalesce(d.precio_al_pedir, 0) else 0 end)
    as venta_perdida_de_los_que_se_fueron,
  min(d.created_at) as desde, max(d.created_at) as hasta,
  -- Cuántos de esos pedidos no tenían precio: ahí la plata está subestimada y
  -- hay que decirlo.
  count(*) filter (where d.precio_al_pedir is null)::int as sin_precio
from demanda_invisible d
join productos_catalogo p on p.id = d.producto_id
join sucursales s on s.id = d.sucursal_id
where d.producto_id is not null and not d.es_demo
group by d.producto_id, p.sku, p.nombre, p.laboratorio, d.sucursal_id, s.nombre
order by sum(coalesce(d.cantidad, 1) * coalesce(d.precio_al_pedir, 0)) desc;

comment on view public.demanda_invisible_resumen is
  'D.4 · Que producto del catalogo se pidio y no habia, por sucursal, con la venta perdida MEDIDA. venta_perdida_de_los_que_se_fueron es la que de verdad se perdio.';

-- D.3 · Lo que no se matchea igual se guarda: es lo que dice qué marcas NO se
-- trabajan y la gente igual pide.
create or replace view public.demanda_sin_catalogo
with (security_invoker = true) as
select
  d.texto_norm,
  (array_agg(d.texto_pedido order by length(d.texto_pedido) desc))[1] as texto,
  array_agg(distinct d.texto_pedido) as como_lo_escribieron,
  count(*)::int as veces,
  count(distinct d.sucursal_id)::int as sucursales,
  (array_agg(s.nombre order by d.created_at desc))[1] as ultima_sucursal,
  count(*) filter (where d.desenlace = 'se_fue')::int as se_fueron,
  min(d.created_at) as desde, max(d.created_at) as hasta
from demanda_invisible d
left join sucursales s on s.id = d.sucursal_id
where d.producto_id is null and not d.es_demo and coalesce(d.texto_norm, '') <> ''
group by d.texto_norm
order by count(*) desc, max(d.created_at) desc;

comment on view public.demanda_sin_catalogo is
  'D.3 · Lo que pidieron y NO esta en el catalogo, agrupado por el texto normalizado. Es lo que dice que marcas no trabajas y te estan pidiendo.';

-- ── D.5 Y D.6 · LA SEÑAL PARA EL PLAN, Y LOS DOS NÚMEROS ────────────────────
--
-- NORA ya calcula la venta perdida con una fórmula:
-- `quiebres_por_sucursal.plata_de_un_mes`, que supone que la venta se pierde
-- entera. En una farmacia el que no encuentra una marca se lleva otra, así que
-- ese número sirve para ordenar y no como plata.
--
-- Con el faltante registrado hay un número REAL al lado. La vista muestra los
-- dos y **nunca los suma**: son dos cosas distintas medidas de dos formas.

create or replace view public.demanda_real_vs_estimada
with (security_invoker = true) as
select
  coalesce(q.producto_id, r.producto_id) as producto_id,
  coalesce(q.sucursal_id, r.sucursal_id) as sucursal_id,
  coalesce(q.sku, r.sku) as sku,
  coalesce(q.nombre, r.nombre) as nombre,
  coalesce(q.sucursal_nombre, r.sucursal) as sucursal,

  -- ESTIMADO · la fórmula. Supone que la venta se pierde entera.
  q.por_mes as venta_mensual_historica,
  q.plata_de_un_mes as perdida_estimada_mes,
  q.sin_costo as estimacion_sin_costo,

  -- MEDIDO · lo que alguien registró.
  coalesce(r.veces, 0) as veces_pedido,
  coalesce(r.venta_perdida_medida, 0) as perdida_medida,
  coalesce(r.venta_perdida_de_los_que_se_fueron, 0) as perdida_medida_de_los_que_se_fueron,
  coalesce(r.se_llevaron_otra, 0) as se_llevaron_otra,
  r.sin_precio as medido_sin_precio,

  case
    when r.veces is null and q.producto_id is not null then
      'solo estimado: nadie registro que lo pidieran, asi que no se sabe si de verdad lo piden'
    when q.producto_id is null and r.veces is not null then
      'solo medido: no esta en quiebre segun el stock, pero alguien lo pidio y no habia'
    when r.se_llevaron_otra > 0 and r.se_fueron = 0 then
      'medido: lo pidieron y siempre se llevaron otra cosa. La venta no se perdio, cambio de producto'
    else 'los dos: la estimacion ordena, el medido es plata que se fue'
  end as que_dicen_los_dos
from quiebres_por_sucursal q
full outer join demanda_invisible_resumen r
  on r.producto_id = q.producto_id and r.sucursal_id = q.sucursal_id
where coalesce(r.veces, 0) > 0 or q.producto_id is not null;

comment on view public.demanda_real_vs_estimada is
  'D.6 · La venta perdida estimada (formula) al lado de la medida (registrada). NUNCA se suman: son dos cosas distintas medidas de dos formas.';

-- D.5 · Lo que el plan de compra mira, marcado como demanda REAL.
--
-- Umbral: 3 veces en 90 días en la misma sucursal. Es una decisión, no un
-- dato: con una vez no se compra y con doce ya se perdió plata. Tres es donde
-- deja de ser una anécdota.
create or replace view public.demanda_real_para_el_plan
with (security_invoker = true) as
select
  r.producto_id, r.sku, r.nombre, r.laboratorio,
  r.sucursal_id, r.sucursal, r.veces, r.unidades_pedidas,
  r.venta_perdida_medida, r.venta_perdida_de_los_que_se_fueron,
  r.se_fueron, r.se_llevaron_otra, r.desde, r.hasta,
  'demanda_real'::text as origen,
  format('Lo pidieron %s veces en los ultimos 90 dias en %s y no habia. %s',
         r.veces, r.sucursal,
         case when r.se_fueron > 0 then format('%s se fueron sin comprar.', r.se_fueron)
              else 'Siempre se llevaron otra cosa, asi que la venta no se perdio.' end) as por_que,
  -- Si hoy hay stock, la señal es histórica: sirve para el punto de pedido, no
  -- para comprar ahora.
  coalesce(si.cantidad, 0) as stock_hoy
from demanda_invisible_resumen r
left join stock_items si on si.producto_id = r.producto_id and si.sucursal_id = r.sucursal_id
where r.veces >= 3 and r.hasta >= current_date - 90
order by r.venta_perdida_medida desc;

comment on view public.demanda_real_para_el_plan is
  'D.5 · La señal para el plan de compra, marcada como demanda_real y no como pronostico. Umbral de 3 veces en 90 dias: es una decision, no un dato.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Quien atiende registra lo de SU sucursal y ve lo de su sucursal.

alter table public.demanda_invisible enable row level security;

drop policy if exists demanda_invisible_ver on public.demanda_invisible;
create policy demanda_invisible_ver on public.demanda_invisible
  for select to authenticated
  using ((select hub_puede_ver('operaciones')) and (select hub_ve_sucursal(sucursal_id)));

drop policy if exists demanda_invisible_crear on public.demanda_invisible;
create policy demanda_invisible_crear on public.demanda_invisible
  for insert to authenticated
  with check ((select hub_puede('operaciones','crear')) and (select hub_ve_sucursal(sucursal_id)));

-- Se puede corregir el desenlace: el empleado marca «se fue» y el cliente
-- vuelve a los diez minutos. Lo que no se puede es borrarlo — no hay política
-- de delete, a propósito: un faltante borrado es una venta perdida que
-- desaparece del dato, que es lo contrario de este bloque.
drop policy if exists demanda_invisible_editar on public.demanda_invisible;
create policy demanda_invisible_editar on public.demanda_invisible
  for update to authenticated
  using ((select hub_puede('operaciones','editar')) and (select hub_ve_sucursal(sucursal_id)))
  with check ((select hub_puede('operaciones','editar')) and (select hub_ve_sucursal(sucursal_id)));

revoke all on function public.demanda_registrar(text, uuid, text, uuid, uuid, numeric, uuid, uuid, uuid) from public, anon;
grant execute on function public.demanda_registrar(text, uuid, text, uuid, uuid, numeric, uuid, uuid, uuid) to authenticated, service_role;
