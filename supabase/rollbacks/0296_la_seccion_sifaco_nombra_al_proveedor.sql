-- Rollback de 0296. No borra proveedores: sólo la tabla de mapeo.

drop table if exists public.sifaco_seccion_proveedor;
