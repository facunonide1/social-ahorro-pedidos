-- ============================================================================
-- 0083 · Deprecar tablas que se solapan con el motor de documentos (v0.54)
-- ============================================================================
-- Las tres tablas de abajo cubrían territorio del motor (0082) con estructuras
-- más pobres. Estaban VACÍAS (0 filas al 2026-08-07): éste es el único momento
-- en que sacarlas es gratis.
--
-- NO se hace DROP. Se renombra a zz_deprecated_*, se revoca el acceso y se deja
-- el DROP escrito y comentado. Racional: si algo las usaba y no lo detectamos,
-- se rompe de forma visible y se vuelve atrás con un rename. Un DROP no se deshace.
--
-- NO SE TOCA facturas_proveedor / factura_items:
--   facturas_proveedor tiene 35+ referencias VIVAS (Finanzas, BI, NORA, crons,
--   proveedores, pagos) y una FK entrante desde pago_facturas. Es el registro de
--   cuentas por pagar, no la captura por foto: son cosas distintas y conviven.
--   factura_items sí se depreca (0 filas, 0 referencias en código).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · precios_historico → doc_precios_historial
-- ----------------------------------------------------------------------------
-- Por qué: no distingue precio neto de precio con IVA y no registra de qué
-- documento salió. Sin eso la serie no sirve para comparar proveedores, que es
-- todo el punto del histórico.
-- Código reapuntado en este mismo commit:
--   app/api/compras/listas-precios/route.ts   (insert  → doc_precios_historial)
--   app/(admin)/admin/compras/comparador/page.tsx (select → doc_precios_historial)
alter table if exists public.precios_historico rename to zz_deprecated_precios_historico;

comment on table public.zz_deprecated_precios_historico is
  'DEPRECADA 2026-08-07 (migración 0083). Reemplazada por doc_precios_historial: '
  'aquella distingue precio neto de con IVA y registra el documento de origen. '
  'Estaba vacía al deprecarse. DROP previsto tras 90 días sin incidentes (2026-11-05).';

revoke all on public.zz_deprecated_precios_historico from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2 · matcheos_aprendidos_compras → doc_items_alias
-- ----------------------------------------------------------------------------
-- Por qué: mapeaba texto_origen → producto_id SIN guardar el tercero. Cada
-- droguería escribe el mismo producto distinto, así que un alias sin proveedor
-- aprende mal y contamina el match de los demás. No es una versión más pobre:
-- está mal planteada. doc_items_alias sí lleva tercero_id.
-- Código reapuntado: app/api/compras/listas-precios/route.ts (buildMatcher).
alter table if exists public.matcheos_aprendidos_compras rename to zz_deprecated_matcheos_aprendidos_compras;

comment on table public.zz_deprecated_matcheos_aprendidos_compras is
  'DEPRECADA 2026-08-07 (migración 0083). Reemplazada por doc_items_alias, que '
  'guarda tercero_id: un alias sin proveedor aprende mal porque cada droguería '
  'escribe el mismo producto distinto. Estaba vacía. DROP previsto tras 90 días (2026-11-05).';

revoke all on public.zz_deprecated_matcheos_aprendidos_compras from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3 · factura_items → doc_lineas
-- ----------------------------------------------------------------------------
-- 0 filas y CERO referencias en el código: la sub-app Finanzas usa
-- facturas_proveedor como cabecera pero nunca llegó a cargar renglones.
-- Se depreca sólo el detalle; la cabecera (facturas_proveedor) queda intacta.
alter table if exists public.factura_items rename to zz_deprecated_factura_items;

comment on table public.zz_deprecated_factura_items is
  'DEPRECADA 2026-08-07 (migración 0083). Reemplazada por doc_lineas. Tenía 0 filas '
  'y ninguna referencia en el código. facturas_proveedor (la cabecera) NO se depreca: '
  'sigue viva en Finanzas. DROP previsto tras 90 días sin incidentes (2026-11-05).';

revoke all on public.zz_deprecated_factura_items from anon, authenticated;

-- ============================================================================
-- DROP DIFERIDO — NO EJECUTAR ANTES DEL 2026-11-05
-- ============================================================================
-- Ejecutar sólo tras 90 días sin incidentes. Verificar primero que las tres
-- siguen en 0 filas y que nada nuevo las referencia.
--
--   drop table if exists public.zz_deprecated_factura_items;
--   drop table if exists public.zz_deprecated_matcheos_aprendidos_compras;
--   drop table if exists public.zz_deprecated_precios_historico;
--
-- Nota: factura_items tenía FK hacia facturas_proveedor. El rename la conserva,
-- así que el drop debe ir antes de cualquier cambio sobre facturas_proveedor.
-- ============================================================================
