-- =====================================================================
-- 0018 · Bucket de Storage para documentos de proveedor
--
-- El bucket se crea como PRIVADO (public = false). Los archivos se
-- acceden sólo generando una signed URL desde el server con service
-- role — las API de este repo (app/api/hub/proveedores/[id]/
-- documentos/*) son las que firman las URLs.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('proveedor-documentos', 'proveedor-documentos', false)
on conflict (id) do nothing;
