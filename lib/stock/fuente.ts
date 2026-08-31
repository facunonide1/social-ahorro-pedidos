import { createClient } from '@/lib/supabase/server'
import { sinDemo } from '@/lib/demo/estado'

/**
 * DE DÓNDE SALE EL STOCK, Y QUÉ SE PUEDE AFIRMAR CON ESO.
 *
 * ── EL PROBLEMA QUE VIENE A RESOLVER ────────────────────────────────────────
 *
 * Hay DOS fuentes de stock y no dicen lo mismo:
 *
 *   `stock_items`            480 filas, las 480 de demostración, abiertas por
 *                            sucursal. Es el modelo operativo de NORA.
 *   `producto_stock_sifaco`  46.009 filas reales, TOTALES, sin abrir por
 *                            sucursal. Es lo que declara SIFACO.
 *
 * El panel de Operaciones mezclaba las dos: sacaba el valor de SIFACO —real— y
 * los quiebres de `stock_items` —inventados—. Mostraba «$0 de stock» y «56
 * quiebres» al mismo tiempo, y NORA escribía un párrafo afirmando los 56.
 *
 * Los 56 son reales en el sentido de que existen 56 filas así. Lo que no existe
 * es el hecho: no hay 56 productos en quiebre, hay 56 filas de demostración.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Un panel que no puede distinguir demostración de realidad NO AFIRMA. Dice que
 * no tiene datos reales todavía, y por qué. Un cero honesto vale más que un 56
 * falso, y mucho más que un 56 sin aclaración.
 *
 * Todo lo que muestre stock pasa por acá, para que la respuesta sea la misma en
 * todas las pantallas del sector.
 */

export interface EstadoDelStock {
  /** ¿Hay stock por sucursal cargado de verdad? Hoy: no. */
  hayPorSucursal: boolean
  /** ¿Hay stock total declarado por SIFACO? Hoy: sí. */
  hayTotalSifaco: boolean
  /** Cuántas filas de `stock_items` son de demostración. */
  filasDemo: number
  /** Cuántas son reales. */
  filasReales: number
  /** El total que declara SIFACO, sin abrir por sucursal. */
  sifaco: { productosConStock: number; unidades: number; valorCosto: number }
  /** El interruptor de «ver sin demostración» está puesto. */
  lentePuesto: boolean
  /**
   * Por qué un KPI de stock por sucursal está vacío. `null` cuando sí se puede
   * calcular. Se muestra EN LUGAR del número, no debajo.
   */
  motivoSinDatos: string | null
}

/**
 * El estado del stock, para que ninguna pantalla del sector tenga que
 * adivinarlo por su cuenta.
 *
 * Los conteos van con `count: 'exact', head: true`: se cuentan en la base. Un
 * KPI que dice cuántos hay no puede salir de contar filas traídas a memoria
 * (ver docs/CONSULTAS-QUE-NO-MIENTEN.md).
 */
export async function estadoDelStock(): Promise<EstadoDelStock> {
  const sb = createClient()
  const lentePuesto = sinDemo()

  const [{ count: reales }, { count: demo }, { data: totalSifaco }] = await Promise.all([
    sb.from('stock_items').select('producto_id', { count: 'exact', head: true }).eq('es_demo', false),
    sb.from('stock_items').select('producto_id', { count: 'exact', head: true }).eq('es_demo', true),
    sb.rpc('catalogo_valor_de_stock'),
  ])

  const fila = (totalSifaco as any)?.[0] ?? {}
  const sifaco = {
    productosConStock: Number(fila.productos ?? 0),
    unidades: Number(fila.unidades ?? 0),
    valorCosto: Number(fila.valor_costo ?? 0),
  }

  const filasReales = reales ?? 0
  const filasDemo = demo ?? 0
  const hayPorSucursal = filasReales > 0

  let motivoSinDatos: string | null = null
  if (!hayPorSucursal) {
    motivoSinDatos = filasDemo > 0
      ? `El stock por sucursal todavía no llegó: SIFACO exportó el maestro con el total y la apertura viene en otro archivo. Las ${filasDemo.toLocaleString('es-AR')} filas que hay son de demostración.`
      : 'El stock por sucursal todavía no llegó: SIFACO exportó el maestro con el total y la apertura viene en otro archivo.'
  }

  return { hayPorSucursal, hayTotalSifaco: sifaco.productosConStock > 0, filasDemo, filasReales, sifaco, lentePuesto, motivoSinDatos }
}

/**
 * Los quiebres, contados EN LA BASE y sólo sobre stock real.
 *
 * Devuelve `null` —no cero— cuando no hay stock real por sucursal. La
 * diferencia importa: cero es «lo miré y no hay quiebres», null es «no lo puedo
 * saber». Mostrar cero cuando es null es la misma mentira que mostrar 56.
 */
export async function contarQuiebres(sucursalId: string | null): Promise<number | null> {
  const sb = createClient()

  const { count: reales } = await sb
    .from('stock_items').select('producto_id', { count: 'exact', head: true }).eq('es_demo', false)
  if (!reales) return null

  // PostgREST no compara columna contra columna, así que el filtro va en una
  // función de la base: contar acá trayendo filas seria el error de siempre.
  const { data, error } = await sb.rpc('contar_quiebres_reales', { p_sucursal: sucursalId })
  if (error) return null
  return Number(data ?? 0)
}
