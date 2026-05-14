-- =====================================================================
-- 0028 · Bucket de Storage para fotos de tickets (F4.7 OCR)
--
-- Privado. La route /api/ai/ocr-ticket sube las fotos con service role
-- y las páginas del hub generan signed URLs para mostrarlas.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('tickets-validacion', 'tickets-validacion', false)
on conflict (id) do nothing;
