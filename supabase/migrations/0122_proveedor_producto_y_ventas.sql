-- 0122 · Proveedores, la matriz y la serie de ventas (v0.83)
--
-- Hasta hoy NORA tenía CERO proveedores, y eso mantenía Compras entero
-- inutilizable. compra_venta es el único de los tres archivos que dice a quién
-- se le compra cada cosa.
--
-- ── LA MATRIZ SE CONSULTA EN LOS DOS SENTIDOS ──────────────────────────────
--
-- «Qué le compro a esta droguería» y «a quién le compro este producto» son la
-- misma tabla leída al revés, y las dos hacen falta: la primera para armar un
-- pedido, la segunda para comparar precios. Por eso hay dos índices y no uno.
--
-- ── LOS PROMEDIOS DE SIFACO VAN APARTE ─────────────────────────────────────
--
-- PROM_3, PROM_6 y PROM_12 son cuentas de SIFACO. Entran como dato de SIFACO y
-- no como cálculo de NORA, en su propia tabla, para poder comparar el día que
-- NORA calcule el suyo sobre la serie mensual. Mezclarlos sería perder la única
-- forma de saber si el cálculo propio está bien.
--
-- ── ago-2025 ES PARCIAL, Y ESO NO SE PUEDE PERDER ──────────────────────────
--
-- 3.509 unidades contra ~28.000 de los demás meses. No es un mes flojo: es
-- donde SIFACO cortó la serie. Si entra como mes normal, cualquier promedio de
-- doce meses queda mal y nadie lo nota. El mes en curso también va marcado
-- parcial, por el mismo motivo y sin misterio.

create table if not exists public.proveedor_producto (
  producto_id  uuid not null references public.productos_catalogo(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  unidades     numeric not null default 0,
  origen       text not null default 'sifaco_compra_venta',
  leido_at     timestamptz not null default now(),
  primary key (producto_id, proveedor_id)
);

create index if not exists proveedor_producto_prov_idx
  on public.proveedor_producto(proveedor_id, unidades desc);
create index if not exists proveedor_producto_prod_idx
  on public.proveedor_producto(producto_id, unidades desc);

create table if not exists public.producto_promedios_sifaco (
  producto_id uuid primary key references public.productos_catalogo(id) on delete cascade,
  prom_3      numeric,
  prom_6      numeric,
  prom_12     numeric,
  can_vta     numeric,
  can_cpa     numeric,
  leido_at    timestamptz not null default now()
);

create table if not exists public.producto_ventas_mensuales (
  producto_id uuid not null references public.productos_catalogo(id) on delete cascade,
  periodo     text not null,
  unidades    numeric not null default 0,
  parcial     boolean not null default false,
  origen      text not null default 'sifaco_maestro',
  leido_at    timestamptz not null default now(),
  primary key (producto_id, periodo)
);

create index if not exists producto_ventas_mensuales_periodo_idx
  on public.producto_ventas_mensuales(periodo);
