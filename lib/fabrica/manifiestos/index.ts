import type { Manifiesto } from '../tipos'
import { MANIFIESTO_CLIENTES, PREFIJOS_CLIENTES } from './clientes'
import { MANIFIESTO_OFERTAS, PREFIJOS_OFERTAS } from './ofertas'
import { MANIFIESTO_STOCK, PREFIJOS_STOCK, EXCLUIR_STOCK } from './stock'
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
  /** Tablas que el prefijo alcanza y son de otro pool. Con motivo al lado. */
  excluir?: string[]
}

export const MANIFIESTOS: Record<string, PoolDeclarado> = {
  tareas: { manifiesto: MANIFIESTO_TAREAS, prefijos: PREFIJOS_TAREAS },
  clientes: { manifiesto: MANIFIESTO_CLIENTES, prefijos: PREFIJOS_CLIENTES },
  stock: { manifiesto: MANIFIESTO_STOCK, prefijos: PREFIJOS_STOCK, excluir: EXCLUIR_STOCK },
  ofertas: { manifiesto: MANIFIESTO_OFERTAS, prefijos: PREFIJOS_OFERTAS },
}

export const CLAVES_DECLARADAS = Object.keys(MANIFIESTOS)
