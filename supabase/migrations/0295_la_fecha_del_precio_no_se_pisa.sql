-- 0295 · La fecha del precio, y el historial que no se pisa.
--
-- 0294 ya crea la ingesta. Esto no la toca y no borra nada.
--
-- `listas_precios.vigente_desde` es el día de la lista o del archivo, no el
-- día en que se cargó (`fecha_carga` sigue siendo ese otro momento).
--
-- `doc_precios_historial.clave_dedup` deja insertar el mismo precio dos veces
-- sin duplicarlo. Las filas viejas quedan con null y no chocan: en Postgres
-- los null no se pisan entre sí. El origen `factura` y `lista_precios` ya
-- existían; no se agregan valores al check.
--
-- No hay tabla nueva. Las columnas heredan la RLS de su tabla. No se revoca
-- nada de lo que ya leían las pantallas.

alter table public.listas_precios
  add column if not exists vigente_desde date;

comment on column public.listas_precios.vigente_desde is
  'Día de la lista o del archivo de Drive. No es fecha_carga. Si llega una lista con un día anterior a la vigente, se guarda y no la reemplaza.';

alter table public.doc_precios_historial
  add column if not exists clave_dedup text;

create unique index if not exists doc_precios_historial_clave_dedup
  on public.doc_precios_historial (clave_dedup);

comment on column public.doc_precios_historial.clave_dedup is
  'Evita duplicar el mismo evento (producto, droguería, origen, fecha, precio) cuando la ingesta corre de nuevo. No se actualiza el precio anterior: se inserta uno nuevo o no se inserta nada.';
