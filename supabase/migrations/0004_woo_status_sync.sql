-- =====================================================================
-- Sincronización de estado con WooCommerce (best-effort)
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

alter table public.orders
  add column if not exists woo_last_sync_status text,
  add column if not exists woo_last_sync_at     timestamptz,
  add column if not exists woo_last_sync_error  text;
