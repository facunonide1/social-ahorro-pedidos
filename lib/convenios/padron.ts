import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * EL PADRÓN DE CONVENIOS · LECTURA.
 *
 * ── EL LÍMITE, OTRA VEZ ─────────────────────────────────────────────────────
 *
 * Nada de lo que se lee acá tiene paciente, médico ni diagnóstico. Si alguna
 * vez aparece un campo así en una consulta de este directorio, está mal el
 * campo, no la consulta. Regla de oro 9.
 */

export type ConvenioTipo = 'obra_social' | 'prepaga' | 'mutual' | 'pami' | 'otro'
export type Troquel = 'fisico' | 'digital' | 'ambos' | 'ninguno'
export type Periodicidad = 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'otra'
export type ModoPresentacion = 'por_sucursal' | 'consolidada'
export type Exigencia =
  | 'troquel' | 'firma' | 'vademecum' | 'autorizacion_previa'
  | 'tope_unidades' | 'sello_farmaceutico' | 'fecha_legible' | 'otra'

export const TIPO_LABEL: Record<ConvenioTipo, string> = {
  obra_social: 'Obra social', prepaga: 'Prepaga', mutual: 'Mutual',
  pami: 'PAMI', otro: 'Otro',
}
export const TROQUEL_LABEL: Record<Troquel, string> = {
  fisico: 'Troquel físico', digital: 'Troquel digital',
  ambos: 'Físico y digital', ninguno: 'No pide troquel',
}
export const PERIODICIDAD_LABEL: Record<Periodicidad, string> = {
  semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
  bimestral: 'Bimestral', otra: 'Otra',
}
export const MODO_LABEL: Record<ModoPresentacion, string> = {
  por_sucursal: 'Una presentación por sucursal',
  consolidada: 'Una presentación para toda la cadena',
}

/**
 * Las exigencias, con el motivo de débito que aparece cuando no se cumplen.
 *
 * Esta tabla es la bisagra de toda la sesión: un débito deja de ser una
 * sorpresa y pasa a ser el incumplimiento de algo que estaba escrito.
 */
export const EXIGENCIAS: { clave: Exigencia; label: string; motivo: string; que_es: string }[] = [
  { clave: 'troquel', label: 'Troquel', motivo: 'troquel_faltante',
    que_es: 'El troquel tiene que estar pegado y legible. Es el motivo de débito más común y el más recuperable: si el troquel aparece, se reclama.' },
  { clave: 'firma', label: 'Firma de conformidad', motivo: 'firma_ilegible',
    que_es: 'La conformidad firmada al recibir. Lo que se guarda es que estaba firmada, no quién firmó.' },
  { clave: 'vademecum', label: 'Vademécum', motivo: 'fuera_de_vademecum',
    que_es: 'El producto tiene que estar en la lista que cubre el convenio. Un débito por esto no se recupera: no estaba cubierto.' },
  { clave: 'autorizacion_previa', label: 'Autorización previa', motivo: 'sin_autorizacion_previa',
    que_es: 'Algunos productos necesitan autorización antes de despachar. Sin ella, el débito es firme.' },
  { clave: 'tope_unidades', label: 'Tope de unidades', motivo: 'supera_el_tope',
    que_es: 'Cuántas unidades cubre por comprobante o por mes. Lo que pasa del tope se debita.' },
  { clave: 'sello_farmaceutico', label: 'Sello del farmacéutico', motivo: 'receta_mal_cargada',
    que_es: 'El sello y la matrícula de la farmacia que despachó. Es de la farmacia, no del médico.' },
  { clave: 'fecha_legible', label: 'Fecha legible', motivo: 'fuera_de_plazo',
    que_es: 'Una fecha que no se lee se trata como fuera de plazo.' },
  { clave: 'otra', label: 'Otra', motivo: 'otro',
    que_es: 'Lo que pida este convenio y no entre en los de arriba. Se escribe en el detalle.' },
]

export interface ConvenioFila {
  id: string
  nombre: string
  sigla: string | null
  tipo: ConvenioTipo
  activo: boolean
  cobertura_general_pct: number | null
  plazo_presentacion_dias: number | null
  plazo_pago_dias: number | null
  troquel: Troquel | null
  periodicidad: Periodicidad | null
  modo_presentacion: ModoPresentacion | null
  dia_cierre: number | null
  aviso_dias_antes: number
  firmado_at: string | null
  notas: string | null
  /** Qué le falta para poder trabajar con él. Vacío = está completo. */
  le_falta: string[]
}

