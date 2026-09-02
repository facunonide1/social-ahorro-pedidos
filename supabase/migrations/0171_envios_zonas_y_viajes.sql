-- 0171 · v0.91-pedidos · BLOQUE D
--
-- ENVÍOS: ZONAS POR SUCURSAL, TARIFAS Y VIAJES.
--
-- ── POR QUÉ LA ZONA ES POR SUCURSAL ─────────────────────────────────────────
--
-- «Zona 1» no quiere decir nada sin decir de dónde sale. La zona 1 de Guzmán y
-- la zona 1 de Tesei son dos recorridos distintos, con dos tarifas distintas y
-- dos costos distintos. `zonas_reparto` era una lista global: se le agrega la
-- sucursal.
--
-- Las zonas que ya existen quedan con `sucursal_id` en null —«zona sin sucursal
-- asignada»— y la pantalla lo dice. Repartirlas a mano entre las cuatro sería
-- inventar a qué local pertenece cada barrio.

alter table zonas_reparto add column if not exists sucursal_id uuid references sucursales(id);
alter table zonas_reparto add column if not exists tarifa numeric;
alter table zonas_reparto add column if not exists km_estimados numeric;
alter table zonas_reparto add column if not exists minutos_estimados integer;

comment on column zonas_reparto.sucursal_id is
  'De qué sucursal sale esta zona. La zona 1 de Guzmán no es la zona 1 de Tesei.';
comment on column zonas_reparto.tarifa is
  'Lo que se le cobra al cliente por llegar a esta zona. NULL = nadie la definió, que no es lo mismo que gratis.';
comment on column zonas_reparto.km_estimados is
  'Distancia estimada del viaje. Sirve para estimar el costo; no lo mide nadie.';

create index if not exists zonas_reparto_sucursal_idx on zonas_reparto (sucursal_id);

-- ── LAS REGLAS GENERALES, POR SUCURSAL ──────────────────────────────────────
create table if not exists envios_config (
  sucursal_id        uuid primary key references sucursales(id) on delete cascade,
  envio_gratis_desde numeric,
  monto_minimo       numeric,
  hora_corte         time,
  -- Para estimar el costo del viaje. Sin esto cargado NO se puede calcular
  -- cuánto cuesta una zona, y la pantalla lo dice en vez de mostrar cero.
  costo_por_km       numeric,
  costo_por_hora     numeric,
  actualizado_at     timestamptz not null default now(),
  actualizado_por    uuid
);

comment on table envios_config is
  'Reglas de envío de cada sucursal. Los costos por km y por hora son lo que falta para poder decir si una zona pierde plata.';

alter table envios_config enable row level security;

drop policy if exists envios_config_read on envios_config;
create policy envios_config_read on envios_config for select
  using (public.hub_rol_activo() is not null or public.current_pedidos_role() is not null);

