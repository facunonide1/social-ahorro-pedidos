-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0227 · EL COSTO NO VIVE EN EL ÍNDICE DEL MOSTRADOR                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── LO QUE ENCONTRÓ LA PRUEBA ───────────────────────────────────────────────
--
-- F.7 dice: «Quien atiende no ve costos ni márgenes: ve el orden, no el porqué
-- en plata.»
--
-- La ruta del mostrador cumplía: decide con el rol y manda «deja más» en vez
-- de «deja 52%», y el número no viaja. Pero `mostrador_indice` tenía las
-- columnas `costo` y `margen_pct`, y su RLS era de lectura abierta —es
-- catálogo, pensé— así que un cajero podía pedirlas directo:
--
--   MAL  un cajero puede leer `mostrador_indice.costo` directo desde su sesión
--
-- La ruta era la única puerta y había una ventana al lado. Lo encontró
-- `scripts/prueba-mostrador.ts` probando con la sesión de un cajero de verdad,
-- no leyendo el código de la ruta.
--
-- ── POR QUÉ NO SE ARREGLA CON RLS ───────────────────────────────────────────
--
-- La RLS de Postgres filtra FILAS, no columnas. Y los permisos por columna son
-- por rol de Postgres: `authenticated` es uno solo para los trece roles de la
-- aplicación, así que revocar `select (costo)` se lo saca a todos, incluido el
-- dueño.
--
-- La forma que queda es la correcta igual: **el costo se muda a su propia
-- tabla**, con su propia RLS. Quien no puede ver plata no la ve, y no por una
-- regla en una ruta sino porque la base no se la da.

create table if not exists public.mostrador_indice_costos (
  producto_id uuid primary key references public.productos_catalogo(id) on delete cascade,
  costo       numeric,
  -- Null cuando no hay costo. NO cero.
  margen_pct  numeric
);

comment on table public.mostrador_indice_costos is
  'El costo y el margen del indice del mostrador, aparte. Estaban en mostrador_indice, cuya RLS es de lectura abierta porque es catalogo, y un cajero podia pedirlos directo. La RLS filtra filas y no columnas: la unica forma de que no los vea es que no esten en la misma tabla.';

alter table public.mostrador_indice_costos enable row level security;

-- Sólo quien ya puede ver plata en el resto del sistema. Mismo criterio que
-- usa la ruta para decidir si manda el margen.
drop policy if exists mostrador_costos_ver on public.mostrador_indice_costos;
create policy mostrador_costos_ver on public.mostrador_indice_costos
  for select to authenticated
  using ((select hub_puede_ver('compras')) or (select hub_puede_ver('finanzas')));

-- Nadie lo escribe a mano: lo escribe el refresco del índice, que es
-- security definer.

insert into public.mostrador_indice_costos (producto_id, costo, margen_pct)
select producto_id, costo, margen_pct from public.mostrador_indice
on conflict (producto_id) do update
  set costo = excluded.costo, margen_pct = excluded.margen_pct;

alter table public.mostrador_indice drop column if exists costo;
alter table public.mostrador_indice drop column if exists margen_pct;

-- El refresco (que ahora llena las dos) y `mostrador_buscar` (que las junta
-- por ser SECURITY DEFINER) quedaron reescritas con `create or replace`:
-- ver el cuerpo final en la base. Lo único que cambió de la búsqueda es de
-- dónde sale `margen_pct`; el orden de A.2 no se tocó.
--
-- Lo que decide si el margen VIAJA sigue siendo la ruta, con el rol. Lo que
-- cambió es que ahora no hay otra puerta.
