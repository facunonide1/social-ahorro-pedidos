/**
 * `verificar:coherencia` compara el resumen de Abasto (un snapshot en
 * `agentes_resumen_snapshot`) contra la vista viva. Antes lo recalculaba con
 * `agentes_resumen_calcular`, que ESCRIBE el snapshot en producción y tarda
 * ~20 s sobre toda la cadena. Ahora sólo lo lee.
 *
 * Un snapshot viejo comparado contra la vista de ahora da diferencias que no
 * son cortes, sino datos que cambiaron. Por eso el cruce sólo vale si el
 * snapshot es reciente; si no, se saltea con la edad a la vista.
 */

/** Minutos que puede tener el snapshot para que el cruce exacto valga. */
export const VENTANA_SNAPSHOT_MIN = 15

/** Devuelve el motivo para saltear el cruce, o null si el snapshot sirve. */
export function motivoSaltearSnapshot(
  calculadoAt: string | null | undefined,
  ahora: Date,
  ventanaMin: number = VENTANA_SNAPSHOT_MIN,
): string | null {
  if (!calculadoAt) return 'el resumen de la cadena nunca se calculó'
  const t = new Date(calculadoAt).getTime()
  if (Number.isNaN(t)) return `calculado_at ilegible (${calculadoAt})`
  const min = (ahora.getTime() - t) / 60_000
  if (min > ventanaMin) {
    return `el snapshot tiene ${Math.round(min)} min (ventana ${ventanaMin}); comparar contra la vista de ahora daría diferencias que no son cortes`
  }
  return null
}
