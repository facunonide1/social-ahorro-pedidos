import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { estadoDelStock } from '@/lib/stock/fuente'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'
import { AccesoCentroDatos } from '@/components/centro-datos/acceso-centro-datos'

import { StockClient, type ProductoRow, type SucursalLite } from './stock-client'

const COLUMNAS_PRODUCTO =
  'id, sku, codigo_barras, nombre, laboratorio, categoria, precio_costo_promedio, precio_sugerido, es_controlado, lista_controlado, bloqueado_recall'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stock' }

export default async function StockPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/stock', 'Stock')

  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  const en30d = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  let stockQ = sb.from('stock_items').select('producto_id, sucursal_id, cantidad, cantidad_gondola, cantidad_deposito, stock_minimo, stock_maximo')
  let rotQ = sb.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante, clasificacion_abc')
  let lotesQ = sb.from('lotes_productos').select('producto_id').gt('cantidad_actual', 0).lte('fecha_vencimiento', en30d)
  if (!esTodas && sucursalId) { stockQ = stockQ.eq('sucursal_id', sucursalId); rotQ = rotQ.eq('sucursal_id', sucursalId); lotesQ = lotesQ.eq('sucursal_id', sucursalId) }

  // El total REAL, contado en la base. Antes la pantalla decia "1000 de 1000
  // productos" con 46.009 cargados: `limit(5000)` no sube el techo de 1000 de
  // PostgREST, devuelve mil y no avisa. Contar `prods.length` era contar lo que
  // habia entrado en memoria, no lo que hay.
  const { count: totalProductos } = await sb
    .from('productos_catalogo').select('id', { count: 'exact', head: true })
    .eq('es_demo', false).eq('activo', true)

  // TOPE: 5.000 y dicho en pantalla. No es el numero esperado, es hasta donde
  // traemos antes de asumir que la pantalla no da para mas. Con 46.009
  // productos, mandarlos todos al navegador no es una tabla: es una descarga.
  const TOPE_PANTALLA = 5000

  const [{ filas: prods, truncado }, { data: stock }, { data: rot }, { data: sucs }, { data: lotesVenc }] =
    await Promise.all([
      paginar<any>(
        sb.from('productos_catalogo')
          .select(COLUMNAS_PRODUCTO)
          .eq('es_demo', false).eq('activo', true).order('nombre'),
        { maximo: TOPE_PANTALLA },
      ),
      stockQ,
      rotQ,
      sb.from('sucursales').select('id, nombre, codigo, usa_deposito').eq('activa', true).order('nombre'),
      lotesQ,
    ])

  const sucursales = ((sucs ?? []) as any[]).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo, usaDeposito: !!s.usa_deposito })) as SucursalLite[]
  const stockItems = (stock ?? []) as any[]
  const rotItems = (rot ?? []) as any[]
  const porVencer = new Set(((lotesVenc ?? []) as any[]).map((l) => l.producto_id))

  const stockByProd = new Map<string, Record<string, { cantidad: number; gondola: number; deposito: number; min: number; max: number | null }>>()
  for (const s of stockItems) {
    const m = stockByProd.get(s.producto_id) ?? {}
    m[s.sucursal_id] = { cantidad: Number(s.cantidad), gondola: Number(s.cantidad_gondola ?? 0), deposito: Number(s.cantidad_deposito ?? 0), min: Number(s.stock_minimo), max: s.stock_maximo == null ? null : Number(s.stock_maximo) }
    stockByProd.set(s.producto_id, m)
  }
  const ventaByProd = new Map<string, number>()
  const abcByProd = new Map<string, string | null>()
  for (const r of rotItems) {
    ventaByProd.set(r.producto_id, (ventaByProd.get(r.producto_id) ?? 0) + Number(r.venta_diaria_prom_30d ?? 0))
    if (r.clasificacion_abc) abcByProd.set(r.producto_id, r.clasificacion_abc)
  }

  const productos: ProductoRow[] = ((prods ?? []) as any[]).map((p) => {
    const porSuc = stockByProd.get(p.id) ?? {}
    const total = Object.values(porSuc).reduce((a, s) => a + s.cantidad, 0)
    const totalGondola = Object.values(porSuc).reduce((a, s) => a + s.gondola, 0)
    const totalDeposito = Object.values(porSuc).reduce((a, s) => a + s.deposito, 0)
    const ventaDia = ventaByProd.get(p.id) ?? 0
    const cobertura = ventaDia > 0 ? Math.round((total / ventaDia) * 10) / 10 : null
    const critico = sucursales.some((s) => { const x = porSuc[s.id]; return x && x.cantidad <= x.min })
    const costo = Number(p.precio_costo_promedio ?? 0)
    return {
      id: p.id, sku: p.sku, ean: p.codigo_barras, nombre: p.nombre, laboratorio: p.laboratorio,
      categoria: p.categoria, costo, total, totalGondola, totalDeposito, ventaDia, cobertura, critico,
      sinRotacion: ventaDia === 0, porVencer: porVencer.has(p.id), abc: abcByProd.get(p.id) ?? null,
      controlado: !!p.es_controlado, listaControlado: p.lista_controlado ?? null, recall: !!p.bloqueado_recall,
      stockPorSuc: porSuc,
    }
  })

  // ── DE DONDE SALE EL STOCK (v0.85) ────────────────────────────────────────
  //
  // `stock_items` tiene 480 filas y las 480 son de demostracion: los 46.009
  // productos reales no tienen ni una. Por eso esta pantalla mostraba $0.
  //
  // El stock real que declara SIFACO esta en `producto_stock_sifaco`, con
  // `sucursal_id` NULO: es un TOTAL, sin apertura por sucursal, porque el
  // archivo tabla3e completo todavia no llego.
  //
  // La decision: el total se muestra SOLO en "todas las sucursales". En una
  // sucursal puntual no se muestra nada, y se dice por que. Repartir el total
  // entre las cuatro seria inventar un dato que despues alguien usa para
  // decidir un pedido.
  const estado = await estadoDelStock()
  // Los laboratorios salen de la base, no de los 5.000 que trae la pantalla:
  // uno que aparezca recien en el producto 5.001 no figuraba en el filtro.
  const { data: labsRows } = await sb
    .from('catalogo_laboratorios').select('laboratorio').order('laboratorio')
  const { data: totalSifaco } = await sb.rpc('catalogo_valor_de_stock')
  const valorSifaco = Number((totalSifaco as any)?.[0]?.valor_costo ?? 0)
  const unidadesSifaco = Number((totalSifaco as any)?.[0]?.unidades ?? 0)

  // ── LO QUE NO SE PUEDE SABER VA EN NULL, NO EN CERO ───────────────────────
  //
  // Cero es «lo mire y no hay». Null es «no lo puedo saber». Mostrar cero
  // cuando es null es la misma mentira que un numero inventado, solo que mas
  // dificil de detectar — nadie sospecha de un cero.
  const hayStockPorSucursal = estado.hayPorSucursal

  // Valor: el total de SIFACO cuando se miran las cuatro. En UNA sucursal no se
  // puede: SIFACO no exporto la apertura. No es cero, es que no se sabe.
  const valorStock = esTodas ? valorSifaco : (hayStockPorSucursal ? productos.reduce((a, p) => a + p.total * p.costo, 0) : null)

  // Criticos: se calculan comparando cantidad contra minimo POR SUCURSAL. Sin
  // apertura no hay con que compararlo, ni siquiera mirando las cuatro juntas.
  const criticos = hayStockPorSucursal ? productos.filter((p) => p.critico).length : null

  // Por vencer: no hay ni un lote cargado. Cero lotes por vencer suena a buena
  // noticia y es que no hay vencimientos cargados.
  const hayLotes = (lotesVenc ?? []).length > 0 || porVencer.size > 0
  const { count: lotesTotales } = await sb
    .from('lotes_productos').select('id', { count: 'exact', head: true })
  const porVencerKpi = (lotesTotales ?? 0) > 0 ? porVencer.size : null

  return (
    <>
      <PageHeader
        title={tituloDeclarado}
        description="Existencias por sucursal con semáforo, rotación y cobertura."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Stock' }]}
        actions={
          <div className="flex gap-2">
            <AccesoCentroDatos accion={{ tipo: 'importar-stock' }} />
            <AccesoCentroDatos accion={{ tipo: 'exportar-dif-stock' }} />
          </div>
        }
      />
      <div className="p-4 md:p-6">
        <StockClient
          productos={productos}
          sucursales={sucursales}
          kpis={{ productos: totalProductos ?? productos.length, valorStock, criticos, porVencer: porVencerKpi }}
          laboratorios={((labsRows ?? []) as any[]).map((l) => l.laboratorio)}
          notas={{
            valorStock: valorStock === null ? 'SIFACO no exportó la apertura por sucursal: el total sólo se puede ver en «todas las sucursales».' : (esTodas ? 'total que declara SIFACO, sin abrir por sucursal' : undefined),
            criticos: criticos === null ? 'Se calcula comparando cantidad contra mínimo por sucursal, y esa apertura todavía no llegó.' : undefined,
            porVencer: porVencerKpi === null ? 'No hay ningún lote con vencimiento cargado: no es que no venza nada, es que no hay con qué mirarlo.' : undefined,
          }}
          mostrados={productos.length}
          truncado={truncado}
          stockSifaco={{ esTotal: esTodas, unidades: estado.sifaco.unidades, productos: estado.sifaco.productosConStock, sinApertura: !estado.hayPorSucursal }}
          rol={profile.rol}
        />
      </div>
    </>
  )
}
