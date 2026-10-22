-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0275 · UN FORMATO SE APRENDE, Y SE NOTA CUANDO CAMBIA                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- «Cada plataforma tiene su formato y todas cambian. Si cada una necesita
-- codigo, el sector se vuelve deuda.»
--
-- ── LO QUE YA EXISTIA, Y ES CASI TODO H.2 ───────────────────────────────────
--
-- El Centro de Datos ya tiene un detector de columnas con sinonimos en
-- castellano, analisis del contenido de una muestra y un grado de confianza
-- (`alta`, `media`, `baja`). Y `perfiles_datos` ya guarda un
-- `mapeo_columnas` jsonb: eso es el formato aprendido.
--
-- Lo que falta son tres cosas, y la segunda es la que hace que esto escale:
--
--   1 · atar el perfil a un CANAL. Hoy es global, y los dos PedidosYa vienen
--       distintos entre si.
--   2 · **notar que el formato cambio.** Un perfil aprendido que se aplica a
--       un archivo distinto no falla: mapea mal y guarda cualquier cosa.
--   3 · los cuatro tipos de archivo de H.4.
--
-- ── LA HUELLA, QUE ES LA IDEA DEL BLOQUE ────────────────────────────────────
--
-- La huella es el conjunto de encabezados, normalizado y ordenado. Si el
-- archivo nuevo tiene la misma huella, el perfil aplica solo. Si no, el
-- sistema **vuelve a preguntar** en vez de aplicar un mapeo que ya no
-- corresponde.
--
-- Se normaliza —minusculas, sin acentos, sin espacios de mas— porque
-- «Codigo», «codigo» y «CÓDIGO » son la misma columna y un cambio de
-- mayusculas no es un cambio de formato. Pero el ORDEN no se ignora: dos
-- archivos con las mismas columnas en distinto orden son formatos distintos.
--
-- ── Y POR QUE NO SE GUARDA EL HASH SOLO ─────────────────────────────────────
--
-- Porque cuando no coincide hay que poder decir QUE cambio: «aparecio
-- `barcode` y desaparecio `ean`» es accionable, «la huella no coincide» no.

alter table public.perfiles_datos
  add column if not exists canal_id text references public.canales_venta(id) on delete cascade,
  add column if not exists encabezados text[],
  add column if not exists huella text,
  add column if not exists veces_usado integer not null default 0,
  add column if not exists ultima_huella_distinta text,
  add column if not exists ultima_huella_distinta_at timestamptz;

comment on column public.perfiles_datos.canal_id is
  'H.3 · El formato aprendido es de un canal. Los dos PedidosYa vienen '
  'distintos entre si: en uno el SKU es el codigo de barras con ceros y en el '
  'otro sin ceros.';
comment on column public.perfiles_datos.huella is
  'H.3 · Los encabezados normalizados y ordenados. Si el archivo nuevo tiene '
  'otra huella, el perfil NO se aplica y se vuelve a preguntar: un mapeo '
  'aprendido aplicado a un archivo distinto no falla, mapea mal.';

create index if not exists perfiles_canal on public.perfiles_datos (canal_id, tipo);

-- ── H.6 · LO QUE NO SE ENTIENDE QUEDA CRUDO ─────────────────────────────────
--
-- Una fila que no se puede interpretar se guarda con el texto original y se
-- marca. No se descarta ni se adivina.
--
-- El motivo no es prolijidad: **la fila que no se entiende suele ser la
-- interesante.** Un producto con un caracter raro en el SKU, una venta con un
-- importe en otro formato, una liquidacion con una linea de ajuste que no
-- tiene columna. Descartarlas deja un archivo que «entro bien» y un numero
-- que no cierra.

create table if not exists public.archivo_importaciones (
  id            uuid primary key default gen_random_uuid(),
  canal_id      text references public.canales_venta(id) on delete set null,
  tipo          text not null check (tipo in ('catalogo', 'ventas', 'liquidacion', 'errores')),
  archivo       text not null,
  perfil_id     uuid references public.perfiles_datos(id) on delete set null,
  entro_solo    boolean not null default false,
  huella        text,
  encabezados   text[],
  mapeo         jsonb,
  filas_totales integer not null default 0,
  filas_leidas  integer not null default 0,
  filas_crudas  integer not null default 0,
  estado        text not null default 'leido'
                check (estado in ('leido', 'confirmado', 'descartado')),
  subido_por    uuid references auth.users(id) on delete set null,
  subido_at     timestamptz not null default now(),
  confirmado_por uuid references auth.users(id) on delete set null,
  confirmado_at timestamptz,
  resumen       jsonb
);

