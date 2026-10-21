import { createClient } from '@/lib/supabase/server'

import type { EdadDelDato } from './edad-del-dato'

/**
 * De cuándo es el dato, leído de la base.
 *
 * Aparte de `edad-del-dato.ts` porque esto usa `next/headers` y eso sólo corre
 * en servidor: la frase la necesitan también componentes de cliente, y si
 * estuvieran en el mismo archivo el import los arrastraría.
 */
export async function edadDelDato(): Promise<EdadDelDato | null> {
  const sb = createClient()
  const { data } = await sb.rpc('maestro_estado').maybeSingle<{
    archivo: string | null
    fecha_archivo: string | null
    importado_at: string | null
    dias: number | null
    dias_limite: number
    esta_viejo: boolean | null
    filas: number | null
    con_avisos: boolean
  }>()
  if (!data) return null

  return {
    fechaArchivo: data.fecha_archivo,
    importadoAt: data.importado_at,
    dias: data.dias,
    limite: Number(data.dias_limite ?? 7),
    estaViejo: data.esta_viejo,
    archivo: data.archivo,
    filas: data.filas,
    conAvisos: !!data.con_avisos,
  }
}
