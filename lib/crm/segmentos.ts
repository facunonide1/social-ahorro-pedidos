/**
 * Motor de segmentos (CRM · v0.29). Evalúa reglas (auto de NORA o manuales) sobre
 * el maestro `clientes`. Respeta el selector de sucursal global. Devuelve los ids
 * y el conteo para precargar campañas.
 */
import type { SegmentoRegla, ClienteRiesgo, ClienteNivel } from '@/lib/types/crm'

type Sb = any

export type SegmentoAuto = { clave: string; nombre: string; descripcion: string; regla: SegmentoRegla; icon: string }

/** Los 4 segmentos automáticos de NORA (mockup). */
export const AUTO_SEGMENTOS: SegmentoAuto[] = [
  { clave: 'riesgo', nombre: 'En riesgo de irse', descripcion: 'Antes compraban seguido y hace 30+ días que no vuelven.', regla: { riesgo: 'alto' }, icon: 'AlertTriangle' },
  { clave: 'vip', nombre: 'Mejores clientes (VIP)', descripcion: 'Top 10% por gasto de los últimos 12 meses.', regla: { top_pct_gasto: 10 }, icon: 'Crown' },
  { clave: 'cronicos', nombre: 'Crónicos / recurrentes', descripcion: 'Compran regularmente cada mes (medicación crónica).', regla: { frecuencia_max_dias: 35 }, icon: 'Repeat' },
  { clave: 'cumple', nombre: 'Cumpleaños del mes', descripcion: 'Cumplen años este mes — saludo + beneficio.', regla: { cumple_mes: 0 }, icon: 'Cake' },
]

type Ctx = { sucursalId?: string | null; esTodas?: boolean }

/**
 * Devuelve { ids, count } de los clientes que caen en la regla.
 * Para top_pct_gasto y cumple_mes hace post-proceso en JS.
 */
export async function evaluarSegmento(sb: Sb, regla: SegmentoRegla, ctx: Ctx = {}): Promise<{ ids: string[]; count: number }> {
  let q = sb.from('clientes').select('id, total_gastado_12m, fecha_nacimiento, riesgo_churn, frecuencia_compra_dias, ultima_compra, nivel, tipo, sucursal_habitual_id').eq('activo', true).limit(50000)

  if (!ctx.esTodas && ctx.sucursalId) q = q.eq('sucursal_habitual_id', ctx.sucursalId)
  if (regla.tipo) q = q.eq('tipo', regla.tipo)
  if (regla.nivel) q = q.eq('nivel', regla.nivel)
  if (regla.riesgo) q = q.eq('riesgo_churn', regla.riesgo)
  if (regla.sucursal_id) q = q.eq('sucursal_habitual_id', regla.sucursal_id)
  if (regla.gasto_min != null) q = q.gte('total_gastado_12m', regla.gasto_min)
  if (regla.frecuencia_max_dias != null) q = q.lte('frecuencia_compra_dias', regla.frecuencia_max_dias)
  if (regla.ultima_compra_dias_min != null) {
    const d = new Date(Date.now() - regla.ultima_compra_dias_min * 86400000).toISOString().slice(0, 10)
    q = q.lte('ultima_compra', d)
  }
  if (regla.ultima_compra_dias_max != null) {
    const d = new Date(Date.now() - regla.ultima_compra_dias_max * 86400000).toISOString().slice(0, 10)
    q = q.gte('ultima_compra', d)
  }

  const { data } = await q
  let rows = (data ?? []) as any[]

  // cumpleaños del mes (cumple_mes: 0 = mes actual, 1-12 = ese mes)
  if (regla.cumple_mes != null) {
    const mes = regla.cumple_mes === 0 ? new Date().getMonth() + 1 : regla.cumple_mes
    rows = rows.filter((r) => r.fecha_nacimiento && new Date(r.fecha_nacimiento + 'T00:00:00').getMonth() + 1 === mes)
  }

  // top N% por gasto
  if (regla.top_pct_gasto != null && rows.length) {
    rows.sort((a, b) => Number(b.total_gastado_12m) - Number(a.total_gastado_12m))
    const n = Math.max(1, Math.ceil(rows.length * (regla.top_pct_gasto / 100)))
    rows = rows.slice(0, n)
  }

  return { ids: rows.map((r) => r.id), count: rows.length }
}

export const RIESGO_VARIANT: Record<ClienteRiesgo, 'success' | 'warning' | 'destructive'> = {
  bajo: 'success', medio: 'warning', alto: 'destructive',
}
export const NIVEL_VARIANT: Record<ClienteNivel, 'secondary' | 'info' | 'success'> = {
  socio: 'secondary', plus: 'info', premium: 'success',
}
