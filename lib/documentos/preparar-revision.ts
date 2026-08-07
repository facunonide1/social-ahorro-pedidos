import { procesarExtraccion } from '@/lib/documentos/extraer'
import { identificarTercero, type IdentificacionTercero } from '@/lib/documentos/identificar'
import { matchearLineas, UMBRALES, type MatchLinea } from '@/lib/documentos/matchear'
import type { ExtraccionCruda } from '@/lib/documentos/prompt-extraccion'

type Adm = any

export type Revision = {
  extraccionId: string
  datos: ExtraccionCruda
  confianzaGlobal: number | null
  camposDudosos: Record<string, number> | null
  tercero: IdentificacionTercero
  lineas: MatchLinea[]
  resumen: { total: number; automaticas: number; sugeridas: number; sinMatch: number }
  umbrales: typeof UMBRALES
}

export type ResultadoRevision = { estado: 'ok'; revision: Revision } | { estado: 'error'; mensaje: string }

/**
 * Todo lo que la pantalla de revisión necesita para abrirse: lo leído, quién lo
 * emitió y contra qué se matcheó cada renglón.
 *
 * Nada de esto se guarda como definitivo: son propuestas para que una persona
 * las mire. Lo único que ya está persistido es la respuesta cruda del modelo.
 */
export async function prepararRevision(adm: Adm, extraccionId: string): Promise<ResultadoRevision> {
  const ext = await procesarExtraccion(adm, extraccionId)
  if (ext.estado === 'error') return { estado: 'error', mensaje: ext.mensaje }

  const datos = ext.datos
  const tercero = await identificarTercero(
    adm,
    datos.emisor?.identificacion_fiscal ?? null,
    datos.emisor?.nombre ?? null,
  )

  const terceroId = tercero.estado === 'encontrado' ? tercero.terceroId : null
  const lineas = await matchearLineas(adm, datos.lineas ?? [], terceroId)

  return {
    estado: 'ok',
    revision: {
      extraccionId,
      datos,
      confianzaGlobal: ext.confianzaGlobal,
      camposDudosos: (datos.campos_dudosos as any) ?? null,
      tercero,
      lineas,
      resumen: {
        total: lineas.length,
        automaticas: lineas.filter((l) => l.matchEstado === 'automatico').length,
        sugeridas: lineas.filter((l) => l.matchEstado === 'sugerido').length,
        sinMatch: lineas.filter((l) => l.matchEstado === 'sin_match').length,
      },
      umbrales: UMBRALES,
    },
  }
}
