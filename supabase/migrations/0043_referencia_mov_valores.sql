-- 0043 · Valores de referencia_movimiento_stock para los flujos WMS (OPS · T12)
-- Los usan import-stock (stock_import), ajuste manual (ajuste_manual) y baja de
-- lote por vencimiento (lote). transferencia/inventario ya existían.

alter type public.referencia_movimiento_stock add value if not exists 'stock_import';
alter type public.referencia_movimiento_stock add value if not exists 'ajuste_manual';
alter type public.referencia_movimiento_stock add value if not exists 'lote';
