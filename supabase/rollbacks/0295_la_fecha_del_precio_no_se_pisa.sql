-- Rollback de 0295. No borra precios ni listas: solo las columnas nuevas.

drop index if exists public.doc_precios_historial_clave_dedup;

alter table public.doc_precios_historial drop column if exists clave_dedup;
alter table public.listas_precios drop column if exists vigente_desde;
