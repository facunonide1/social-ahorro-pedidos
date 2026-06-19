-- 0051 · RLS en tablas de respaldo v0.20 (sin políticas → solo service_role).
alter table public.backup_stock_items_v20 enable row level security;
alter table public.backup_stock_sucursal_v20 enable row level security;
alter table public.backup_movimientos_stock_v20 enable row level security;
