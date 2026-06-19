-- 0046 · Respaldo pre-merge stock/caja (v0.20). Backups planos antes de migrar.
create table if not exists public.backup_stock_items_v20 as select * from public.stock_items;
create table if not exists public.backup_stock_sucursal_v20 as select * from public.stock_sucursal;
create table if not exists public.backup_movimientos_stock_v20 as select * from public.movimientos_stock;
