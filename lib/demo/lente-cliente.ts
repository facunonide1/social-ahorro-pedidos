'use client'

/**
 * El mismo lente, para los componentes que consultan desde el navegador.
 *
 * Vive aparte porque `lib/demo/estado.ts` importa `next/headers` y no se puede
 * tocar desde un componente de cliente.
 */

import { sinDemoCliente } from './cliente'

export function lenteCliente<T>(consulta: T, columna = 'es_demo'): T {
  if (!sinDemoCliente()) return consulta
  // @ts-expect-error el builder de PostgREST expone .eq encadenable
  return consulta.eq(columna, false)
}
