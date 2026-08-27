-- ═══════════════════════════════════════════════════════════════════════════
-- MARCAR LO QUE ES DEMOSTRACIÓN — v0.80
--
-- El relevamiento del 27-ago encontró que los siete volúmenes más grandes del
-- sistema son datos de demostración: 7.620 ventas, 960 fotos de stock, 480
-- stocks, 150 clientes, 108 irregularidades, 48 arqueos, 26 vencimientos.
--
-- Casi todos ya tenían la marca `es_demo`. El que NO la tenía es el más
-- importante de todos: el catálogo. Los 120 productos son inventados (códigos
-- DEMO-0001 a DEMO-0120) y de ahí sale casi todo lo demás — el stock cuelga del
-- producto, las alertas cuelgan del stock, y el panel de inicio cuelga de las
-- alertas.
--
-- Sin la marca no se pueden ni ocultar ni borrar con seguridad, porque no hay
-- forma de distinguirlos de un producto real que alguien cargue mañana.
--
-- NO SE BORRA NADA. Se marca, para poder ocultarlo. Borrar es una decisión del
-- dueño y necesita un respaldo primero.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.productos_catalogo
  add column if not exists es_demo boolean not null default false;

comment on column public.productos_catalogo.es_demo is
  'Producto sembrado para demostración, no del negocio. Se marca por el prefijo '
  'DEMO- del SKU, que es como se sembraron. Un producto real nace en false.';

-- El prefijo es el criterio, y es verificable: los 120 lo tienen.
update public.productos_catalogo set es_demo = true where sku like 'DEMO-%';

create index if not exists productos_catalogo_demo_idx
  on public.productos_catalogo(es_demo) where es_demo;
