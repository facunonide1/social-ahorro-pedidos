-- 0175 · v0.92-deuda-cerrada · BLOQUE A
--
-- LO QUE EL MAESTRO TRAÍA Y EL CATÁLOGO NUNCA RECIBIÓ.
--
-- ── CÓMO SE LLEGÓ ACÁ ───────────────────────────────────────────────────────
--
-- En v0.91 aparecieron dos columnas del maestro que estaban en
-- `sifaco_maestro_staging` y nunca se copiaron a `productos_catalogo`: `vl` —la
-- condición de venta, 29.663 productos sin clasificar, 4.631 de ellos con
-- receta— y `publico` —16.022 productos sin precio—.
--
-- Aparecieron porque alguien las buscó. El archivo tiene 68 columnas. Esta
-- migración es el resultado de comparar las 68, una por una.
--
-- ── LO QUE SE ENCONTRÓ ──────────────────────────────────────────────────────
--
-- Las 68 llegaron a staging. Ninguna se perdió leyendo el archivo. El corte está
-- entre staging y el catálogo: `sifaco_aplicar_maestro` copiaba 16 columnas.
--
-- Y hay un tercer agujero, más grande que los dos de v0.91: **las cuatro
-- columnas de fecha están en CERO filas de staging** —`fec_actu`, `ult_vta`,
-- `ult_cpa`, `fec_alta`— cuando el archivo trae 42.837, 14.551, 15.112 y 46.003
-- respectivamente. Es el mismo bug que se comió las fechas de fin de 329
-- ofertas en v0.88: `fechaSifaco` no reconocía el formato ISO. Se arregló para
-- ofertas y el maestro nunca se volvió a importar. Esas cuatro NO se recuperan
-- acá —no están en staging— sino leyendo el archivo de nuevo
-- (scripts/recuperar-fechas-del-maestro.ts).

-- ── LAS COLUMNAS NUEVAS ─────────────────────────────────────────────────────
alter table productos_catalogo add column if not exists registro_sanitario  text;
alter table productos_catalogo add column if not exists clasificacion_abc   text;
alter table productos_catalogo add column if not exists ubicacion           text;
alter table productos_catalogo add column if not exists seccion             text;
alter table productos_catalogo add column if not exists unidades_por_envase numeric;
alter table productos_catalogo add column if not exists tipo_unidad         text;
alter table productos_catalogo add column if not exists nombre_comercial    text;
alter table productos_catalogo add column if not exists nota_sifaco         text;
alter table productos_catalogo add column if not exists ult_venta           date;
alter table productos_catalogo add column if not exists ult_compra          date;
alter table productos_catalogo add column if not exists fecha_alta          date;
alter table productos_catalogo add column if not exists precio_actualizado  date;

comment on column productos_catalogo.registro_sanitario is
  'Nº de registro que declara SIFACO (columna `registro`). 24.448 productos lo tienen; los otros traen 0. Es dato de Compliance.';
comment on column productos_catalogo.clasificacion_abc is
  'La categoría A/B/C de SIFACO (columna `categoria`). Sólo 6.639 productos la tienen: no es que los demás sean C, es que SIFACO no los clasificó.';
comment on column productos_catalogo.nota_sifaco is
  'La columna `varios` del maestro: texto libre del operador. Incluye 82 marcados «BORRAR».';
comment on column productos_catalogo.ult_venta is
  'Última venta según SIFACO. Se perdió en la importación original —fechaSifaco no leía ISO— y se recuperó del archivo.';
comment on column productos_catalogo.nombre_comercial is
  'La columna `prod_nom`: el nombre de la línea comercial (TIO NACHO, DERMAGLOS LINEA SOLAR). Agrupa productos que `nombre` separa.';

