/**
 * TRAER TODAS LAS FILAS, DE VERDAD.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 *
 * PostgREST devuelve como máximo 1000 filas por respuesta. `.limit(5000)` NO
 * cambia eso: devuelve 1000 y **no avisa**. No hay error, no hay warning, no
 * hay nada — la consulta parece haber salido bien y el resultado está cortado.
 *
 * Eso ya mintió cuatro veces en este proyecto:
 *
 *   · v0.83, carga de proveedores: «4.836 productos no cruzan». Era falso, el
 *     catálogo estaba cortado en memoria. Cruzaban 5.108 de 5.111.
 *   · v0.83, pantalla del maestro: iba a decir «2 meses de ventas cargados»
 *     leyendo una tabla de 598.117 filas.
 *   · v0.83, pantalla de controlados: mostraba 1.000 de 3.649 y no lo decía.
 *   · v0.84, pantalla de stock: «1000 de 1000 productos» con 46.009 en la base.
 *
 * Las cuatro se ven igual desde afuera: un número plausible, más chico que el
 * verdadero, sin ninguna señal de que falte algo.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Si una consulta puede devolver más de 1000 filas, o pasa por acá, o cuenta
 * en la base con `count: 'exact', head: true`. Nunca se cuenta trayendo filas
 * a memoria: `datos.length` sobre una consulta sin paginar es una mentira
 * esperando a que la tabla crezca.
 */

const PAGINA = 1000

/** Lo mínimo que necesitamos de un builder de PostgREST, sin atarnos al tipo. */
type Rango<T> = {
  range: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>
}

export interface OpcionesPaginado {
  /**
   * Tope de seguridad. No es el tamaño esperado: es hasta dónde seguimos antes
   * de asumir que algo se fue de control. Si se alcanza, `truncado` viene en
   * `true` y quien llama TIENE que decirlo en pantalla.
   */
  maximo?: number
}

export interface ResultadoPaginado<T> {
  filas: T[]
  /** `true` si se llegó al tope y puede haber más. Nunca ignorar esto. */
  truncado: boolean
}

/**
 * Trae todas las filas de una consulta, de a 1000, hasta que se acaben.
 *
 * La consulta tiene que venir ORDENADA. Sin `order`, PostgREST no garantiza el
 * mismo orden entre páginas y se pueden repetir o perder filas — que es la
 * misma clase de error silencioso que esto viene a arreglar.
 *
 *   const { filas } = await paginar(
 *     sb.from('productos_catalogo').select('id, sku').eq('activo', true).order('sku')
 *   )
 */
export async function paginar<T>(
  consulta: Rango<T>,
  opts: OpcionesPaginado = {},
): Promise<ResultadoPaginado<T>> {
  const maximo = opts.maximo ?? 100_000
  const filas: T[] = []

  for (let desde = 0; desde < maximo; desde += PAGINA) {
    const hasta = Math.min(desde + PAGINA, maximo) - 1
    const { data, error } = await consulta.range(desde, hasta)
    if (error) throw error
    const tanda = data ?? []
    filas.push(...tanda)
    if (tanda.length < hasta - desde + 1) return { filas, truncado: false }
  }

  return { filas, truncado: true }
}

/**
 * Igual que `paginar`, pero devuelve sólo las filas.
 *
 * Usar cuando de verdad no importa el truncado —por ejemplo con un `maximo`
 * muy por encima de lo posible—. Si importa, usar `paginar` y mirar la bandera.
 */
export async function traerTodo<T>(
  consulta: Rango<T>,
  opts: OpcionesPaginado = {},
): Promise<T[]> {
  return (await paginar<T>(consulta, opts)).filas
}
