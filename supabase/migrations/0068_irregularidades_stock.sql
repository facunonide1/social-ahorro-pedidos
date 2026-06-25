-- ============================================================================
-- 0068 · CONTROL DE IRREGULARIDADES DE STOCK
-- Cruce diario por sucursal: stock_anterior − ventas = esperado; vs stock_real.
-- Toda diferencia <> 0 se registra (sin umbral). SKU global → ubica la sucursal.
-- ============================================================================
do $$ begin create type irregularidad_tipo as enum ('faltante','sobrante','ok'); exception when duplicate_object then null; end $$;
do $$ begin create type irregularidad_estado as enum ('pendiente','revisada','justificada'); exception when duplicate_object then null; end $$;

-- Foto de stock por fecha/sucursal/SKU (comparar día contra día).
create table if not exists stock_snapshots (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  producto_id uuid references productos_catalogo(id) on delete cascade,
  sku text not null,
  cantidad numeric not null default 0,
  origen_import_job uuid,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (fecha, sucursal_id, sku)
);
create index if not exists idx_stock_snap_suc_fecha on stock_snapshots (sucursal_id, fecha);

create table if not exists irregularidades_stock (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  producto_id uuid references productos_catalogo(id) on delete cascade,
  sku text not null,
  stock_anterior numeric not null,
  ventas_dia numeric not null default 0,
  stock_esperado numeric not null,
  stock_real numeric not null,
  diferencia numeric not null,
  tipo irregularidad_tipo not null,
  valor_diferencia numeric not null default 0,
  estado irregularidad_estado not null default 'pendiente',
  nota text,
  revisada_por uuid,
  revisada_at timestamptz,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (fecha, sucursal_id, sku)
);
create index if not exists idx_irreg_suc_fecha on irregularidades_stock (sucursal_id, fecha);
create index if not exists idx_irreg_estado on irregularidades_stock (estado);
create index if not exists idx_irreg_sku on irregularidades_stock (sku);

-- RLS: dato sensible (pérdidas) → solo roles autorizados leen; escribe service_role.
alter table stock_snapshots enable row level security;
alter table irregularidades_stock enable row level security;
do $$ begin
  create policy snap_sel on stock_snapshots for select to authenticated using (
    exists (select 1 from users_admin u where u.id = auth.uid() and u.activo));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy irreg_sel on irregularidades_stock for select to authenticated using (
    exists (select 1 from users_admin u where u.id = auth.uid() and u.activo
      and u.rol in ('super_admin','gerente','auditor','administrativo','tesoreria')));
exception when duplicate_object then null; end $$;

-- Snapshot del stock actual de una sucursal en una fecha.
create or replace function snapshot_stock_sucursal(p_sucursal uuid, p_fecha date, p_job uuid default null, p_es_demo boolean default false)
returns integer language plpgsql security definer set search_path=public as $$
declare v_n int;
begin
  insert into stock_snapshots (fecha, sucursal_id, producto_id, sku, cantidad, origen_import_job, es_demo)
  select p_fecha, p_sucursal, si.producto_id, pc.sku, coalesce(si.cantidad,0), p_job, p_es_demo
  from stock_items si join productos_catalogo pc on pc.id = si.producto_id
  where si.sucursal_id = p_sucursal and pc.sku is not null
  on conflict (fecha, sucursal_id, sku) do update set cantidad = excluded.cantidad, origen_import_job = excluded.origen_import_job;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Cruce: registra TODA diferencia <> 0 (sin umbral). Recalculo idempotente que
