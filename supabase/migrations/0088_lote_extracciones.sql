-- ============================================================================
-- 0088 · Lotes de carga de documentos (v0.56)
-- ============================================================================
-- Para que el histórico de costos tenga serie hay que cargar las facturas
-- viejas, y de a una es inviable. El lote agrupa una tanda de archivos subidos
-- juntos para poder mostrar su cola, saber cuántas quedan y encadenar la
-- revisión de una a la siguiente sin volver al listado.
--
-- El id lo genera el cliente al arrancar la tanda: no hace falta una tabla de
-- lotes, alcanza con que las extracciones compartan la marca.
-- ============================================================================

alter table public.doc_extracciones
  add column if not exists lote_id uuid,
  add column if not exists archivo_nombre text;

comment on column public.doc_extracciones.lote_id is
  'Agrupa una tanda subida junta. Null = subida individual.';
comment on column public.doc_extracciones.archivo_nombre is
  'Nombre original del archivo. Es lo que la persona reconoce en la cola.';

create index if not exists doc_extracciones_lote_idx
  on public.doc_extracciones(lote_id, created_at) where lote_id is not null;
