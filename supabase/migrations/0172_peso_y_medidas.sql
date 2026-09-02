-- 0172 · v0.91-pedidos · BLOQUE D.4
--
-- EL PESO Y LAS MEDIDAS, PARA PODER COTIZAR UN ENVÍO POR CORREO.
--
-- Están cargados en WooCommerce —recién— y no en NORA. Sin ellos no se puede
-- armar el bulto de un pedido, y sin el bulto no hay cotización posible.
--
-- **Los pesos de 7.587 productos son ESTIMADOS.** Por eso hay una bandera: un
-- peso estimado y uno pesado de verdad no valen lo mismo, y cuando el transporte
-- pesa el bulto y cobra distinto hay que poder mirar de cuál se trataba.
alter table productos_catalogo add column if not exists peso_gramos numeric;
alter table productos_catalogo add column if not exists largo_cm numeric;
alter table productos_catalogo add column if not exists ancho_cm numeric;
alter table productos_catalogo add column if not exists alto_cm  numeric;
alter table productos_catalogo add column if not exists peso_estimado boolean;
alter table productos_catalogo add column if not exists medidas_origen text;

comment on column productos_catalogo.peso_gramos is
  'Peso unitario. Viene de WooCommerce. Ver peso_estimado: la mayoría son estimaciones, no pesadas.';
comment on column productos_catalogo.peso_estimado is
  'true = el peso es una estimación cargada a mano, no una pesada. Un envío cotizado con esto puede salir distinto.';
comment on column productos_catalogo.medidas_origen is
  'De dónde salieron el peso y las medidas. Hoy: woo.';
