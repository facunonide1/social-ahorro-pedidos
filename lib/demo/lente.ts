/**
 * EL LENTE, EN UNA LÍNEA.
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 *
 * Aplicar el lente era tres líneas: leer la cookie, guardar el builder en una
 * variable y reasignarlo con un `if`. Adentro de un `Promise.all` con seis
 * consultas encadenadas eso no entra, así que las pantallas que tenían esa forma
 * simplemente no lo aplicaban. Veintiocho de ellas.
 *
 * Un mecanismo de seguridad que es incómodo de usar termina sin usarse. Esto es
 * el mismo lente envuelto para que entre donde estaba la consulta:
 *
 *   sb.from('clientes').select('*')          →   lente(sb.from('clientes').select('*'))
 *
 * ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
 *
 * Si el interruptor está en «sin demostración», agrega `es_demo = false`. Si no,
 * no toca nada: mirar el sistema CON los datos de demostración es una opción
 * válida, y el que la elige sabe lo que está viendo.
 *
 * No sirve para tablas sin `es_demo`. Ahí el problema es otro —heredar la marca
 * de la fila madre— y lo resuelve `demo_heredar` en la base (migración 0111).
 */

import { sinDemo } from './estado'

export function lente<T>(consulta: T, columna = 'es_demo'): T {
  if (!sinDemo()) return consulta
  // @ts-expect-error el builder de PostgREST expone .eq encadenable
  return consulta.eq(columna, false)
}
