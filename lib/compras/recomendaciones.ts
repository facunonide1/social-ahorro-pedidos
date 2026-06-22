/**
 * Motor de recomendaciones de compra (FIX COMPRAS · v0.28).
 *
 * Fuente: `ventas_diarias` (ventas reales por SKU/sucursal del Centro de Datos)
 * + stock actual + catálogo, vía la función SQL `compras_rotacion`. Calcula
 * velocidad de venta, días de cobertura, tendencia (ANT_1..6), cantidad sugerida
 * y dinero dormido. Respeta el selector de sucursal (esTodas = consolidado).
 *
 * Si no hay ventas cargadas, `hayVentas=false` → la UI muestra empty state (no
 * inventa datos).
 */

type Sb = any

export type RotacionRaw = {
  producto_id: string; sku: string; nombre: string; rubro: string | null
  vendido: number; dias_con_venta: number; ultima_venta: string | null
  stock_actual: number; precio_costo: number; precio_venta: number
  ventas_mensuales: Record<string, number> | null
}

export type Clasificacion = 'alta' | 'media' | 'baja' | 'sin_venta'
export type Tendencia = 'subiendo' | 'bajando' | 'estable' | null

export type Recomendacion = {
  producto_id: string; sku: string; nombre: string; rubro: string | null
  velocidad: number          // unidades/día
  vendido: number; stock_actual: number
  cobertura_dias: number | null
  clasificacion: Clasificacion
  tendencia: Tendencia
  sugerido: number           // unidades a comprar para cubrir el objetivo
  urgente: boolean
  costo_sugerido: number
  fecha_quiebre: string | null
}

export type Dormido = {
  producto_id: string; sku: string; nombre: string; rubro: string | null
  stock_actual: number; dias_sin_venta: number | null
  precio_costo: number; plata_inmovilizada: number
}

export type Resumen = {
  hayVentas: boolean
  nRecomendados: number
  nUrgentes: number
  nDormido: number
  plataDormida: number
  unidadesAReponer: number
  costoReposicion: number
}

export type ResultadoRecom = {
  recomendaciones: Recomendacion[]
  quiebres: Recomendacion[]
  dormido: Dormido[]
  resumen: Resumen
}

function clasificar(velocidad: number): Clasificacion {
  if (velocidad <= 0) return 'sin_venta'
  if (velocidad >= 1) return 'alta'
  if (velocidad >= 0.25) return 'media'
  return 'baja'
}

function tendenciaDe(vm: Record<string, number> | null): Tendencia {
  if (!vm) return null
  const act = Number(vm.mes_act ?? 0)
  const ant = Number(vm.ant_1 ?? 0)
  if (!ant) return null
  const r = act / ant
  if (r > 1.15) return 'subiendo'
  if (r < 0.85) return 'bajando'
  return 'estable'
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000)
}

export async function getRecomendaciones(
  sb: Sb,
  opts: { sucursalId: string | null; esTodas: boolean; dias?: number; diasObjetivo?: number },
): Promise<ResultadoRecom> {
  const dias = opts.dias ?? 14
  const objetivo = opts.diasObjetivo ?? 14
  const { data } = await sb.rpc('compras_rotacion', {
    p_sucursal: opts.esTodas ? null : opts.sucursalId,
    p_dias: dias,
  })
  const rows = (data ?? []) as RotacionRaw[]

  const recomendaciones: Recomendacion[] = []
  const dormido: Dormido[] = []
  let plataDormida = 0
  let unidadesAReponer = 0
  let costoReposicion = 0
  let hayVentas = false

  for (const r of rows) {
    const vendido = Number(r.vendido) || 0
    const stock = Number(r.stock_actual) || 0
    const costo = Number(r.precio_costo) || 0
    if (vendido > 0) hayVentas = true

    const velocidad = vendido / dias
    const clasificacion = clasificar(velocidad)

    // dinero dormido: sin venta en la ventana y con stock
    if (vendido === 0 && stock > 0) {
      const plata = stock * costo
      plataDormida += plata
      dormido.push({
        producto_id: r.producto_id, sku: r.sku, nombre: r.nombre, rubro: r.rubro,
        stock_actual: stock, dias_sin_venta: diasDesde(r.ultima_venta),
        precio_costo: costo, plata_inmovilizada: plata,
      })
      continue
    }

    if (velocidad <= 0) continue

    const cobertura = stock / velocidad
    // objetivo: cubrir `objetivo` días de venta
    const target = Math.ceil(velocidad * objetivo)
    const sugerido = Math.max(0, target - Math.floor(stock))
    const urgente = stock <= 0 || cobertura <= 3
    if (sugerido <= 0 && !urgente) continue

    const costoSugerido = sugerido * costo
    unidadesAReponer += sugerido
    costoReposicion += costoSugerido

    recomendaciones.push({
      producto_id: r.producto_id, sku: r.sku, nombre: r.nombre, rubro: r.rubro,
      velocidad: Math.round(velocidad * 100) / 100,
      vendido, stock_actual: stock,
      cobertura_dias: Math.round(cobertura * 10) / 10,
      clasificacion, tendencia: tendenciaDe(r.ventas_mensuales),
      sugerido, urgente, costo_sugerido: costoSugerido,
      fecha_quiebre: Number.isFinite(cobertura) ? new Date(Date.now() + cobertura * 86400000).toISOString().slice(0, 10) : null,
    })
  }

  // ordenar: urgentes primero, luego menor cobertura, luego más velocidad
  recomendaciones.sort((a, b) =>
    Number(b.urgente) - Number(a.urgente) ||
    (a.cobertura_dias ?? 1e9) - (b.cobertura_dias ?? 1e9) ||
    b.velocidad - a.velocidad,
  )
  dormido.sort((a, b) => b.plata_inmovilizada - a.plata_inmovilizada)

  const quiebres = recomendaciones.filter((r) => r.urgente)

  return {
    recomendaciones, quiebres, dormido,
    resumen: {
      hayVentas,
      nRecomendados: recomendaciones.length,
      nUrgentes: quiebres.length,
      nDormido: dormido.length,
      plataDormida,
      unidadesAReponer,
      costoReposicion,
    },
  }
}

export const CLASIF_LABEL: Record<Clasificacion, string> = {
  alta: 'Alta rotación', media: 'Media', baja: 'Baja', sin_venta: 'Sin venta',
}
