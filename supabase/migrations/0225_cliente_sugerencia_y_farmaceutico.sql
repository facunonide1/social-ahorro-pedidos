-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0225 · EL CLIENTE, LA SUGERENCIA Y EL FARMACÉUTICO                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── E.3 · QUÉ SE VE DEL CLIENTE, Y QUÉ NO ───────────────────────────────────
--
-- Qué compró la última vez es un **hecho comercial**: una farmacia tiene el
-- historial de compras de sus clientes igual que un almacén. Eso se muestra.
--
-- Lo que no se muestra ni se guarda: nada clínico. Y «es crónico» NO se deduce
-- de que compre un remedio: se deduce de que **repita la misma compra** con
-- regularidad, que es un patrón comercial.
--
-- La diferencia importa. «Compra cada 30 días» es un hecho de caja. «Es
-- hipertenso» es una inferencia clínica, y el sistema no la hace ni la guarda
-- aunque sea la conclusión obvia: en el momento en que la escribiera, NORA
-- tendría una base de datos de diagnósticos.

create or replace function public.mostrador_buscar_cliente(p_q text, p_limite integer default 8)
returns table (
  id uuid, nombre text, dni text, telefono text,
  ultima_compra date, n_compras_12m integer, total_gastado_12m numeric,
  sucursal_habitual text,
  -- Si tiene un pedido esperando retiro. Es lo primero que hay que decirle.
  pedidos_esperando integer, es_demo boolean
)
language sql stable security definer set search_path to 'public'
as $$
  with q as (select convenio_normalizar(coalesce(p_q, '')) as txt,
                    regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g') as num)
  select
    c.id, c.nombre, c.dni, c.telefono, c.ultima_compra,
    c.n_compras_12m, c.total_gastado_12m, s.nombre,
    (select count(*)::int from orders o
      where o.cliente_id = c.id
        and o.status in ('nuevo', 'confirmado', 'en_preparacion', 'listo')),
    c.es_demo
  from clientes c
  left join sucursales s on s.id = c.sucursal_habitual_id
  cross join q
  where c.activo and q.txt <> ''
    and (
      (length(q.num) >= 6 and (c.dni = q.num
        or regexp_replace(coalesce(c.telefono,''), '[^0-9]', '', 'g') like '%' || q.num || '%'))
      or convenio_normalizar(c.nombre) like '%' || q.txt || '%'
    )
  order by (c.dni = q.num) desc, c.ultima_compra desc nulls last
  limit p_limite;
$$;

comment on function public.mostrador_buscar_cliente(text, integer) is
  'E.1 · Buscar al cliente por DNI, telefono o nombre. Devuelve hechos comerciales: que gasto, cuando compro, si tiene un pedido esperando. Nada clinico.';

create or replace function public.mostrador_cliente(p_cliente uuid, p_sucursal uuid default null)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', c.id, 'nombre', c.nombre, 'telefono', c.telefono, 'dni', c.dni,
    'es_demo', c.es_demo, 'ultima_compra', c.ultima_compra,
    'n_compras_12m', c.n_compras_12m, 'frecuencia_dias', c.frecuencia_compra_dias,
    'ultima', (select jsonb_build_object('fecha', cc.fecha, 'monto', cc.monto,
                                         'productos', cc.productos)
                 from cliente_compras cc where cc.cliente_id = c.id
                order by cc.fecha desc limit 1),
    'esperando', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', o.id, 'numero', o.manual_order_number, 'estado', o.status,
                     'forma_entrega', o.forma_entrega, 'total', o.total,
                     'sucursal', s.nombre) order by o.created_at), '[]'::jsonb)
                   from orders o left join sucursales s on s.id = o.sucursal_id
                  where o.cliente_id = c.id
                    and o.status in ('nuevo','confirmado','en_preparacion','listo')),
    -- ── «LE TOCA REPONER» ───────────────────────────────────────────────
    -- Se calcula con la frecuencia de SUS compras, no con lo que compra.
    'le_toca_reponer', case
      when c.frecuencia_compra_dias is null or c.ultima_compra is null then null
      when (current_date - c.ultima_compra) > c.frecuencia_compra_dias then true
      else false end,
    'dias_sin_venir', case when c.ultima_compra is null then null
                           else (current_date - c.ultima_compra) end,
    'por_que_no_se_sabe', case
      when c.frecuencia_compra_dias is null
        then 'no hay suficientes compras registradas para saber cada cuanto vuelve'
      when c.ultima_compra is null then 'no hay ninguna compra registrada' end
  )
  from clientes c where c.id = p_cliente;
