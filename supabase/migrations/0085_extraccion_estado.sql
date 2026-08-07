-- ============================================================================
-- 0085 · Estado del ciclo de vida de una extracción (v0.55)
-- ============================================================================
-- doc_extracciones guardaba el resultado pero no en qué punto del proceso está
-- la fila. Hace falta para: mostrar "leyendo…" mientras corre el modelo, no
-- reprocesar lo que ya salió bien, y encontrar las que fallaron.
--
--   pendiente   archivo subido, todavía no se llamó al modelo
--   procesando  el modelo está leyendo (evita doble disparo)
--   ok          leyó y devolvió JSON válido
--   error       falló — el motivo queda en la columna `error`
-- ============================================================================

alter table public.doc_extracciones
  add column if not exists estado text not null default 'pendiente';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'doc_extracciones_estado_check'
  ) then
    alter table public.doc_extracciones
      add constraint doc_extracciones_estado_check
      check (estado in ('pendiente','procesando','ok','error'));
  end if;
end $$;

create index if not exists doc_extracciones_estado_idx
  on public.doc_extracciones(tenant_id, estado);

comment on column public.doc_extracciones.estado is
  'pendiente | procesando | ok | error. procesando evita que dos requests disparen el modelo sobre el mismo archivo.';

-- `respuesta_cruda` era not null, pero la fila se crea al subir el archivo,
-- antes de que exista respuesta. Default '{}' para poder insertar sin modelo.
alter table public.doc_extracciones
  alter column respuesta_cruda set default '{}'::jsonb;
