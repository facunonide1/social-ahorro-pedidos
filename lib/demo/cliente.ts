'use client'

/**
 * EL MISMO INTERRUPTOR, LEÍDO DESDE EL NAVEGADOR.
 *
 * `lib/demo/estado.ts` importa `next/headers` y sólo corre en el servidor. La
 * campana de notificaciones es un componente de cliente que consulta Supabase
 * directo, así que necesita leer la cookie de este lado.
 *
 * El nombre de la cookie se importa de allá a propósito: dos archivos con la
 * misma cadena escrita a mano es la clase de cosa que se desincroniza una vez
 * y no se nota nunca.
 */

import { COOKIE_SIN_DEMO } from './estado-nombre'

export function sinDemoCliente(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie
    .split('; ')
    .some((c) => c === `${COOKIE_SIN_DEMO}=1`)
}
