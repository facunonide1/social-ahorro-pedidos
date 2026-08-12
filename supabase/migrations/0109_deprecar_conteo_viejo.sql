-- ============================================================================
-- 0109 · Deprecar el motor de conteo viejo (v0.77)
-- ============================================================================
-- `inventarios_fisicos` + `inventario_items` cubren el mismo territorio que el
-- motor `cnt_*` de v0.76, con dos diferencias que no son de calidad sino de
-- naturaleza:
--
--   1. NO ES CIEGO. La pantalla de conteo mostraba las columnas
--      Producto · Sistema · Contado · Diferencia, con el número del sistema al
--      lado mientras la persona escribía el suyo. Eso no es un conteo: es una
--      confirmación. Si el sistema dice 40, se escribe 40.
--
--   2. AJUSTABA STOCK. `cerrar-inventario` insertaba en `movimientos_stock`
--      con tipo 'conteo', y el trigger actualizaba `stock_items`. Es la regla
--      de oro 1 rota de frente: SIFACO es la autoridad de stock y NORA no
--      ajusta. El motor nuevo genera una TAREA para que una persona lo corrija
--      allá, y no toca una sola fila de stock.
--
-- Estaban prácticamente vacías al deprecarse (1 instancia `en_curso` del
-- 10-jun-2026, 0 items): éste es el único momento en que sacarlas es gratis.
--
-- NO SE HACE DROP. Se renombra a zz_deprecated_*, se revoca el acceso y se deja
-- el DROP escrito y comentado. Mismo procedimiento que 0083, que funcionó: si
-- algo las usaba y no lo detectamos, se rompe de forma visible y se vuelve
-- atrás con un rename. Un DROP no se deshace.
--
-- LA FILA QUE QUEDA NO SE MIGRA. Es un inventario abierto, sin un solo item
-- contado: no hay dato que rescatar, y convertirlo en un conteo del motor nuevo
-- sería inventarle una lista de zona que nunca tuvo.
--
-- PENDIENTE PARA UNA SESIÓN DE FÁBRICA, no para ésta: el manifiesto del pool
-- Stock declara las dos tablas como `propia` (lib/fabrica/manifiestos/stock.ts,
-- líneas 39-40). Desde el rename, el comparador va a marcarlas como declaradas
-- e inexistentes — y está bien que se note. Sacarlas de la declaración implica
-- publicar una versión, o sea escribir en `fab_pool_versiones`, y desde una
-- sesión de HQ la fábrica se lee, no se escribe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · inventario_items → cnt_renglones
-- ----------------------------------------------------------------------------
-- El detalle primero: tiene la FK hacia la cabecera, y renombrar la hija antes
-- que la madre deja el orden de lectura de esta migración igual al de las
-- dependencias.
--
-- Por qué se reemplaza: `stock_sistema` vivía en la fila DESDE EL PRINCIPIO. En
-- `cnt_renglones` la cantidad esperada se escribe al cerrar, y hay un trigger
-- (`cnt_renglones_ciego`) que rechaza escribirla antes. La diferencia entre una
-- convención y una restricción.
alter table if exists public.inventario_items rename to zz_deprecated_inventario_items;

comment on table public.zz_deprecated_inventario_items is
  'DEPRECADA 2026-08-12 (migración 0109). Reemplazada por cnt_renglones. '
  'Aquella guardaba stock_sistema en la fila desde el inicio del conteo, así que '
  'el conteo nunca podía ser ciego; en cnt_renglones la esperada se escribe al '
  'cerrar y un trigger rechaza escribirla antes. Tenía 0 filas al deprecarse. '
  'DROP previsto tras 90 días sin incidentes (2026-11-10).';

revoke all on public.zz_deprecated_inventario_items from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2 · inventarios_fisicos → cnt_conteos
-- ----------------------------------------------------------------------------
alter table if exists public.inventarios_fisicos rename to zz_deprecated_inventarios_fisicos;

comment on table public.zz_deprecated_inventarios_fisicos is
  'DEPRECADA 2026-08-12 (migración 0109). Reemplazada por cnt_conteos. Dos '
  'motivos: su pantalla mostraba el stock del sistema al lado del casillero '
  'donde se escribía lo contado, y su cierre ajustaba stock insertando en '
  'movimientos_stock —lo que rompe la regla de oro 1, porque la autoridad de '
  'stock es SIFACO—. El motor nuevo genera una tarea para que una persona '
  'corrija allá. Tenía 1 fila en curso y 0 items al deprecarse. '
  'DROP previsto tras 90 días sin incidentes (2026-11-10).';

revoke all on public.zz_deprecated_inventarios_fisicos from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3 · El DROP, escrito y SIN EJECUTAR
-- ----------------------------------------------------------------------------
-- Ejecutar después de 90 días sin incidentes, o sea a partir del 2026-11-10, y
-- sólo después de comprobar que ninguna de las dos recibió una consulta en ese
-- período. Va comentado a propósito: escrito para que no haya que redactarlo
-- con apuro el día que toque, y comentado para que no lo corra nadie hoy.
--
-- drop table if exists public.zz_deprecated_inventario_items;
-- drop table if exists public.zz_deprecated_inventarios_fisicos;
