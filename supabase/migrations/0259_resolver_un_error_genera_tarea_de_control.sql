-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0259 · B.7 · RESOLVER UN ERROR GENERA TAREA DE CONTROL                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Regla de oro 5: toda tarea completada genera tarea de control.
--
-- Aca el que la genera no es completar una tarea sino resolver un error del
-- catalogo, y el motivo es el mismo: **el que arregla no es el que verifica.**
-- Despublicar un producto con receta se hace en el canal, afuera del sistema;
-- lo unico que NORA puede hacer es pedir que alguien mire que quedo
-- despublicado de verdad.
--
-- ── POR QUE NO SE CIERRA SOLO CUANDO DEJA DE APARECER ───────────────────────
--
-- Porque dejar de aparecer tambien pasa cuando la sincronizacion dejo de
-- correr —y la tienda propia lleva 51 dias sin mover un dato. Un error que se
-- cierra porque el detector dejo de verlo es un error que nadie resolvio.
--
-- La deteccion de la v1.3 ya reabre lo que vuelve (`reaparecio`), asi que un
-- cierre apresurado no se pierde: vuelve con el contador.
--
-- (El cuerpo final de la puerta queda en 0260, que arregla el valor del enum.)

alter table public.anomalias
  add column if not exists que_se_hizo text,
  add column if not exists resuelta_por uuid references auth.users(id) on delete set null,
  add column if not exists resuelta_at timestamptz,
  add column if not exists responsable_user_id uuid references auth.users(id) on delete set null;

comment on column public.anomalias.que_se_hizo is
  'I.5 · Que se hizo para resolverlo, no solo que se resolvio. Es lo unico que '
  'despues permite saber si el problema volvio por lo mismo.';
