/**
 * Los estados del lector, sin nada de servidor.
 *
 * Vive aparte de `flag.ts` porque los controles del portal son componentes de
 * cliente y necesitan las etiquetas. `flag.ts` importa el cliente de Supabase
 * de servidor, que a su vez importa `next/headers`: importarlo desde el cliente
 * rompe el build entero.
 *
 * La separación no es un tecnicismo: lo que se puede mostrar y lo que puede
 * escribir en la base son dos cosas distintas y conviene que no vivan juntas.
 */

export type EstadoLector = 'apagado' | 'sombra' | 'prendido'

export const ESTADOS_LECTOR: EstadoLector[] = ['apagado', 'sombra', 'prendido']

export const ETIQUETA_LECTOR: Record<EstadoLector, string> = {
  apagado: 'apagado',
  sombra: 'en sombra',
  prendido: 'prendido',
}

export const EXPLICACION_LECTOR: Record<EstadoLector, string> = {
  apagado: 'El sector lee su definición del código. Es exactamente lo de hoy.',
  sombra:
    'Lee del código, y la fábrica calcula en paralelo qué habría devuelto. Registra las diferencias sin afectar nada.',
  prendido: 'El sector lee su definición de la declaración.',
}