create table if not exists public.archivo_filas (
  id            uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.archivo_importaciones(id) on delete cascade,
  nro_fila      integer not null,
  datos         jsonb,
  crudo         jsonb not null,
  se_entendio   boolean not null default true,
  por_que_no    text
);

create index if not exists archivo_filas_imp on public.archivo_filas (importacion_id, se_entendio);
create index if not exists archivo_imp_canal on public.archivo_importaciones (canal_id, tipo, subido_at desc);

comment on table public.archivo_importaciones is
  'H.9 · El historico: que archivo se subio, cuando, quien, que entro y que '
  'quedo afuera. Y se puede volver a mirar, porque las filas quedan.';
comment on column public.archivo_filas.crudo is
  'H.6 · El texto original, SIEMPRE, tambien cuando se entendio. Si despues '
  'aparece que el mapeo estaba mal, el original sigue estando.';

alter table public.archivo_importaciones enable row level security;
alter table public.archivo_filas enable row level security;
drop policy if exists archivo_imp_ver on public.archivo_importaciones;
drop policy if exists archivo_filas_ver on public.archivo_filas;
create policy archivo_imp_ver on public.archivo_importaciones for select to authenticated using (true);
create policy archivo_filas_ver on public.archivo_filas for select to authenticated using (true);

CREATE OR REPLACE FUNCTION public.archivo_huella(p_encabezados text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Minusculas, sin acentos y sin espacios de mas: «Codigo», «codigo» y
  -- «CÓDIGO » son la misma columna. El orden NO se ignora: las mismas
  -- columnas en distinto orden son otro formato y conviene preguntarlo.
  select md5(array_to_string(array(
    select btrim(regexp_replace(
             lower(translate(x, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')),
             '\s+', ' ', 'g'))
      from unnest(p_encabezados) with ordinality as t(x, i)
     order by i
  ), '|'));
$function$
;

CREATE OR REPLACE FUNCTION public.archivo_perfil_para(p_canal text, p_tipo text, p_encabezados text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with h as (select archivo_huella(p_encabezados) as hu),
  exacto as (
    select p.* from perfiles_datos p, h
     where p.activo and p.canal_id = p_canal and p.tipo::text = p_tipo
       and p.huella = h.hu
     limit 1
  ),
  delmismo as (
    select p.* from perfiles_datos p
     where p.activo and p.canal_id = p_canal and p.tipo::text = p_tipo
     order by p.veces_usado desc, p.updated_at desc nulls last
     limit 1
  )
  select case
    when exists (select 1 from exacto) then
      jsonb_build_object(
        'entra_solo', true,
        'perfil_id', (select id from exacto),
        'perfil', (select nombre from exacto),
        'mapeo', (select mapeo_columnas from exacto),
        'veces_usado', (select veces_usado from exacto),
        'que_pasa', format('Este formato ya se aprendió para este canal (%s veces). Entra solo.',
                           (select veces_usado from exacto)))
    when exists (select 1 from delmismo) then
      jsonb_build_object(
        'entra_solo', false,
        'perfil_id', (select id from delmismo),
        'perfil', (select nombre from delmismo),
        'mapeo_anterior', (select mapeo_columnas from delmismo),
        'aparecieron', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
            select unnest(p_encabezados) except
            select unnest((select encabezados from delmismo))) z(x)),
        'desaparecieron', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
            select unnest((select encabezados from delmismo)) except
            select unnest(p_encabezados)) z(x)),
        'que_pasa',
          'Hay un formato aprendido para este canal pero el archivo no coincide: la plataforma lo cambió. El mapeo anterior NO se aplica — aplicarlo no fallaría, mapearía mal y guardaría cualquier cosa. Hay que confirmar el nuevo.')
    else
      jsonb_build_object(
        'entra_solo', false,
        'perfil_id', null,
        'que_pasa', 'Es la primera vez que entra un archivo de este tipo para este canal. Una persona confirma el mapeo y queda aprendido para la próxima.')
  end;
$function$
;
comment on function public.archivo_huella(text[]) is
  'H.3 · La huella de un formato. Normaliza mayusculas, acentos y espacios '
  '—eso no es un cambio de formato— pero respeta el orden, que si lo es.';
comment on function public.archivo_perfil_para(text, text, text[]) is
  'H.3 · El formato aprendido, si la huella coincide. Y cuando no coincide '
  'dice QUE cambio: «aparecio barcode y desaparecio ean» es accionable, «la '
  'huella no coincide» no.';

revoke all on function public.archivo_huella(text[]) from public, anon;
revoke all on function public.archivo_perfil_para(text, text, text[]) from public, anon, authenticated;
grant execute on function public.archivo_huella(text[]) to authenticated, service_role;
grant execute on function public.archivo_perfil_para(text, text, text[]) to service_role;
