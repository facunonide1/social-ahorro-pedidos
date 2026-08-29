-- 0115 · El importador de archivos SIFACO (v0.83)
--
-- ── EL PROBLEMA DE TAMAÑO ──────────────────────────────────────────────────
--
-- pla_3d_24.xls pesa 41 MB: 46.035 filas × 68 columnas. Eso no pasa por una
-- función serverless de Vercel, cuyo límite de cuerpo son ~4,5 MB. Y aunque
-- pasara, parsear un BIFF de 41 MB adentro de una función es pedirle al
-- runtime que aguante el pico de memoria justo cuando no hay forma de verlo.
--
-- El camino es: el navegador sube el original derecho a Storage con una URL
-- firmada, lo parsea ahí mismo, y le manda al servidor lotes chicos de filas ya
-- decodificadas. El servidor nunca ve los 41 MB.
--
-- ── POR QUÉ HAY UNA TABLA DE ESTACIONAMIENTO ───────────────────────────────
--
-- Las filas entran primero a `sifaco_maestro_staging`, crudas y decodificadas,
-- y recién después se aplican al catálogo. Tres motivos:
--
--   1. A.4 pide vista previa: cuántos productos nuevos, cuántos cambian,
--      cuántos desaparecen. Eso se calcula comparando dos tablas, no leyendo un
--      archivo dos veces.
--   2. 46.000 filas no entran en una transacción. Si el aplicado se corta, la
--      pila de origen sigue estando y se retoma; el archivo no se vuelve a
--      subir.
--   3. La imagen de lo que dijo SIFACO ese día queda guardada tal cual, que es
--      lo que pide A.5. El catálogo es una interpretación; esto es la fuente.
--
-- ── REGLA DE ORO 1 ─────────────────────────────────────────────────────────
--
-- Todo esto es de una sola dirección. SIFACO escribe acá; nada de acá vuelve a
-- SIFACO, y ninguna fila de estas tablas toca `stock_items`.

