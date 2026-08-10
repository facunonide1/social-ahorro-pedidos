import { createAdminClient } from '@/lib/supabase/server'
import { getVencimientos, resumenVencimientos } from '@/lib/operaciones/vencimientos'

/**
 * EL EFECTO ESTIMADO DE CAMBIAR UN PARÁMETRO.
 *
 * ── POR QUÉ ES UN REGISTRO Y NO ALGO GENÉRICO ───────────────────────────────
 *
 * No existe una forma general de calcular qué pasa si un número cambia: hay que
 * saber qué se cuenta y con qué datos. El manifiesto puede declarar DÓNDE se usa
 * un parámetro —eso es estructura— pero no QUÉ significa contarlo, que es
 * lógica del sector.
 *
 * Así que hay un estimador por parámetro, escrito a mano, y para los que no lo
 * tienen la respuesta es "no puedo estimar el efecto". Eso es una respuesta.
 * Un número inventado sería peor que no tener ninguno: quien firma decidiría
 * sobre una cuenta que nadie hizo.
 *
 * ── Y CUANDO NO HAY DATOS, TAMBIÉN SE DICE ──────────────────────────────────
 *
 * Un estimador puede existir y aun así no poder contestar, porque no hay filas
 * que clasificar. Ese caso se distingue del "no hay estimador": el primero
 * dice "hoy no hay datos", el segundo dice "no sé cómo calcularlo". Confundirlos
 * sería el cero mentiroso otra vez, ahora en el impacto.
 *
 * ── LA FÁBRICA LEE, NUNCA ESCRIBE ───────────────────────────────────────────
 *
 * Este archivo importa del sector para CONTAR. No escribe nada y no puede: es
 * la única dirección permitida por la frontera.
 */

export interface Efecto {
  /** Se pudo calcular. */
  calculable: boolean
  /** La frase que lee quien firma. */
  texto: string
}

type Estimador = (actual: unknown, propuesto: unknown) => Promise<Efecto>

const ESTIMADORES: Record<string, Estimador> = {
  'stock.dias_aviso_vencimiento': async (actual, propuesto) => {
    const adm = createAdminClient()
    const filas = await getVencimientos(adm, { sucursalId: null, esTodas: true })
    if (filas.length === 0) {
      return {
        calculable: false,
        texto:
          'No puedo estimar el efecto: hoy no hay vencimientos cargados que clasificar. ' +
          'No es que el cambio no tenga efecto, es que no hay datos para medirlo.',
      }
    }
    const antes = resumenVencimientos(filas, Number(actual)).urgentes
    const despues = resumenVencimientos(filas, Number(propuesto)).urgentes
    return {
      calculable: true,
      texto: `Con los datos de hoy: pasarían de verse ${antes} vencimiento(s) en la ventana a ${despues}.`,
    }
  },
}

export async function efectoDe(
  poolClave: string,
  clave: string,
  actual: unknown,
  propuesto: unknown,
): Promise<Efecto> {
  const est = ESTIMADORES[`${poolClave}.${clave}`]
  if (!est) {
    return {
      calculable: false,
      // "No sé calcularlo" es distinto de "no hay datos", y se dice cuál es.
      texto: 'No puedo estimar el efecto: no hay una forma escrita de calcular qué cambia con este parámetro.',
    }
  }
  try {
    return await est(actual, propuesto)
  } catch {
    return { calculable: false, texto: 'No puedo estimar el efecto: falló la consulta que lo calcula.' }
  }
}
