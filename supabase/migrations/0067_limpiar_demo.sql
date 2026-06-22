-- ============================================================================
-- 0067 · LIMPIAR DEMO — borra SOLO es_demo (y productos DEMO-), nunca lo real
-- ----------------------------------------------------------------------------
-- limpiar_demo(): borra en orden FK-safe (hijos → padres → productos DEMO-).
-- contar_demo(): cuenta cuántos registros demo hay (para la UI de confirmación).
-- Los datos reales (es_demo=false) NUNCA se tocan.
-- ============================================================================

create or replace function public.contar_demo()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'productos', (select count(*) from productos_catalogo where sku like 'DEMO-%'),
    'ventas_diarias', (select count(*) from ventas_diarias where es_demo),
    'clientes', (select count(*) from clientes where es_demo),
    'arqueos', (select count(*) from arqueos_caja where es_demo),
    'ofertas', (select count(*) from ofertas where es_demo),
    'stock_items', (select count(*) from stock_items where es_demo),
    'campanias', (select count(*) from campanias_crm where es_demo),
    'tareas', (select count(*) from tareas where es_demo)
  );
$$;
grant execute on function public.contar_demo() to authenticated;

create or replace function public.limpiar_demo()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t text; total bigint := 0; n bigint;
  -- orden: hijos primero, luego padres
  tablas text[] := array[
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
  -- productos demo (cascada a lo que reste por producto_id)
  delete from public.productos_catalogo where sku like 'DEMO-%';
  get diagnostics n = row_count; total := total + n;
  return jsonb_build_object('borrados', total);
end $$;
grant execute on function public.limpiar_demo() to authenticated;
