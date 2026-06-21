-- ============================================================================
-- 0058 · CENTRO DE DATOS — perfiles y acciones de sistema (predefinidos)
-- ----------------------------------------------------------------------------
-- Perfiles de mapeo SIFACO siempre presentes (es_sistema=true, NO es_demo).
-- Mapeo según el formato real del export de productos SIFACO (26 columnas).
-- Idempotente: inserta solo si no existe el perfil de sistema con ese nombre.
-- ============================================================================

-- ===== Perfiles de IMPORTACIÓN =====

-- 1) Productos SIFACO (alimenta catálogo + stock + ventas mensuales)
insert into public.perfiles_datos (nombre, descripcion, direccion, tipo, formato, mapeo_columnas, opciones, frecuencia, es_sistema)
select 'Productos SIFACO',
  'Export de productos de SIFACO (26 col): catálogo + stock (góndola) + ventas del mes (MES_ACT + ANT_1..6). Match por CODIGO.',
  'import', 'productos', 'xlsx',
  jsonb_build_object(
    'CODIGO','sku', 'BARRAS','codigo_barras', 'DESCRIP','nombre', 'PRECIO','precio',
    'STOCK','stock', 'RUBRO','rubro', 'NOM_LAB','laboratorio', 'DROGA','droga',
    'ESTADO','estado', 'TIPO','tipo', 'MES_ACT','venta_mes',
    'ANT_1','ant_1', 'ANT_2','ant_2', 'ANT_3','ant_3', 'ANT_4','ant_4', 'ANT_5','ant_5', 'ANT_6','ant_6',
    'NOM_PROMO','nom_promo', 'DEF_PROMO','def_promo', 'DESCU','descuento', 'RECAR','recargo'
  ),
  jsonb_build_object('con_encabezado', true, 'decimales', '.', 'separador', ';'),
  'cada_2hs', true
where not exists (select 1 from public.perfiles_datos where nombre = 'Productos SIFACO' and es_sistema);

-- 2) Ventas diarias por sucursal (fuente fina, por CODIGO)
insert into public.perfiles_datos (nombre, descripcion, direccion, tipo, formato, mapeo_columnas, opciones, frecuencia, es_sistema)
select 'Ventas diarias por sucursal',
  'Archivo de ventas del día por sucursal (formato SIFACO, por CODIGO). Distinto por sucursal. Alimenta análisis de compra y reportes finos.',
  'import', 'ventas', 'csv',
  jsonb_build_object('CODIGO','sku', 'DESCRIP','nombre', 'CANT','cantidad', 'IMPORTE','monto'),
  jsonb_build_object('con_encabezado', true, 'decimales', '.', 'separador', ';'),
  'diaria', true
where not exists (select 1 from public.perfiles_datos where nombre = 'Ventas diarias por sucursal' and es_sistema);

-- 3) Clientes SIFACO
insert into public.perfiles_datos (nombre, descripcion, direccion, tipo, formato, mapeo_columnas, opciones, frecuencia, es_sistema)
select 'Clientes SIFACO',
  'Padrón de clientes exportado de SIFACO.',
  'import', 'clientes', 'csv',
  jsonb_build_object('NOMBRE','cliente_nombre', 'DOC','cliente_doc', 'TEL','cliente_tel', 'EMAIL','cliente_email'),
  jsonb_build_object('con_encabezado', true, 'separador', ';'),
  'semanal', true
where not exists (select 1 from public.perfiles_datos where nombre = 'Clientes SIFACO' and es_sistema);

-- ===== Perfiles de FORMATO de EXPORTACIÓN (lo que SIFACO espera) =====

-- 4) Ofertas → SIFACO (NOM_PROMO / DEF_PROMO)
insert into public.perfiles_datos (nombre, descripcion, direccion, tipo, formato, mapeo_columnas, opciones, frecuencia, es_sistema)
select 'Ofertas → SIFACO',
  'Formato que SIFACO espera para precios de ofertas (CODIGO + PRECIO + NOM_PROMO + DEF_PROMO).',
  'export', 'ofertas', 'csv',
  jsonb_build_object('sku','CODIGO', 'precio','PRECIO', 'nom_promo','NOM_PROMO', 'def_promo','DEF_PROMO'),
  jsonb_build_object('con_encabezado', true, 'decimales', '.', 'separador', ';'),
  'manual', true
where not exists (select 1 from public.perfiles_datos where nombre = 'Ofertas → SIFACO' and es_sistema);

-- 5) Diferencias de stock → SIFACO (CODIGO + STOCK)
insert into public.perfiles_datos (nombre, descripcion, direccion, tipo, formato, mapeo_columnas, opciones, frecuencia, es_sistema)
select 'Diferencias de stock → SIFACO',
  'Formato que SIFACO espera para ajustar stock (CODIGO + STOCK).',
  'export', 'dif_stock', 'csv',
  jsonb_build_object('sku','CODIGO', 'stock','STOCK'),
  jsonb_build_object('con_encabezado', true, 'separador', ';'),
  'manual', true
where not exists (select 1 from public.perfiles_datos where nombre = 'Diferencias de stock → SIFACO' and es_sistema);

-- ===== Acciones de EXPORTACIÓN predefinidas (botones) =====

insert into public.acciones_export (nombre, descripcion, query_definicion, perfil_formato_id, icono, es_sistema)
select 'Precios de ofertas',
  'Exporta las ofertas activas en el formato de promo de SIFACO (NOM_PROMO / DEF_PROMO).',
  jsonb_build_object('entidad','ofertas', 'filtros', jsonb_build_object('solo_activos', true),
    'columnas', jsonb_build_array(
      jsonb_build_object('campo','sku','header','CODIGO','orden',0),
      jsonb_build_object('campo','precio','header','PRECIO','orden',1),
      jsonb_build_object('campo','nom_promo','header','NOM_PROMO','orden',2),
      jsonb_build_object('campo','def_promo','header','DEF_PROMO','orden',3))),
  (select id from public.perfiles_datos where nombre = 'Ofertas → SIFACO' and es_sistema limit 1),
  'Tag', true
where not exists (select 1 from public.acciones_export where nombre = 'Precios de ofertas' and es_sistema);

insert into public.acciones_export (nombre, descripcion, query_definicion, perfil_formato_id, icono, es_sistema)
select 'Diferencias de stock',
  'Exporta el stock actual del sistema por CODIGO para que SIFACO ajuste diferencias.',
  jsonb_build_object('entidad','dif_stock', 'filtros', jsonb_build_object(),
    'columnas', jsonb_build_array(
      jsonb_build_object('campo','sku','header','CODIGO','orden',0),
      jsonb_build_object('campo','stock','header','STOCK','orden',1))),
  (select id from public.perfiles_datos where nombre = 'Diferencias de stock → SIFACO' and es_sistema limit 1),
  'Boxes', true
where not exists (select 1 from public.acciones_export where nombre = 'Diferencias de stock' and es_sistema);

insert into public.acciones_export (nombre, descripcion, query_definicion, perfil_formato_id, icono, es_sistema)
select 'Cambios de precio',
  'Exporta los precios sugeridos del catálogo (CODIGO + PRECIO) para SIFACO.',
  jsonb_build_object('entidad','productos', 'filtros', jsonb_build_object('solo_activos', true),
    'columnas', jsonb_build_array(
      jsonb_build_object('campo','sku','header','CODIGO','orden',0),
      jsonb_build_object('campo','precio','header','PRECIO','orden',1))),
  null, 'CreditCard', true
where not exists (select 1 from public.acciones_export where nombre = 'Cambios de precio' and es_sistema);