-- ── COPIAR LO QUE SÍ ESTÁ EN STAGING ────────────────────────────────────────
--
-- Sólo donde el catálogo tiene null. La regla de v0.91: nunca pisar lo que
-- alguien pudo haber corregido a mano.
update productos_catalogo p
   set registro_sanitario  = coalesce(p.registro_sanitario,  nullif(nullif(trim(s.registro), ''), '0')),
       clasificacion_abc   = coalesce(p.clasificacion_abc,   nullif(trim(s.categoria), '')),
       ubicacion           = coalesce(p.ubicacion,           nullif(trim(s.ubic), '')),
       seccion             = coalesce(p.seccion,             nullif(trim(s.seccion), '')),
       unidades_por_envase = coalesce(p.unidades_por_envase, nullif(s.unidades, 0)),
       tipo_unidad         = coalesce(p.tipo_unidad,         nullif(trim(s.tip_uni), '')),
       nombre_comercial    = coalesce(p.nombre_comercial,    nullif(trim(s.prod_nom), '')),
       nota_sifaco         = coalesce(p.nota_sifaco,         nullif(trim(s.extra->>'varios'), '')),
       updated_at          = now()
  from sifaco_maestro_staging s
 where s.codigo = p.sku and not p.es_demo;

-- ── EL VADEMÉCUM, QUE YA TENÍA DÓNDE IR ─────────────────────────────────────
--
-- `vademecum_data` existía y estaba en `{}` en los 46.009. Familia, forma
-- farmacéutica, potencia y unidad de potencia son exactamente eso; no hacía
-- falta una columna por cada una.
update productos_catalogo p
   set vademecum_data = jsonb_strip_nulls(jsonb_build_object(
         'familia',  nullif(trim(s.familia), ''),
         'forma',    nullif(trim(s.forma), ''),
         'potencia', nullif(trim(s.potencia), ''),
         'uni_pot',  nullif(trim(s.uni_pot), ''),
         'origen',   'sifaco_maestro'
       )),
       updated_at = now()
  from sifaco_maestro_staging s
 where s.codigo = p.sku and not p.es_demo
   and p.vademecum_data = '{}'::jsonb
   and coalesce(nullif(trim(s.familia),''), nullif(trim(s.forma),''),
                nullif(trim(s.potencia),''), nullif(trim(s.uni_pot),'')) is not null;

-- ── LO QUE HAY QUE MIRAR ANTES DE PUBLICAR EN NINGÚN LADO ───────────────────
--
-- Regla 9. Los que NO se pueden ofrecer por un canal abierto y además tienen
-- stock y código de barras — es decir, los que podrían haber entrado en un
-- archivo de alta de un canal. `visible_antes` dice si la regla 9 podía verlos
-- antes de v0.91: los que dicen «no» son los que un archivo viejo pudo haber
-- dejado pasar.
create or replace view no_publicables_para_revisar as
  select p.id as producto_id,
         p.sku,
         p.nombre,
         p.codigo_barras,
         p.laboratorio,
         p.condicion_venta,
         p.lista_controlado,
         s.stock,
         p.precio_sugerido,
         (o.producto_id is not null) as visible_antes_de_v091,
         ce.por_que
    from productos_catalogo p
    join producto_stock_sifaco s on s.producto_id = p.id and s.sucursal_id is null
    join producto_condicion_efectiva ce on ce.producto_id = p.id
    left join (select distinct producto_id from ofertas_sifaco where producto_id is not null) o
           on o.producto_id = p.id
   where not p.es_demo and p.activo and p.es_producto
     and not ce.canal_abierto_efectivo
     and coalesce(s.stock, 0) > 0
     and coalesce(nullif(btrim(p.codigo_barras), ''), '0') <> '0';

alter view no_publicables_para_revisar set (security_invoker = true);

comment on view no_publicables_para_revisar is
  'Regla 9: los que no se ofrecen por canal abierto y podrían haber entrado en un archivo de alta —tienen stock y código de barras—. NORA no despublica nada: lista para que una persona lo cruce contra lo que subió.';
