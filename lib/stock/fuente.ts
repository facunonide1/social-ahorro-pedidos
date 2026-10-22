import { createClient } from '@/lib/supabase/server'
import { sinDemo } from '@/lib/demo/estado'

/**
 * DE DÓNDE SALE EL STOCK, Y QUÉ SE PUEDE AFIRMAR CON ESO.
 *
 * ── EL PROBLEMA QUE RESOLVIÓ, Y QUE YA NO ESTÁ ──────────────────────────────
 *
 * Durante siete versiones hubo DOS fuentes de stock que no decían lo mismo:
 *
 *   `stock_items`            480 filas, las 480 de demostración, abiertas por
 *                            sucursal. Era el modelo operativo de NORA.
 *   `producto_stock_sifaco`  46.009 filas reales, el total de las cuatro juntas.
 *
 * El panel de Operaciones mezclaba las dos: el valor de SIFACO —real— y los
 * quiebres de `stock_items` —inventados—. Mostraba «$0 de stock» y «56
 * quiebres» al mismo tiempo. Los 56 eran reales en el sentido de que existían
 * 56 filas así; lo que no existía era el hecho.
 *
 * ── QUÉ CAMBIÓ EN v0.96 ─────────────────────────────────────────────────────
 *
 * Llegó `tabla3e` y las 480 filas de demostración se reemplazaron por 192.464
 * reales. Las dos fuentes pasaron a ser la misma: `stock_items` ahora es la
 * apertura de `producto_stock_sifaco`, sucursal por sucursal, del mismo archivo.
 *
 * Y apareció otra cosa: el total que se leía como «la cadena» era el stock de
 * GUZMÁN. Ver docs/EL-MAESTRO-DE-AGOSTO-ERA-GUZMAN.md.
 *
 * ── LA REGLA, QUE NO CAMBIA ─────────────────────────────────────────────────
 *
 * Un panel que no puede distinguir demostración de realidad NO AFIRMA. Dice que
 * no tiene datos reales todavía, y por qué. Esto sigue acá porque el próximo
 * sector que se cargue va a empezar igual: con datos sembrados.
 *
 * Todo lo que muestre stock pasa por acá, para que la respuesta sea la misma en
 * todas las pantallas del sector.
 */

export interface EstadoDelStock {
  /** ¿Hay stock por sucursal cargado de verdad? Desde v0.96: sí. */
  hayPorSucursal: boolean
  /** ¿Hay stock total declarado por SIFACO? */
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
      ? `El stock por sucursal no está importado. Las ${filasDemo.toLocaleString('es-AR')} filas que hay son de demostración.`
      : 'El stock por sucursal no está importado: hace falta el archivo `tabla3e` de SIFACO, que trae las cuatro columnas de stock.'
  }

  return { hayPorSucursal, hayTotalSifaco: sifaco.productosConStock > 0, filasDemo, filasReales, sifaco, lentePuesto, motivoSinDatos }
}

/**
 * Los quiebres, contados EN LA BASE y sólo sobre stock real.
 *
 * Devuelve `null` —no cero— cuando no se puede saber. La diferencia importa:
 * cero es «lo miré y no hay quiebres», null es «no lo puedo saber».
 *
 * ── POR QUÉ NO SE CUENTAN POR PUNTO DE PEDIDO ───────────────────────────────
 *
 * `contar_quiebres_reales` exige `stock_minimo > 0`, y el archivo por sucursal
 * NO trae punto de pedido por local: las 192.464 filas quedaron con mínimo 0,
 * que acá quiere decir SIN DECLARAR. Contar por mínimo daría CERO en las cuatro
 * sucursales, y ese cero se lee como «no hay quiebres» — exactamente el cero
 * falso que este archivo viene evitando desde v0.81.
 *
 * La definición que sí se sostiene con lo que hay: **vende acá y no tiene acá**.
 * Un producto que se vendió 40 veces en Tesei en tres meses y hoy tiene cero en
 * Tesei está en quiebre, con mínimo declarado o sin él. Es un hecho más duro que
 * el mínimo, no un sustituto peor.
 */
export async function contarQuiebres(sucursalId: string | null): Promise<number | null> {
  const sb = createClient()

  const { count: reales } = await sb
    .from('stock_items').select('producto_id', { count: 'exact', head: true }).eq('es_demo', false)
  if (!reales) return null

  let q = sb.from('quiebres_por_sucursal').select('producto_id', { count: 'exact', head: true })
  if (sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { count, error } = await q
  if (error) return null
  return count ?? 0
}

/**
 * Cuántos de los quiebres tienen el producto parado en OTRA sucursal.
 *
 * Es el número que cambia la decisión: no se compra, se transfiere. Null cuando
 * no hay apertura por sucursal, porque sin eso la pregunta no existe.
 */
export async function quiebresQueSeResuelvenTransfiriendo(): Promise<{
  productos: number; plata: number
} | null> {
  const sb = createClient()
  const { data } = await sb.rpc('compras_transferir_se_puede').maybeSingle<{ se_puede: boolean }>()
  if (!data?.se_puede) return null

  // Se cuenta EN LA BASE. La primera version traia las filas y contaba en
  // memoria: esa vista tiene 2.909 filas y PostgREST devuelve 1.000, asi que
  // daba 635 productos donde hay 1.687 (v0.98).
  const { data: resumen } = await sb.rpc('agentes_resumen', { p_sucursal: null })
  const a = (resumen as any)?.abasto
  if (!a) return null
  return {
    productos: Number(a.productos_a_transferir ?? 0),
    plata: Number(a.plata_a_transferir ?? 0),
  }
}