$$;

comment on function public.mostrador_cliente(uuid, uuid) is
  'E.3 · Que compro, si tiene un pedido esperando, y si por la frecuencia de SUS compras le toca volver. Nada clinico: «es cronico» se deduciria de lo que compra, y eso seria una inferencia medica.';

-- ── E.4 · UNA SOLA SUGERENCIA, Y QUE APRENDA ────────────────────────────────
--
-- **La mejor, no tres.** Tres son ruido y el empleado deja de mirarlas.
--
-- Y si la que se ofrece no se acepta nunca, se deja de ofrecer. Para eso hay
-- que registrar que se ofreció y qué pasó.
--
-- ── LO QUE NO ES ────────────────────────────────────────────────────────────
--
-- No es una sugerencia clínica. Es una regla COMERCIAL: «quien lleva A suele
-- llevar B». Una regla que sugiriera un medicamento a partir de otro sería
-- indicar un tratamiento, **y la base la rechaza con un trigger**.

create table if not exists public.mostrador_reglas_cruzada (
  id uuid primary key default gen_random_uuid(),
  disparador_producto_id uuid references public.productos_catalogo(id) on delete cascade,
  disparador_categoria   text,
  sugerido_producto_id   uuid not null references public.productos_catalogo(id) on delete cascade,
  -- Por qué. Se muestra al empleado: una sugerencia sin motivo no se usa.
  por_que       text not null,
  activa        boolean not null default true,
  creada_por    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (disparador_producto_id is not null or disparador_categoria is not null)
);

create index if not exists mostrador_reglas_disp
  on public.mostrador_reglas_cruzada (disparador_producto_id) where activa;
create index if not exists mostrador_reglas_cat
  on public.mostrador_reglas_cruzada (disparador_categoria) where activa;

comment on table public.mostrador_reglas_cruzada is
  'Reglas COMERCIALES de venta cruzada. No clinicas: una regla que sugiriera un medicamento a partir de otro seria indicar un tratamiento. Las que apuntan a algo con receta se rechazan.';

create or replace function public.tg_regla_cruzada_sin_receta()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_cond text; v_nombre text;
begin
  select condicion_venta, nombre into v_cond, v_nombre
    from productos_catalogo where id = new.sugerido_producto_id;
  if v_cond in ('requiere_receta', 'receta_archivada', 'estupefaciente_psico_ii') then
    raise exception
      'No se puede sugerir «%» en una venta cruzada: requiere receta. Sugerir un producto con receta a partir de otra compra es indicar un tratamiento, y eso lo hace una persona con matricula.',
      v_nombre;
  end if;
  return new;
end $$;

drop trigger if exists regla_cruzada_sin_receta on public.mostrador_reglas_cruzada;
create trigger regla_cruzada_sin_receta
  before insert or update on public.mostrador_reglas_cruzada
  for each row execute function public.tg_regla_cruzada_sin_receta();

