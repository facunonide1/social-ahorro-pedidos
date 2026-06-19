-- 0045 · es_demo en proveedores (para limpieza de datos demo de finanzas)
alter table public.proveedores add column if not exists es_demo boolean not null default false;
