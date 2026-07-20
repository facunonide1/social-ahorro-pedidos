-- RADAR · Demanda invisible (v0.50). Captura la venta perdida con un tap:
-- lo que el cliente pide en el mostrador y no hay. Si matchea el catálogo se
-- linkea producto_id (existe pero faltó stock); si no, queda texto libre
-- (no lo trabajamos). Acceso server-side con service_role (RLS sin policy).
create table if not exists public.demanda_invisible (
  id             uuid primary key default gen_random_uuid(),
  texto_pedido   text not null,
  producto_id    uuid references public.productos_catalogo(id) on delete set null,
  sucursal_id    uuid references public.sucursales(id) on delete set null,
  registrado_por uuid references auth.users(id) on delete set null,
  es_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists demanda_invisible_created_idx on public.demanda_invisible(created_at desc);
create index if not exists demanda_invisible_producto_idx on public.demanda_invisible(producto_id);
create index if not exists demanda_invisible_sucursal_idx on public.demanda_invisible(sucursal_id, created_at desc);

alter table public.demanda_invisible enable row level security;
-- Sin policy para authenticated: solo service_role escribe/lee (la app usa
-- createAdminClient). Coherente con el hardening de seguridad de la sesión previa.
