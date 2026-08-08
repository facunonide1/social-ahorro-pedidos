import type { Manifiesto } from '../tipos'
import { MANIFIESTO_CENTRO_DATOS, PREFIJOS_CENTRO_DATOS, EXCLUIR_CENTRO_DATOS } from './centro-datos'
import { MANIFIESTO_CLIENTES, PREFIJOS_CLIENTES } from './clientes'
import { MANIFIESTO_CONFIGURACION, PREFIJOS_CONFIGURACION, EXCLUIR_CONFIGURACION } from './configuracion'
import { MANIFIESTO_DOCUMENTOS, PREFIJOS_DOCUMENTOS, EXCLUIR_DOCUMENTOS } from './documentos'
import { MANIFIESTO_FINANZAS, PREFIJOS_FINANZAS, EXCLUIR_FINANZAS } from './finanzas'
import { MANIFIESTO_INTELIGENCIA, PREFIJOS_INTELIGENCIA, EXCLUIR_INTELIGENCIA } from './inteligencia'
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

/** Núcleo primero, después el resto: el orden en que se declararon. */
export const MANIFIESTOS: Record<string, PoolDeclarado> = {
  configuracion: { manifiesto: MANIFIESTO_CONFIGURACION, prefijos: PREFIJOS_CONFIGURACION, excluir: EXCLUIR_CONFIGURACION },
  'centro-datos': { manifiesto: MANIFIESTO_CENTRO_DATOS, prefijos: PREFIJOS_CENTRO_DATOS, excluir: EXCLUIR_CENTRO_DATOS },
  documentos: { manifiesto: MANIFIESTO_DOCUMENTOS, prefijos: PREFIJOS_DOCUMENTOS, excluir: EXCLUIR_DOCUMENTOS },
  inteligencia: { manifiesto: MANIFIESTO_INTELIGENCIA, prefijos: PREFIJOS_INTELIGENCIA, excluir: EXCLUIR_INTELIGENCIA },
  tareas: { manifiesto: MANIFIESTO_TAREAS, prefijos: PREFIJOS_TAREAS },
  clientes: { manifiesto: MANIFIESTO_CLIENTES, prefijos: PREFIJOS_CLIENTES },
  stock: { manifiesto: MANIFIESTO_STOCK, prefijos: PREFIJOS_STOCK, excluir: EXCLUIR_STOCK },
  finanzas: { manifiesto: MANIFIESTO_FINANZAS, prefijos: PREFIJOS_FINANZAS, excluir: EXCLUIR_FINANZAS },
  ofertas: { manifiesto: MANIFIESTO_OFERTAS, prefijos: PREFIJOS_OFERTAS },
}

export const CLAVES_DECLARADAS = Object.keys(MANIFIESTOS)