create table if not exists public.mostrador_sugerencias_log (
  id uuid primary key default gen_random_uuid(),
  regla_id    uuid references public.mostrador_reglas_cruzada(id) on delete cascade,
  sugerido_producto_id uuid references public.productos_catalogo(id) on delete set null,
  sucursal_id uuid references public.sucursales(id) on delete set null,
  -- Null mientras nadie contestó. No es «la rechazó»: es que no se sabe.
  aceptada    boolean,
  ofrecido_por uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists mostrador_sug_log_regla
  on public.mostrador_sugerencias_log (regla_id, created_at desc);

comment on table public.mostrador_sugerencias_log is
  'Que sugerencia se ofrecio y si se acepto. aceptada en null = nadie contesto, que no es lo mismo que la rechazo.';
comment on column public.mostrador_sugerencias_log.aceptada is
  'Null = nadie contesto. No cuenta ni como aceptada ni como rechazada: una regla no se apaga porque el empleado no haya tocado el boton.';

-- La sugerencia: UNA, la mejor, y sólo si la regla no está quemada.
--
-- «Quemada» = se ofreció 10 veces o más y se rechazó siempre. Diez es una
-- decisión: con tres podría ser casualidad y con cincuenta ya se perdió mucho
-- tiempo del empleado.
create or replace function public.mostrador_sugerencia(p_producto uuid, p_sucursal uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with prod as (
    select id, categoria::text as categoria from productos_catalogo where id = p_producto
  ),
  candidatas as (
    select r.id as regla_id, r.sugerido_producto_id, r.por_que,
      (r.disparador_producto_id is not null) as es_especifica,
      (select count(*) from mostrador_sugerencias_log l
        where l.regla_id = r.id and l.aceptada is not null) as contestadas,
      (select count(*) from mostrador_sugerencias_log l
        where l.regla_id = r.id and l.aceptada) as aceptadas
    from mostrador_reglas_cruzada r, prod p
    where r.activa
      and (r.disparador_producto_id = p.id
           or (r.disparador_categoria is not null and r.disparador_categoria = p.categoria))
      and r.sugerido_producto_id <> p.id
  ),
  viva as (
    -- E.4 · la que nunca se acepta deja de ofrecerse.
    select c.* from candidatas c where not (c.contestadas >= 10 and c.aceptadas = 0)
  ),
  con_stock as (
    select v.*, pc.nombre, pc.sku,
      coalesce(o.precio_con_descuento, pc.precio_sugerido) as precio,
      coalesce(si.cantidad, 0) as stock
    from viva v
    join productos_catalogo pc on pc.id = v.sugerido_producto_id
    left join stock_items si on si.producto_id = pc.id and si.sucursal_id = p_sucursal
    left join lateral (
      select precio_con_descuento from ofertas_sifaco of
       where of.producto_id = pc.id and of.estado in ('vigente','sin_vencimiento')
       order by of.descuento_efectivo_pct desc nulls last limit 1) o on true
    -- Sugerir algo que no hay es peor que no sugerir nada.
    where coalesce(si.cantidad, 0) > 0
  )
  select case when count(*) = 0 then
    jsonb_build_object('hay', false, 'por_que', case
      when not exists (select 1 from mostrador_reglas_cruzada where activa)
        then 'no hay ninguna regla de venta cruzada cargada'
      when exists (select 1 from candidatas) and not exists (select 1 from viva)
        then 'la unica regla que aplicaba se ofrecio 10 veces y nunca se acepto: se dejo de ofrecer'
      when exists (select 1 from viva)
        then 'la regla que aplicaba sugiere algo que no hay en stock aca'
      else 'no hay ninguna regla para este producto' end)
  else
    (select jsonb_build_object('hay', true, 'regla_id', regla_id,
       'producto_id', sugerido_producto_id, 'nombre', nombre, 'sku', sku,
       'precio', precio, 'stock', stock, 'por_que', por_que,
       'veces_ofrecida', contestadas, 'veces_aceptada', aceptadas)
     from con_stock
     order by es_especifica desc,
              case when contestadas > 0 then aceptadas::numeric / contestadas else 0.5 end desc,
              precio desc
     limit 1)
  end
  from con_stock;
$$;

comment on function public.mostrador_sugerencia(uuid, uuid) is
  'E.4 · UNA sugerencia, la mejor. No ofrece lo que no hay en stock, y no ofrece una regla que se ofrecio 10 veces y nunca se acepto.';

-- ── E.6 · LLAMAR AL FARMACÉUTICO, Y SI ESTÁ ─────────────────────────────────
--
-- Hoy nadie sabe si está ocupado. Lo que se puede saber con lo que hay: quién
-- es farmacéutico y tiene matrícula, y si fichó hoy y no fichó la salida.
--
-- Lo que NO se puede saber es si en este momento está atendiendo a alguien.
-- Entonces no se dice «disponible»: se dice **«fichó a las 8 y no fichó la
-- salida»**, que es un hecho, y el empleado decide.
--
-- Hoy hay CERO farmacéuticos cargados. La función lo dice en vez de devolver
-- una lista vacía.

create or replace function public.mostrador_farmaceuticos(p_sucursal uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with f as (
    select e.id, e.nombre_completo, e.telefono, e.matricula, e.sucursal_id,
           s.nombre as sucursal, (e.sucursal_id = p_sucursal) as es_de_aca,
           t.hora_entrada, t.hora_salida, t.fecha
      from empleados e
      left join sucursales s on s.id = e.sucursal_id
      left join lateral (
        select hora_entrada, hora_salida, fecha from empleado_turnos et
         where et.empleado_id = e.id and et.fecha = current_date
         order by et.hora_entrada desc limit 1) t on true
     where e.activo and e.es_farmaceutico
  )
  select jsonb_build_object(
    'hay_alguno', (select count(*) > 0 from f),
    'por_que_no', case when (select count(*) from f) = 0
      then 'no hay ningun farmaceutico cargado en el sistema. Que la lista este vacia no quiere decir que no haya farmaceutico en el local: quiere decir que nadie lo cargo, y por eso el sistema no puede decir si esta'
      end,
    'aca', (select coalesce(jsonb_agg(jsonb_build_object(
              'nombre', nombre_completo, 'telefono', telefono, 'matricula', matricula,
              'ficho_hoy', hora_entrada is not null,
              'hora_entrada', hora_entrada, 'hora_salida', hora_salida,
              'que_se_sabe', case
                when hora_entrada is null then 'no ficho hoy: no se sabe si esta'
                when hora_salida is not null then 'ficho la salida a las ' || hora_salida::text
                else 'ficho a las ' || hora_entrada::text || ' y no ficho la salida'
              end) order by nombre_completo), '[]'::jsonb) from f where es_de_aca),
    'en_otras', (select coalesce(jsonb_agg(jsonb_build_object(
              'nombre', nombre_completo, 'telefono', telefono, 'sucursal', sucursal,
              'ficho_hoy', hora_entrada is not null) order by nombre_completo), '[]'::jsonb)
              from f where not es_de_aca),
    'ojo', 'El sistema sabe si fichó, no si está libre. Si fichó y no fichó la salida, está en el local; si está atendiendo a alguien, eso no se puede saber desde acá.'
  );
$$;

comment on function public.mostrador_farmaceuticos(uuid) is
  'E.6 · Quien es farmaceutico y que se puede saber de si esta. NO dice «disponible»: dice si ficho y si no ficho la salida, que es un hecho.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.mostrador_reglas_cruzada   enable row level security;
alter table public.mostrador_sugerencias_log  enable row level security;

drop policy if exists reglas_cruzada_ver on public.mostrador_reglas_cruzada;
create policy reglas_cruzada_ver on public.mostrador_reglas_cruzada
  for select to authenticated using ((select hub_puede_ver('operaciones')));

-- Las reglas las carga quien decide qué se ofrece, no quien atiende.
drop policy if exists reglas_cruzada_crear on public.mostrador_reglas_cruzada;
create policy reglas_cruzada_crear on public.mostrador_reglas_cruzada
  for insert to authenticated with check ((select hub_puede('ofertas','crear')));

drop policy if exists reglas_cruzada_editar on public.mostrador_reglas_cruzada;
create policy reglas_cruzada_editar on public.mostrador_reglas_cruzada
  for update to authenticated
  using ((select hub_puede('ofertas','editar')))
  with check ((select hub_puede('ofertas','editar')));

drop policy if exists sug_log_ver on public.mostrador_sugerencias_log;
create policy sug_log_ver on public.mostrador_sugerencias_log
  for select to authenticated using ((select hub_puede_ver('operaciones')));

drop policy if exists sug_log_crear on public.mostrador_sugerencias_log;
create policy sug_log_crear on public.mostrador_sugerencias_log
  for insert to authenticated
  with check ((select hub_puede('operaciones','crear'))
              and (sucursal_id is null or (select hub_ve_sucursal(sucursal_id))));

drop policy if exists sug_log_editar on public.mostrador_sugerencias_log;
create policy sug_log_editar on public.mostrador_sugerencias_log
  for update to authenticated
  using ((select hub_puede('operaciones','crear')))
  with check ((select hub_puede('operaciones','crear')));

revoke all on function public.tg_regla_cruzada_sin_receta() from public, anon, authenticated;
revoke all on function public.mostrador_buscar_cliente(text, integer) from public, anon;
revoke all on function public.mostrador_cliente(uuid, uuid) from public, anon;
revoke all on function public.mostrador_sugerencia(uuid, uuid) from public, anon;
revoke all on function public.mostrador_farmaceuticos(uuid) from public, anon;
grant execute on function public.mostrador_buscar_cliente(text, integer) to authenticated, service_role;
grant execute on function public.mostrador_cliente(uuid, uuid) to authenticated, service_role;
grant execute on function public.mostrador_sugerencia(uuid, uuid) to authenticated, service_role;
grant execute on function public.mostrador_farmaceuticos(uuid) to authenticated, service_role;
