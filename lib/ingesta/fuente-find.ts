/**
 * FIND COMO FUENTE DE LA INGESTA · ESQUELETO.
 *
 * FIND va a ser la fuente de datos maestra. Todavía no hay API, credenciales ni
 * formato acordados (pendiente P10), así que esto sólo deja el lugar: cumple
 * `FuenteArchivos` y cualquier uso falla con un motivo claro, en vez de leer
 * de Drive como si nada. Se prende con NORA_FUENTE_FIND='true' (la bandera
 * `fuente_find` de lib/banderas.ts); apagada, la ingesta sigue con Drive.
 *
 * Cuando FIND exista: implementar `listarPagina` y `descargar` contra su API
 * y armar la conexión (como `correrIngesta` hace con el OAuth de Drive). El
 * resto de la ingesta no cambia.
 */
import type { FuenteArchivos } from './fuente'

export class FuenteNoConfigurada extends Error {
  constructor(public fuente: string, motivo: string) {
    super(`${fuente}: ${motivo}`)
    this.name = 'FuenteNoConfigurada'
  }
}

export const MOTIVO_FIND = 'todavía no está conectado (falta la API y las credenciales de FIND)'

/** Misma regla que lib/banderas: sólo 'true' exacto prende. */
export function findPrendido(env: Record<string, string | undefined> = process.env): boolean {
  return env.NORA_FUENTE_FIND === 'true'
}

export function fuenteFind(): FuenteArchivos {
  return {
    nombre: 'find',
    async listarPagina() { throw new FuenteNoConfigurada('find', MOTIVO_FIND) },
    async descargar() { throw new FuenteNoConfigurada('find', MOTIVO_FIND) },
  }
}
