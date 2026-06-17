-- 0040 · Marca es_demo para datos de demostración (F6-T · T14)
-- Permite cargar/borrar datos demo sin tocar datos reales.

alter table public.tareas                       add column if not exists es_demo boolean not null default false;
alter table public.tareas_recurrencias          add column if not exists es_demo boolean not null default false;
alter table public.sucursales_metricas_diarias  add column if not exists es_demo boolean not null default false;
alter table public.empleados_metricas_diarias   add column if not exists es_demo boolean not null default false;

create index if not exists tareas_demo_idx on public.tareas(es_demo) where es_demo;
