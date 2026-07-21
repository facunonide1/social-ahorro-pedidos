/**
 * OS-5b · Compliance — helpers server-side. CP-01: nunca médico/paciente/receta.
 */
type Adm = any

/** Turno derivado de la hora AR (para el registro de despacho). */
export function turnoActual(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date()))
  return h < 14 ? 'manana' : h < 20 ? 'tarde' : 'noche'
}
export const TURNO_LABEL: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' }

export type PapelAlerta = { id: string; sucursal: string; tipo: string; vence_at: string; dias: number }

/** Papeles por vencer (≤30d) o vencidos, con días restantes. */
export async function papelesEnAlerta(adm: Adm, dias = 30): Promise<PapelAlerta[]> {
  const limite = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)
  const { data } = await adm.from('compliance_documentos').select('id, tipo, vence_at, sucursales(nombre)').not('vence_at', 'is', null).lte('vence_at', limite).order('vence_at')
  const hoy = new Date().toISOString().slice(0, 10)
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id, sucursal: (d.sucursales as any)?.nombre ?? '—', tipo: d.tipo, vence_at: d.vence_at,
    dias: Math.round((Date.parse(`${d.vence_at}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000),
  }))
}

/** Días sin cargar trazabilidad por sucursal (mira la tarea recurrente completada). */
export async function diasSinTrazabilidad(adm: Adm): Promise<{ sucursal_id: string; nombre: string; dias: number }[]> {
  const { data: sucs } = await adm.from('sucursales').select('id, nombre').eq('activa', true)
  const out: { sucursal_id: string; nombre: string; dias: number }[] = []
  for (const s of (sucs ?? []) as any[]) {
    const { data: cfg } = await adm.from('compliance_config').select('trazabilidad_activa').eq('sucursal_id', s.id).maybeSingle()
    if (cfg && cfg.trazabilidad_activa === false) continue
    // Última tarea de trazabilidad COMPLETADA de la sucursal.
    const { data: t } = await adm.from('tareas').select('fecha_completada, created_at')
      .contains('datos_custom', { tipo: 'trazabilidad' }).eq('sucursal_id', s.id).eq('estado', 'completada')
      .order('fecha_completada', { ascending: false }).limit(1).maybeSingle()
    const ref = t?.fecha_completada ?? t?.created_at ?? null
    const dias = ref ? Math.floor((Date.now() - Date.parse(ref)) / 86_400_000) : 99
    out.push({ sucursal_id: s.id, nombre: s.nombre, dias })
  }
  return out
}

/** Recalls activos. */
export async function recallsActivos(adm: Adm): Promise<number> {
  const { count } = await adm.from('compliance_recalls').select('id', { count: 'exact', head: true }).eq('estado', 'activo')
  return count ?? 0
}

/** Score de compliance por sucursal (0-100): trazabilidad al día + papeles vigentes + cobertura. */
export async function scoreCompliance(adm: Adm, sucursalId: string): Promise<number> {
  let puntos = 0, total = 0
  // Trazabilidad al día (≤1 día).
  const traz = (await diasSinTrazabilidad(adm)).find((x) => x.sucursal_id === sucursalId)
  total += 40; if (traz && traz.dias <= 1) puntos += 40; else if (traz && traz.dias <= 3) puntos += 20
  // Papeles vigentes.
  const { data: docs } = await adm.from('compliance_documentos').select('vence_at').eq('sucursal_id', sucursalId)
  const hoy = new Date().toISOString().slice(0, 10)
  const arr = (docs ?? []) as any[]
  total += 30
  if (arr.length) { const vig = arr.filter((d) => !d.vence_at || d.vence_at >= hoy).length; puntos += Math.round((vig / arr.length) * 30) } else puntos += 30
  // Cobertura (OS-5a): sin horas descubiertas esta semana.
  total += 30
  try {
    const { horasDescubiertasSemana, lunesDe } = await import('@/lib/personas/cobertura')
    const horas = await horasDescubiertasSemana(adm, sucursalId, lunesDe(hoy))
    puntos += horas === 0 ? 30 : horas <= 4 ? 15 : 0
  } catch { puntos += 30 }
  return Math.round((puntos / total) * 100)
}
