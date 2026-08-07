import type { Manifiesto } from '../tipos'
import { MANIFIESTO_OFERTAS, PREFIJOS_OFERTAS } from './ofertas'
import { MANIFIESTO_TAREAS, PREFIJOS_TAREAS } from './tareas'

/**
 * Los manifiestos declarados a mano.
 *
 * Están en código y no en la base a propósito: en modo espejo el manifiesto ES
 * el código leído por una persona, y un cambio tiene que pasar por un diff.
 * Cuando exista el escritor, los manifiestos van a nacer en `fab_pool_versiones`
 * y este registro desaparece.
 */
export interface PoolDeclarado {
  manifiesto: Manifiesto
  /** Prefijos con los que se buscan tablas del sector en el esquema real. */
  prefijos: string[]
}

export const MANIFIESTOS: Record<string, PoolDeclarado> = {
  tareas: { manifiesto: MANIFIESTO_TAREAS, prefijos: PREFIJOS_TAREAS },
  ofertas: { manifiesto: MANIFIESTO_OFERTAS, prefijos: PREFIJOS_OFERTAS },
}

export const CLAVES_DECLARADAS = Object.keys(MANIFIESTOS)
