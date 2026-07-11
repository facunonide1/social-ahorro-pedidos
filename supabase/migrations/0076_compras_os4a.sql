-- 0076 · Compras OS-4a (diferencia→reclamo + cierres de circuito)
--
-- Aditiva. Cierra 3 huecos:
--  A · lotes_productos.proveedor_id (deriva de recepcion→orden) → OS-3 resuelve
--      la ventana de devolución también para lotes reales.
--  B · reclamo cosido a la recepción (bidireccional) + seguimiento hasta la NC.

-- ── enum (standalone; solo ADD VALUE) ──
alter type public.estado_devolucion_proveedor add value if not exists 'descartada';

-- ── A: proveedor en lotes ──
alter table public.lotes_productos
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null;

-- ── B: cosido bidireccional + seguimiento ──
alter table public.recepciones_mercaderia
  add column if not exists reclamo_id uuid references public.devoluciones_proveedor(id) on delete set null;

alter table public.devoluciones_proveedor
  add column if not exists recepcion_id uuid references public.recepciones_mercaderia(id) on delete set null,
  add column if not exists proximo_recordatorio_at timestamptz,
  add column if not exists descartado_por uuid references auth.users(id) on delete set null,
  add column if not exists descartado_motivo text;

create index if not exists devoluciones_prov_recordatorio_idx
  on public.devoluciones_proveedor(proximo_recordatorio_at) where estado = 'enviada';
create index if not exists devoluciones_prov_estado_idx on public.devoluciones_proveedor(estado);

-- ── Backfill: derivar proveedor de los lotes existentes vía recepción → orden ──
update public.lotes_productos lp
set proveedor_id = oc.proveedor_id
from public.recepciones_mercaderia rm
join public.ordenes_compra oc on oc.id = rm.orden_compra_id
where lp.recepcion_id = rm.id
  and lp.proveedor_id is null
  and oc.proveedor_id is not null;
