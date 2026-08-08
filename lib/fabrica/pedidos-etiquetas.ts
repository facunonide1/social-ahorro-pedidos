/**
 * Los tipos y las etiquetas de los pedidos, SIN acceso a la base.
 *
 * Vive aparte por el mismo motivo que `lector-estados.ts`: los controles del
 * portal son componentes de cliente, y si importan desde `pedidos.ts` arrastran
 * `next/headers` y el build se cae con un error que no habla de esto.
 */

export type QueFalta =
  /** No hay un patrón de pantalla o flujo que lo cubra. */
  | 'molde'
  /** Hace falta guardar algo que hoy no se guarda. */
  | 'entidad'
  /** Hace falta que el sistema haga algo que no hace. */
  | 'comportamiento'
  /** Depende de un sistema de afuera. */
  | 'integracion'
  /** Existe declarado; el lector todavía no lo lee. */
  | 'capacidad_lector'

export type EstadoPedido =
  | 'abierto'
  | 'en_analisis'
  | 'en_construccion'
  | 'resuelto'
  | 'descartado'

export const ETIQUETA_FALTA: Record<QueFalta, string> = {
  molde: 'falta un molde',
  entidad: 'falta guardar algo que hoy no se guarda',
  comportamiento: 'falta que el sistema haga algo que no hace',
  integracion: 'depende de un sistema de afuera',
  capacidad_lector: 'está declarado, el lector todavía no lo lee',
}

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  abierto: 'abierto',
  en_analisis: 'en análisis',
  en_construccion: 'en construcción',
  resuelto: 'resuelto',
  descartado: 'descartado',
}
