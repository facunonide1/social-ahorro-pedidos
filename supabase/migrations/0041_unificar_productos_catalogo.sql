-- 0041 · Unificar productos → productos_catalogo (OPS · T1)
--
-- `productos_catalogo` (0036) pasa a ser la fuente única de verdad del catálogo
-- (sku, codigo_barras=EAN, vademécum, costo, mínimos). `productos` (0024) queda
-- en desuso. Como las tablas de stock están vacías, reapuntamos todas las FKs
-- `producto_id` desde `productos` hacia `productos_catalogo`.
--
-- Si `productos` tuviera datos, primero habría que migrarlos por
-- codigo_interno→sku / codigo_barras; hoy está vacía (0 filas), así que solo
-- reapuntamos las constraints.

do $$
declare r record;
begin
  for r in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = 'public'
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name in (
        'stock_sucursal','lotes_productos','movimientos_stock',
        'transferencia_items','inventario_items','devolucion_items'
      )
      and kcu.column_name = 'producto_id'
  loop
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (producto_id) references public.productos_catalogo(id) on delete cascade',
      r.table_name, r.constraint_name
    );
  end loop;
end $$;