-- NO pisa las irregularidades ya revisadas/justificadas (solo borra pendientes).
create or replace function calcular_irregularidades_stock(p_sucursal uuid, p_fecha date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_prev date; v_n int; v_total numeric;
begin
  if not exists (select 1 from stock_snapshots where sucursal_id=p_sucursal and fecha=p_fecha) then
    return jsonb_build_object('sin_datos', true, 'motivo', 'No hay foto de stock para esa fecha en esa sucursal.');
  end if;
  select max(fecha) into v_prev from stock_snapshots where sucursal_id=p_sucursal and fecha < p_fecha;
  if v_prev is null then
    return jsonb_build_object('sin_datos', true, 'motivo', 'No hay una foto de stock anterior para cruzar (hacen falta al menos dos días).');
  end if;
  delete from irregularidades_stock where sucursal_id=p_sucursal and fecha=p_fecha and estado='pendiente';
  with cur as (select sku, producto_id, cantidad, es_demo from stock_snapshots where sucursal_id=p_sucursal and fecha=p_fecha),
       prv as (select sku, cantidad from stock_snapshots where sucursal_id=p_sucursal and fecha=v_prev),
       ven as (select sku, sum(cantidad) q from ventas_diarias where sucursal_id=p_sucursal and fecha>=v_prev and fecha<p_fecha group by sku)
  insert into irregularidades_stock (fecha, sucursal_id, producto_id, sku, stock_anterior, ventas_dia, stock_esperado, stock_real, diferencia, tipo, valor_diferencia, estado, es_demo)
  select p_fecha, p_sucursal, cur.producto_id, cur.sku,
    prv.cantidad, coalesce(ven.q,0),
    prv.cantidad - coalesce(ven.q,0),
    cur.cantidad,
    cur.cantidad - (prv.cantidad - coalesce(ven.q,0)),
    case when cur.cantidad - (prv.cantidad - coalesce(ven.q,0)) < 0 then 'faltante' else 'sobrante' end::irregularidad_tipo,
    round((cur.cantidad - (prv.cantidad - coalesce(ven.q,0))) * coalesce(pc.precio_sugerido,0), 2),
    'pendiente', cur.es_demo
  from cur join prv using(sku)
    left join ven using(sku)
    left join productos_catalogo pc on pc.id = cur.producto_id
  where cur.cantidad - (prv.cantidad - coalesce(ven.q,0)) <> 0
  on conflict (fecha, sucursal_id, sku) do nothing;
  select count(*), coalesce(sum(abs(valor_diferencia)),0) into v_n, v_total
    from irregularidades_stock where sucursal_id=p_sucursal and fecha=p_fecha;
  return jsonb_build_object('irregularidades', v_n, 'valor_total', round(v_total,2), 'prev_fecha', v_prev, 'fecha', p_fecha);
end $$;

-- Demo: 2 fotos de stock (hoy = real, hace 3 días = real+ventas+ruido) + cruce.
create or replace function seed_irregularidades_demo()
returns jsonb language plpgsql security definer set search_path=public as $$
declare s record; v_hoy date := current_date; v_prev date := current_date - 3; v_total int := 0; r jsonb;
begin
  for s in select id from sucursales where activa order by nombre limit 4 loop
    insert into stock_snapshots (fecha, sucursal_id, producto_id, sku, cantidad, es_demo)
    select v_hoy, s.id, si.producto_id, pc.sku, coalesce(si.cantidad,0), true
    from stock_items si join productos_catalogo pc on pc.id=si.producto_id
    where si.sucursal_id=s.id and pc.sku like 'DEMO-%'
    on conflict (fecha,sucursal_id,sku) do update set cantidad=excluded.cantidad;

    insert into stock_snapshots (fecha, sucursal_id, producto_id, sku, cantidad, es_demo)
    with ven as (select sku, sum(cantidad) q from ventas_diarias where sucursal_id=s.id and fecha>=v_prev and fecha<v_hoy group by sku)
    select v_prev, s.id, si.producto_id, pc.sku,
      coalesce(si.cantidad,0) + coalesce(ven.q,0)
      + case when (abs(hashtext(pc.sku||s.id::text))%100) < 15 then 1 + (abs(hashtext(pc.sku))%8)
             when (abs(hashtext(pc.sku||s.id::text))%100) < 22 then -(1 + (abs(hashtext(pc.sku))%4))
             else 0 end,
      true
    from stock_items si join productos_catalogo pc on pc.id=si.producto_id
      left join ven on ven.sku=pc.sku
    where si.sucursal_id=s.id and pc.sku like 'DEMO-%'
    on conflict (fecha,sucursal_id,sku) do update set cantidad=excluded.cantidad;

    r := calcular_irregularidades_stock(s.id, v_hoy);
    v_total := v_total + coalesce((r->>'irregularidades')::int, 0);
  end loop;
  return jsonb_build_object('irregularidades', v_total);
end $$;

revoke execute on function snapshot_stock_sucursal(uuid,date,uuid,boolean) from public;
revoke execute on function calcular_irregularidades_stock(uuid,date) from public;
revoke execute on function seed_irregularidades_demo() from public;
grant execute on function snapshot_stock_sucursal(uuid,date,uuid,boolean) to service_role;
grant execute on function calcular_irregularidades_stock(uuid,date) to service_role;
grant execute on function seed_irregularidades_demo() to service_role;

-- limpiar_demo: incluir stock_snapshots + irregularidades_stock (al inicio del array).
create or replace function public.limpiar_demo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text; total bigint := 0; n bigint;
  tablas text[] := array[
    'irregularidades_stock','stock_snapshots',
    'campania_envios','ofertas_confirmaciones','ofertas_experimentos','puntos_movimientos',
    'cliente_compras','cliente_fuentes','dedup_pendientes','b2b_pedidos_recurrentes','b2b_cuenta_corriente',
    'listas_precios_items','precios_historico','proveedor_score_eventos','conciliacion_items',
    'gastos_fijos_instancias','recepciones_mercaderia','movimientos_bancarios','caja_general_movimientos',
    'caja_turnos','arqueos_caja','mensajes','canal_miembros','recordatorios_programados','clima_chats',
    'alertas_stock','producto_rotacion','lotes_productos','movimientos_stock','stock_imports','stock_items',
    'ventas_diarias','import_jobs','export_jobs','items_sin_match','empleados_metricas_diarias',
    'sucursales_metricas_diarias','nora_avisos','nora_acciones',
    'campanias_crm','automatizaciones','segmentos','clientes','ofertas','campanias','ordenes_compra',
    'facturas_proveedor','pagos','cheques','impuestos_obligaciones','gastos_fijos','listas_precios',
    'proveedores','caja_general','canales','tareas','tareas_recurrencias','perfiles_datos','acciones_export'
  ];
begin
  foreach t in array tablas loop
    execute format('delete from public.%I where es_demo = true', t);
    get diagnostics n = row_count; total := total + n;
  end loop;
  delete from public.productos_catalogo where sku like 'DEMO-%';
  get diagnostics n = row_count; total := total + n;
  return jsonb_build_object('borrados', total);
end $$;
revoke execute on function public.limpiar_demo() from public;
grant execute on function public.limpiar_demo() to service_role;
