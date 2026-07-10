-- M3 · Zonas físicas + control semanal de stock por zona.
create table if not exists zonas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'gondola',          -- gondola | deposito | otro
  responsable_id uuid,
  dia_control int,                                -- 1=lun .. 7=dom ; null = sin auto
  activa boolean not null default true,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_zonas_suc on zonas (sucursal_id);

create table if not exists controles_zona (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references zonas(id) on delete cascade,
  sucursal_id uuid not null references sucursales(id) on delete cascade,
  fecha date not null default current_date,
  estado text not null default 'pendiente',       -- pendiente | en_curso | cerrado
  responsable_id uuid,
  tarea_id uuid,
  n_productos int not null default 0,
  n_diferencias int not null default 0,
  valor_diferencia numeric not null default 0,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  cerrado_at timestamptz
);
create index if not exists idx_ctrlzona_suc on controles_zona (sucursal_id, fecha);
create index if not exists idx_ctrlzona_estado on controles_zona (estado);

create table if not exists control_zona_items (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references controles_zona(id) on delete cascade,
  producto_id uuid, sku text,
  stock_sistema numeric not null default 0,
  stock_contado numeric not null default 0,
  diferencia numeric not null default 0,
  valor_diferencia numeric not null default 0
);
create index if not exists idx_ctrlzitem on control_zona_items (control_id);

alter table zonas enable row level security;
alter table controles_zona enable row level security;
alter table control_zona_items enable row level security;
do $$ begin create policy zonas_sel on zonas for select to authenticated using (exists (select 1 from users_admin u where u.id=auth.uid() and u.activo)); exception when duplicate_object then null; end $$;
do $$ begin create policy ctrlz_sel on controles_zona for select to authenticated using (exists (select 1 from users_admin u where u.id=auth.uid() and u.activo)); exception when duplicate_object then null; end $$;
do $$ begin create policy ctrlzi_sel on control_zona_items for select to authenticated using (exists (select 1 from users_admin u where u.id=auth.uid() and u.activo)); exception when duplicate_object then null; end $$;

-- Genera un control 'pendiente' + tarea por zona cuyo dia_control coincide con el
-- día pedido (o todas si p_dia null). Idempotente por (zona, semana).
create or replace function generar_controles_zona(p_dia int default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare z record; v_ctrl uuid; v_tarea uuid; v_n int := 0;
begin
  for z in select * from zonas where activa and (p_dia is null or dia_control = p_dia) loop
    if exists (select 1 from controles_zona c where c.zona_id=z.id and c.fecha >= date_trunc('week', current_date)) then continue; end if;
    insert into tareas (titulo, descripcion, tipo_origen, prioridad, estado, responsable_id, sucursal_id, entidad_relacionada, fecha_asignacion, es_demo)
      values ('Controlar stock: '||z.nombre, 'Control semanal de stock de la zona.', 'auto_sistema', 'media',
        (case when z.responsable_id is not null then 'asignada' else 'pendiente' end)::tarea_estado, z.responsable_id, z.sucursal_id, 'control_zona',
        case when z.responsable_id is not null then now() else null end, z.es_demo)
      returning id into v_tarea;
    insert into controles_zona (zona_id, sucursal_id, responsable_id, tarea_id, es_demo)
      values (z.id, z.sucursal_id, z.responsable_id, v_tarea, z.es_demo) returning id into v_ctrl;
    update tareas set entidad_id = v_ctrl, entidad_url = '/admin/operaciones/control-zonas/'||v_ctrl where id = v_tarea;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('generados', v_n);
end $$;
revoke execute on function generar_controles_zona(int) from public;
grant execute on function generar_controles_zona(int) to service_role;

-- limpiar_demo: incluir zonas/controles al inicio del array (ver 0068/0070).
create or replace function public.limpiar_demo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text; total bigint := 0; n bigint;
  tablas text[] := array[
    'control_zona_items','controles_zona','zonas',
    'irregularidades_stock','stock_snapshots','vencimientos',
    'campania_envios','ofertas_confirmaciones','ofertas_experimentos','puntos_movimientos',
    'cliente_compras','cliente_fuentes','dedup_pendientes','b2b_pedidos_recurrentes','b2b_cuenta_corriente',
    'listas_precios_items','precios_historico','proveedor_score_eventos','conciliacion_items',
    'gastos_fijos_instancias','recepciones_mercaderia','movimientos_bancarios','caja_general_movimientos',
    'caja_turnos','arqueos_caja','mensajes','canal_miembros','recordatorios_programados','clima_chats',
    'alertas_stock','producto_rotacion','lotes_productos','movimientos_stock','stock_imports','stock_items',
    'transferencia_items','transferencias_sucursal',
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
