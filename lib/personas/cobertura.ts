/**
 * OS-5a · Cobertura farmacéutica por franja. Regla de Compliance PBA: "sin
 * farmacéutico presente no se despacha". Una franja horaria del horario de
 * atención está CUBIERTA si hay al menos un empleado es_farmaceutico con turno
 * que la solapa y sin ausencia aprobada ese día. Todo lo demás = descubierto.
 */
type Adm = any

export const ROLES_COBERTURA = ['farmaceutico', 'cajero', 'repositor', 'encargado', 'otro'] as const
export type CoberturaConfig = { hora_apertura: number; hora_cierre: number; umbral_horas_descubiertas: number }

export type Presente = { nombre: string; rol: string | null; esFarma: boolean }
export type Franja = { hora: number; cubierta: boolean; presentes: Presente[] }
export type DiaCobertura = { fecha: string; dow: number; horasDescubiertas: number; franjas: Franja[] }
export type SemanaCobertura = {
  sucursalId: string; desde: string; hasta: string
  apertura: number; cierre: number; umbral: number
  dias: DiaCobertura[]; horasDescubiertas: number
}

function horaDe(t: string | null): number | null {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h + (m || 0) / 60
}
export function sumarDiasISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}
/** Lunes de la semana que contiene la fecha dada (ISO). */
export function lunesDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  const dow = d.getUTCDay() // 0=dom
  const delta = dow === 0 ? -6 : 1 - dow
  return sumarDiasISO(iso, delta)
}

export async function coberturaConfig(adm: Adm, sucursalId: string): Promise<CoberturaConfig> {
  const { data } = await adm.from('cobertura_config').select('hora_apertura, hora_cierre, umbral_horas_descubiertas').eq('sucursal_id', sucursalId).maybeSingle()
  return { hora_apertura: data?.hora_apertura ?? 8, hora_cierre: data?.hora_cierre ?? 20, umbral_horas_descubiertas: data?.umbral_horas_descubiertas ?? 4 }
}

/** Cobertura de una semana (weekStart = lunes ISO) para una sucursal. */
export async function coberturaSemana(adm: Adm, sucursalId: string, weekStart: string): Promise<SemanaCobertura> {
  const cfg = await coberturaConfig(adm, sucursalId)
  const desde = weekStart, hasta = sumarDiasISO(weekStart, 6)

  const { data: emps } = await adm.from('empleados').select('id, nombre_completo, es_farmaceutico').eq('sucursal_id', sucursalId).eq('activo', true)
  const empList = (emps ?? []) as any[]
  const empById = new Map(empList.map((e) => [e.id, e]))
  const empIds = empList.map((e) => e.id)

  let turnos: any[] = [], ausencias: any[] = []
  if (empIds.length) {
    const [{ data: t }, { data: a }] = await Promise.all([
      adm.from('empleado_turnos').select('empleado_id, fecha, hora_entrada, hora_salida, rol_cobertura').in('empleado_id', empIds).gte('fecha', desde).lte('fecha', hasta),
      adm.from('empleado_ausencias').select('empleado_id, fecha_desde, fecha_hasta').in('empleado_id', empIds).eq('estado', 'aprobada').lte('fecha_desde', hasta).gte('fecha_hasta', desde),
    ])
    turnos = (t ?? []) as any[]; ausencias = (a ?? []) as any[]
  }
  const ausente = (empId: string, fecha: string) => ausencias.some((x) => x.empleado_id === empId && x.fecha_desde <= fecha && x.fecha_hasta >= fecha)

  const dias: DiaCobertura[] = []
  let totalDescubiertas = 0
  for (let d = 0; d < 7; d++) {
    const fecha = sumarDiasISO(weekStart, d)
    const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    const franjas: Franja[] = []
    let desc = 0
    for (let h = cfg.hora_apertura; h < cfg.hora_cierre; h++) {
      const presentes: Presente[] = []
      for (const tt of turnos) {
        if (tt.fecha !== fecha) continue
        if (ausente(tt.empleado_id, fecha)) continue
        const ent = horaDe(tt.hora_entrada), sal = horaDe(tt.hora_salida)
        if (ent == null || sal == null) continue
        if (ent <= h && sal >= h + 1) {
          const e = empById.get(tt.empleado_id)
          presentes.push({ nombre: e?.nombre_completo ?? 'Empleado', rol: tt.rol_cobertura ?? null, esFarma: !!e?.es_farmaceutico })
        }
      }
      const cubierta = presentes.some((p) => p.esFarma)
      if (!cubierta) desc++
      franjas.push({ hora: h, cubierta, presentes })
    }
    totalDescubiertas += desc
    dias.push({ fecha, dow, horasDescubiertas: desc, franjas })
  }
  return { sucursalId, desde, hasta, apertura: cfg.hora_apertura, cierre: cfg.hora_cierre, umbral: cfg.umbral_horas_descubiertas, dias, horasDescubiertas: totalDescubiertas }
}

/** Horas descubiertas de una sucursal en una semana (para KPI/tendencia). */
export async function horasDescubiertasSemana(adm: Adm, sucursalId: string, weekStart: string): Promise<number> {
  return (await coberturaSemana(adm, sucursalId, weekStart)).horasDescubiertas
}

/** Sucursales que superan su umbral de horas descubiertas esta semana (alertas). */
export async function sucursalesEnRiesgo(adm: Adm, weekStart: string): Promise<{ sucursal_id: string; nombre: string; horas: number; umbral: number }[]> {
  const { data: sucs } = await adm.from('sucursales').select('id, nombre').eq('activa', true)
  const out: { sucursal_id: string; nombre: string; horas: number; umbral: number }[] = []
  for (const s of (sucs ?? []) as any[]) {
    try {
      const cob = await coberturaSemana(adm, s.id, weekStart)
      if (cob.horasDescubiertas > cob.umbral) out.push({ sucursal_id: s.id, nombre: s.nombre, horas: cob.horasDescubiertas, umbral: cob.umbral })
    } catch { /* sigue */ }
  }
  return out.sort((a, b) => b.horas - a.horas)
}