-- ── 1 · El registro de importaciones ───────────────────────────────────────
do $$ begin
  create type public.sifaco_archivo as enum ('maestro', 'compra_venta', 'sucursal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sifaco_import_estado as enum
    ('subiendo', 'subido', 'cargando', 'cargado', 'aplicado', 'error');
exception when duplicate_object then null; end $$;

create table if not exists public.sifaco_importaciones (
  id                uuid primary key default gen_random_uuid(),
  tipo              public.sifaco_archivo not null,
  archivo_nombre    text not null,
  archivo_path      text,
  -- SHA-256 del contenido, calculado en el navegador ANTES de subir. Es lo que
  -- hace que importar dos veces el mismo archivo no duplique nada (A.6), igual
  -- que en el motor de documentos.
  archivo_hash      text not null,
  bytes             bigint,
  estado            public.sifaco_import_estado not null default 'subiendo',
  -- Cuál resultó ser la codificación real del archivo y contra qué se verificó.
  codificacion      text,
  codificacion_prueba jsonb,
  filas_declaradas  integer,
  filas_cargadas    integer not null default 0,
  -- La vista previa: nuevos, cambian, desaparecen, y una muestra.
  previa            jsonb,
  -- Qué pasó al aplicar.
  resultado         jsonb,
  error             text,
  subido_por        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  cargado_at        timestamptz,
  aplicado_at       timestamptz
);

-- Un archivo, una importación. El índice es la garantía de A.6: no depende de
-- que alguien se acuerde de chequear.
create unique index if not exists sifaco_importaciones_hash_key
  on public.sifaco_importaciones(archivo_hash);
create index if not exists sifaco_importaciones_tipo_idx
  on public.sifaco_importaciones(tipo, created_at desc);

-- ── 2 · Los lotes, para poder retomar ──────────────────────────────────────
create table if not exists public.sifaco_import_lotes (
  importacion_id uuid not null references public.sifaco_importaciones(id) on delete cascade,
  lote           integer not null,
  desde_fila     integer not null,
  filas          integer not null,
  procesado_at   timestamptz not null default now(),
  primary key (importacion_id, lote)
);

comment on table public.sifaco_import_lotes is
  'Un renglon por lote confirmado. Si la carga se corta, el navegador pregunta que lotes ya estan y sigue desde ahi en vez de empezar de cero.';

-- ── 3 · La pila de origen del maestro ──────────────────────────────────────
--
-- Las 68 columnas de pla_3d_24, con los nombres que usa SIFACO y los tipos ya
-- convertidos (las fechas vienen como seriales de Excel, «Nunca» viene como
-- `  -   -`, y varios numeros vienen como texto: eso se resuelve al cargar, no
-- despues).
create table if not exists public.sifaco_maestro_staging (
  importacion_id uuid not null references public.sifaco_importaciones(id) on delete cascade,
  fila           integer not null,

  codigo         text not null,
  descrip        text,
  barras         text,
  barras2        text,
  registro       text,

  -- Ventas: 0 = mes en curso ("este"), 1..12 = jul26 hacia atras hasta ago25.
  vta_este       numeric,
  vta_meses      numeric[],

  stock          numeric,
  pun_ped        numeric,
  st_min         numeric,
  prec_vta       numeric,
  costo          numeric,
  margen         numeric,
  iva_prod       numeric,
  utilidad       numeric,
  publico        numeric,
  fec_actu       date,

  categoria      text,
  num_lab        text,
  nom_lab        text,
  num_depto      text,
  nom_depto      text,
  iva_depto      numeric,
  num_grupo      text,
  nom_grupo      text,
  rubro          text,
  ubic           text,
  seccion        text,

  ult_vta        date,
  ult_cpa        date,
  fec_alta       date,

  prod_nom       text,
  prod_pres      text,
  descripx       text,
  droga          text,
  familia        text,
  forma          text,
  potencia       text,
  uni_pot        text,
  unidades       numeric,
  tip_uni        text,

  -- El nivel de control. Texto tal como viene: la traduccion a los cinco
  -- niveles se hace al aplicar, con la tabla de equivalencias, no acá.
  psi            text,

  pami           text,
  pre_pami       numeric,
  ioma           text,
  dmv_30         numeric,
  categ_3        text,
  segme_3        text,
  ssegm_3        text,
  ppedir         numeric,

  -- Lo que no tiene lugar propio, para no perder nada del archivo.
  extra          jsonb,

  primary key (importacion_id, fila)
);

create index if not exists sifaco_maestro_staging_codigo_idx
  on public.sifaco_maestro_staging(importacion_id, codigo);

comment on table public.sifaco_maestro_staging is
  'Lo que dijo SIFACO ese dia, fila por fila, ya decodificado y con los tipos convertidos. El catalogo es una interpretacion de esto; esto es la fuente. No se borra al aplicar.';

-- ── 4 · Las dos traducciones, como dato ────────────────────────────────────
--
-- SIFACO nombra sus departamentos y sus niveles de control a su manera. NORA
-- tiene su enum de categoria y su campo de lista. Traducir eso con un `switch`
-- adentro del importador significa que el dia que SIFACO agregue un
-- departamento hay que abrir una sesion de codigo. Va como dato.
--
-- Lo que NO esta declarado no se adivina: cae en 'otros' y queda contado en el
-- resultado de la importacion, para que se vea.
create table if not exists public.sifaco_depto_categoria (
  nom_depto text primary key,
  categoria public.producto_catalogo_categoria not null,
  nota      text
);

insert into public.sifaco_depto_categoria (nom_depto, categoria, nota) values
  ('Farmacia',          'medicamento', null),
  ('Farmacia Con IVA',  'medicamento', 'mismo territorio, distinta alicuota'),
  ('HOSPITALARIOS',     'medicamento', null),
  ('Perfumeria',        'perfumeria',  null),
  ('Accesorios/Varios', 'otros',       null),
  ('Alimentos',         'otros',       'no hay categoria de alimentos en el enum')
on conflict (nom_depto) do nothing;

-- Los cinco niveles de control de la columna `psi`. El campo del catalogo es
-- texto y no un booleano a proposito: un estupefaciente y una venta vigilada no
-- son la misma cosa y no se controlan igual (regla de oro 9).
--
-- Las claves vienen con la codificacion rota del archivo ('Psicotr¢pico IV').
-- Se declara la forma YA CORREGIDA: el importador arregla la codificacion antes
-- de traducir, asi que lo que llega acá es 'Psicotrópico IV'.
create table if not exists public.sifaco_nivel_control (
  psi_sifaco text primary key,
  nivel      text not null,
  orden      smallint not null,
  nota       text
);

insert into public.sifaco_nivel_control (psi_sifaco, nivel, orden, nota) values
  ('(Estupefaciente I)',  'estupefaciente_i',  1, 'Lista I - el circuito mas estricto'),
  ('(Psicotrópico II)',   'psicotropico_ii',   2, null),
  ('(Psicotrópico III)',  'psicotropico_iii',  3, null),
  ('(Psicotrópico IV)',   'psicotropico_iv',   4, null),
  ('(Venta Vigilada)',    'venta_vigilada',    5, 'no es psicotropico: exige seguimiento, no libro rubricado')
on conflict (psi_sifaco) do nothing;

comment on table public.sifaco_nivel_control is
  'Los cinco niveles de la columna psi de SIFACO. Terreno legal: la marca sirve para CONTROL (saber que producto exige un circuito distinto). NO reemplaza el libro rubricado ni la validacion del farmaceutico, y NO se registra medico, paciente ni receta.';
