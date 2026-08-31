-- 0125 · El motor de anomalías (v0.84)
--
-- Lo que está roto en SIFACO. NORA no lo corrige: lo detecta, lo prioriza por
-- PLATA EN JUEGO —no por cantidad— y hace seguimiento. La corrección se hace en
-- SIFACO, por una persona (regla de oro 1).
--
-- Cada anomalía guarda SU EVIDENCIA: qué regla la detectó, con qué números y de
-- qué importación salió. Sin eso no se puede saber si algo se arregló o si la
-- regla cambió — una anomalía sin evidencia es una afirmación sin respaldo.
--
-- NINGUNA SE BORRA. Las descartadas quedan con su motivo, para que si la misma
-- vuelve a aparecer se vea que ya se había descartado y por qué.

do $$ begin
  create type public.anomalia_tipo as enum (
    'descuento_imposible', 'oferta_bajo_costo', 'precio_lista_bajo_costo',
    'producto_duplicado', 'sin_costo_cargado', 'descuento_sin_vencimiento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.anomalia_estado as enum (
    'abierta', 'en_curso', 'resuelta', 'descartada', 'reaparecio');
exception when duplicate_object then null; end $$;

create table if not exists public.anomalias (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.anomalia_tipo not null,
  clave          text not null,
  producto_id    uuid references public.productos_catalogo(id) on delete cascade,
  estado         public.anomalia_estado not null default 'abierta',
  plata_en_juego numeric not null default 0,
  evidencia      jsonb not null default '{}'::jsonb,
  detectada_en   uuid references public.sifaco_importaciones(id),
  vista_en       uuid references public.sifaco_importaciones(id),
  primera_vez    timestamptz not null default now(),
  ultima_vez     timestamptz not null default now(),
  cerrada_at     timestamptz,
  cerrada_por    uuid references auth.users(id),
  motivo         text,
  veces_reaparecio integer not null default 0,
  tarea_id       uuid
);

create unique index if not exists anomalias_clave_key on public.anomalias(clave);
create index if not exists anomalias_tipo_idx on public.anomalias(tipo, estado, plata_en_juego desc);
create index if not exists anomalias_estado_idx on public.anomalias(estado, plata_en_juego desc);

-- El promedio mensual sobre los meses CERRADOS. Excluye los parciales a
-- propósito: ago-2025 trae 3.509 unidades contra ~28.000 de los demás porque es
-- donde SIFACO cortó la serie, y el mes en curso todavía no terminó.
create or replace view public.producto_venta_mensual_prom
with (security_invoker = true) as
select producto_id, avg(unidades) as prom_mes, sum(unidades) as total, count(*) as meses
from public.producto_ventas_mensuales
where not parcial
group by producto_id;
