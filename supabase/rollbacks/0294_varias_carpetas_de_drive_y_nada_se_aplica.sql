-- Rollback de 0294. No toca listas que ya se hayan aplicado: si hace falta
-- deshacer una lista, el botón Revertir de la pantalla la borra y devuelve
-- la vigente anterior. Esto solo saca el esquema nuevo.

alter table public.listas_precios_items drop column if exists match_via;
alter table public.listas_precios_items drop column if exists match_score;

drop table if exists public.compras_lineas;
drop table if exists public.drive_mapeo_productos;
drop table if exists public.drive_archivos_ingestados;
drop table if exists public.integraciones_google_drive_carpetas;
drop table if exists public.integraciones_google_drive;