/**
 * Qué le falta a un convenio para que el sistema pueda hacer algo con él.
 *
 * No es una validación: un convenio incompleto se guarda igual. Es que sin el
 * plazo de presentación no se puede avisar antes del cierre, y sin saber qué
 * exige no se puede explicar un débito. La pantalla lo dice en vez de
 * comportarse como si estuviera todo.
 */
export function loQueLeFalta(c: {
  plazo_presentacion_dias: number | null
  plazo_pago_dias: number | null
  cobertura_general_pct: number | null
  coberturas: number
  requisitos: number
  contactos: number
  periodicidad: Periodicidad | null
}): string[] {
  const falta: string[] = []
  if (c.plazo_presentacion_dias == null) falta.push('el plazo de presentación: sin eso no se puede avisar antes del cierre')
  if (c.periodicidad == null) falta.push('cada cuánto se presenta')
  if (c.plazo_pago_dias == null) falta.push('a cuántos días paga')
  if (c.cobertura_general_pct == null && c.coberturas === 0) falta.push('qué porcentaje cubre')
  if (c.requisitos === 0) falta.push('qué exige: son las reglas que después explican los débitos')
  if (c.contactos === 0) falta.push('dónde se presenta')
  return falta
}

export async function leerPadron(sb: SupabaseClient): Promise<ConvenioFila[]> {
  // El padrón son decenas de convenios, no miles: una farmacia trabaja con 20
  // o 40. Las tres tablas hijas tampoco pasan de unos cientos de filas, y
  // quedan declaradas en el conteo del auditor de cortes para que el día que
  // crezcan lo diga el build y no una pantalla.
  const [{ data: convenios }, { data: cob }, { data: req }, { data: con }] = await Promise.all([
    sb.from('convenios').select('*').order('activo', { ascending: false }).order('nombre'),
    sb.from('convenio_cobertura').select('convenio_id'),
    sb.from('convenio_requisitos').select('convenio_id'),
    sb.from('convenio_contactos').select('convenio_id'),
  ])

  const cuenta = (filas: any[] | null, id: string) =>
    (filas ?? []).filter((f) => f.convenio_id === id).length

  return ((convenios ?? []) as any[]).map((c) => ({
    ...c,
    cobertura_general_pct: c.cobertura_general_pct == null ? null : Number(c.cobertura_general_pct),
    le_falta: loQueLeFalta({
      plazo_presentacion_dias: c.plazo_presentacion_dias,
      plazo_pago_dias: c.plazo_pago_dias,
      cobertura_general_pct: c.cobertura_general_pct,
      periodicidad: c.periodicidad,
      coberturas: cuenta(cob as any[], c.id),
      requisitos: cuenta(req as any[], c.id),
      contactos: cuenta(con as any[], c.id),
    }),
  }))
}

/**
 * El próximo cierre de presentación de un convenio.
 *
 * Null cuando no se puede saber, y el motivo al lado. Sin periodicidad ni día
 * de cierre no hay fecha que calcular — y poner una inventada haría que el
 * aviso suene el día equivocado, que es peor que no avisar.
 */
export function proximoCierre(c: {
  periodicidad: Periodicidad | null
  dia_cierre: number | null
}, hoy = new Date()): { fecha: string | null; por_que_no: string | null } {
  if (!c.periodicidad) return { fecha: null, por_que_no: 'no está cargado cada cuánto se presenta' }
  if (c.dia_cierre == null) return { fecha: null, por_que_no: 'no está cargado el día de cierre' }

  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const d = hoy.getDate()
  const dia = c.dia_cierre

  // El día de cierre puede no existir en el mes (31 en febrero): se toma el
  // último día del mes, que es lo que hace cualquier convenio en la práctica.
  const enMes = (anio: number, mes: number) => {
    const ultimo = new Date(anio, mes + 1, 0).getDate()
    return new Date(anio, mes, Math.min(dia, ultimo))
  }

  let f = enMes(y, m)
  if (c.periodicidad === 'quincenal' && d < 15 && dia > 15) f = new Date(y, m, 15)
  if (f.getDate() < d) f = enMes(y, m + 1)
  if (c.periodicidad === 'bimestral' && f.getMonth() % 2 !== 0) f = enMes(f.getFullYear(), f.getMonth() + 1)

  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(f)
  return { fecha: iso, por_que_no: null }
}