drop policy if exists envios_config_write on envios_config;
create policy envios_config_write on envios_config for all
  using (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal']::admin_role[]))
  with check (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal']::admin_role[]));

-- ── LO QUE SE COBRÓ Y LO QUE COSTÓ DE VERDAD ────────────────────────────────
--
-- `total` ya incluye el envío pero no lo separa: no se podía saber cuánto se
-- cobró por llevarlo. Y D.4: si el transporte pesa el bulto y cobra distinto,
-- hay que poder registrarlo y comparar. Ya pasó.
alter table orders add column if not exists envio_cobrado numeric;
alter table orders add column if not exists envio_costo_real numeric;
alter table orders add column if not exists envio_costo_motivo text;

comment on column orders.envio_cobrado is 'Lo que se le cobró al cliente por el envío.';
comment on column orders.envio_costo_real is
  'Lo que el transporte terminó cobrando. Se carga a mano cuando llega la factura: el peso de los productos es estimado y el bulto real puede pesar otra cosa.';

-- ── LOS VIAJES ──────────────────────────────────────────────────────────────
--
-- Agrupar pedidos de la misma zona, ponerlos en orden y asignarlos. NO hay ruta
-- optimizada ni mapa: eso necesita un molde que no existe, y los repartidores
-- conocen la zona mejor que un algoritmo. Agrupar y ordenar, sí. Calcular el
-- recorrido, no.
do $$ begin
  create type viaje_estado as enum ('armado', 'en_calle', 'cerrado', 'cancelado');
exception when duplicate_object then null; end $$;

create table if not exists viajes_reparto (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references sucursales(id),
  zona_id       uuid references zonas_reparto(id),
  repartidor_id uuid,
  fecha         date not null default current_date,
  estado        viaje_estado not null default 'armado',
  notas         text,
  salida_at     timestamptz,
  cierre_at     timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create table if not exists viaje_pedidos (
  viaje_id uuid not null references viajes_reparto(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  orden    integer not null default 0,
  primary key (viaje_id, order_id)
);

create index if not exists viajes_reparto_fecha_idx on viajes_reparto (fecha desc, sucursal_id);
create unique index if not exists viaje_pedidos_order_uq on viaje_pedidos (order_id);

comment on table viajes_reparto is
  'Una salida de la moto: pedidos de una zona, en orden, con un repartidor. Sin ruta optimizada — eso es de un mapa que no está.';
comment on column viaje_pedidos.orden is
  'El orden en que los pone quien arma el viaje. No lo calcula nadie.';

alter table viajes_reparto enable row level security;
alter table viaje_pedidos  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['viajes_reparto','viaje_pedidos'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format($f$create policy %I on %I for select
      using (public.hub_rol_activo() is not null or public.current_pedidos_role() is not null)$f$, t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format($f$create policy %I on %I for all
      using (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal']::admin_role[]))
      with check (public.hub_rol_activo() = any (array['super_admin','gerente','administrativo','encargado_sucursal','sucursal']::admin_role[]))$f$, t || '_write', t);
  end loop;
end $$;

-- ── CUÁNTO COBRÁS CONTRA CUÁNTO TE CUESTA ───────────────────────────────────
--
-- El dato que hoy no existe. El costo es ESTIMADO —km y minutos declarados por
-- una persona, multiplicados por el costo por km y por hora de la sucursal— y la
-- vista lo devuelve en `null` cuando falta cualquiera de esos, con el motivo.
-- Un cero acá se leería como «no cuesta nada llegar».
create or replace view envios_por_zona as
  select z.id                as zona_id,
         z.nombre            as zona,
         z.sucursal_id,
         s.nombre            as sucursal,
         z.tarifa,
         z.km_estimados,
         z.minutos_estimados,
         c.costo_por_km,
         c.costo_por_hora,
         case
           when z.km_estimados is null or z.minutos_estimados is null then null
           when c.costo_por_km is null or c.costo_por_hora is null then null
           else round(z.km_estimados * c.costo_por_km
                    + (z.minutos_estimados / 60.0) * c.costo_por_hora, 2)
         end                 as costo_estimado,
         case
           when z.sucursal_id is null then 'la zona no tiene sucursal asignada'
           when z.km_estimados is null or z.minutos_estimados is null
             then 'faltan los km y los minutos estimados de la zona'
           when c.costo_por_km is null or c.costo_por_hora is null
             then 'falta el costo de la moto de esta sucursal (por km y por hora)'
           else null
         end                 as por_que_no_se_sabe,
         e.pedidos,
         e.cobrado
    from zonas_reparto z
    left join sucursales    s on s.id = z.sucursal_id
    left join envios_config c on c.sucursal_id = z.sucursal_id
    left join lateral (
      select count(*)::int as pedidos, coalesce(sum(o.envio_cobrado), 0) as cobrado
        from orders o
       where o.zona_id = z.id and o.status = 'entregado'
    ) e on true
   where z.activa;

alter view envios_por_zona set (security_invoker = true);

comment on view envios_por_zona is
  'Lo cobrado contra lo que cuesta llegar. El costo es ESTIMADO y vale null —con el motivo— mientras falte el costo de la moto o los km de la zona.';
