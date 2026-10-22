-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0243 · EL INFORME SEMANAL ESCRITO                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Un parrafo se lee. Doce graficos no.
--
-- ── POR QUE NO LO ESCRIBE UN MODELO ─────────────────────────────────────────
--
-- Habia un camino mas corto: pasarle los hallazgos a un modelo y pedirle un
-- resumen. Ya existe `/api/cron/reporte-semanal`, que hace exactamente eso
-- para las tareas.
--
-- No se hizo, por tres razones:
--
--   1 · **sin adjetivos** es el requisito, y un modelo escribe «preocupante»,
--       «significativo» y «notable» porque asi se escribe un informe. Y un
--       adjetivo es una opinion: «una caida preocupante» ya dice que hay que
--       hacer algo, y el sistema no sabe eso.
--   2 · los hechos **ya estan escritos**. Los doce detectores los escriben en
--       castellano, con la plata al lado y con lo que no dicen. Pasarlos por
--       un modelo es reescribir lo que ya esta bien escrito, con el riesgo de
--       que cambie un numero.
--   3 · sin modelo, «sin adjetivos» se puede **verificar en una prueba**. Con
--       modelo, no: la salida cambia cada vez.
--
-- Entonces el informe se arma en la base, con los hechos tal como los
-- escribieron los detectores.
--
-- ── «NO ENCUENTRO EL MOTIVO» ────────────────────────────────────────────────
--
-- Es la frase mas importante del informe y va literal. Cuando algo cambio y
-- en los datos no hay nada que lo explique, el informe lo dice asi, en
-- primera persona.
--
-- La alternativa —no mencionarlo— es peor: el cambio igual paso. Y la otra
-- alternativa —inventar una causa plausible— es la que hace que despues nadie
-- crea nada de lo que dice el sistema.
--
-- (El cuerpo final de `informe_semanal` queda en 0246. Aca nacio.)

-- Cada detector declara quien lo tiene que leer. Un cajero no necesita el
-- informe de proveedores y un comprador no necesita el de caja: un informe
-- con secciones que no son de uno se deja de leer entero.
alter table public.detectores
  add column if not exists roles text[];

comment on column public.detectores.roles is
  'Quien lee los hallazgos de este detector en el informe. Null es todos. Un '
  'informe con secciones que no son de uno se deja de leer entero.';

update public.detectores set roles = m.r from (values
  ('stock_no_cuadra',            array['super_admin','gerente','encargado_sucursal','auditor','administrativo']),
  ('caja_diferencias_repetidas', array['super_admin','gerente','tesoreria','auditor','administrativo']),
  ('comprobante_duplicado',      array['super_admin','gerente','tesoreria','comprador','auditor','administrativo']),
  ('monto_fuera_de_lo_habitual', array['super_admin','gerente','tesoreria','comprador','auditor','administrativo']),
  ('faltante_sin_nota_credito',  array['super_admin','gerente','tesoreria','comprador','auditor','administrativo']),
  ('barras_con_dos_precios',     array['super_admin','gerente','comprador','encargado_sucursal','auditor','administrativo']),
  ('dejo_de_venderse',           array['super_admin','gerente','comprador','encargado_sucursal','auditor','administrativo']),
  ('empezo_a_vender_mas',        array['super_admin','gerente','comprador','encargado_sucursal','auditor','administrativo']),
  ('proveedor_cambio',           array['super_admin','gerente','comprador','tesoreria','auditor','administrativo']),
  ('sucursal_bajo',              array['super_admin','gerente','encargado_sucursal','auditor','administrativo']),
  ('canal_cambio',               array['super_admin','gerente','marketing','auditor','administrativo']),
  ('cliente_no_volvio',          array['super_admin','gerente','marketing','auditor','administrativo'])
) as m(c, r) where detectores.clave = m.c;

-- Los de catalogo los lee quien toca el catalogo.
update public.detectores
   set roles = array['super_admin','gerente','comprador','auditor','administrativo']
 where familia = 'catalogo' and roles is null;
