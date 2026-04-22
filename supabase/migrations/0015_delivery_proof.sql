-- =====================================================================
-- Comprobante de entrega (foto) - columna en orders + bucket de storage
-- =====================================================================

alter table public.orders
  add column if not exists delivery_proof_url text;

-- Bucket público de solo-lectura. Las subidas las hace el endpoint con
-- service role; los operadores sólo ven el link (no modifican el bucket
-- directo desde el cliente).
insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', true)
on conflict (id) do nothing;
