/**
 * Herramientas de PERSONAS (RRHH) para NORA (tanda 3, SOLO LECTURA). Reusan las
 * tablas reales `empleado_turnos` y `empleados`. No existe un punch-clock aparte:
 * la hora de entrada/salida registrada vive en el turno del día. Ausencias y
 * evaluaciones no tienen endpoint global (OS-1b lo confirmó) — no se inventan.
 */
import type { AdminRole } from '@/lib/types/admin'
import { coberturaSemana, lunesDe } from '@/lib/personas/cobertura'
import type { Herramienta, Opcion, NoraCtx } from './tipos'
import { sucursalDefault, sucursalesOpciones, parseFecha } from './_comun'

/** Encargado+ para ver datos de otros (fichajes/ficha). El permiso rrhh/ver ya excluye rasos. */
const ENCARGADO: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'auditor', 'rrhh', 'encargado_sucursal']

async function sucursalSlot(adm: any, ctx: NoraCtx): Promise<Opcion[]> {
  const def = sucursalDefault(ctx)
  if (def) {
    const { data } = await adm.from('sucursales').select('id, nombre').eq('id', def).maybeSingle()
    if (data) return [{ valor: data.id, label: data.nombre }]
  }
  return sucursalesOpciones(adm)
}
async function empleadosSlot(adm: any, term: string): Promise<Opcion[]> {
  let q = adm.from('empleados').select('id, nombre_completo, puesto').eq('activo', true).order('nombre_completo').limit(15)
  const t = String(term ?? '').trim()
  if (t.length >= 2) q = adm.from('empleados').select('id, nombre_completo, puesto').eq('activo', true).ilike('nombre_completo', `%${t.replace(/[%,]/g, ' ')}%`).order('nombre_completo').limit(15)
  const { data } = await q
  return ((data ?? []) as any[]).map((e) => ({ valor: e.id, label: e.nombre_completo, sub: e.puesto ?? undefined }))
}
const hhmm = (t: any) => (t ? String(t).slice(0, 5) : null)

export const HERRAMIENTAS_PERSONAS: Herramienta[] = [
  {
    id: 'consultar_turnos',
    nombre: 'Consultar turnos del día',
    descripcion: 'Responde quién trabaja en una sucursal en una fecha. Solo lectura.',
    subapp: 'personas',
    soloLectura: true,
    permiso: { modulo: 'rrhh', accion: 'ver' },
    slots: [
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
      { nombre: 'fecha', tipo: 'texto', descripcion: 'Fecha (dd/mm/aaaa); vacío = hoy', requeridoSi: () => false },
    ],
    responder: async (adm, v, ctx) => {
      const fecha = v.fecha ? (parseFecha(v.fecha) ?? ctx.hoy) : (ctx.hoy ?? new Date().toISOString().slice(0, 10))
      const { data: suc } = await adm.from('sucursales').select('nombre').eq('id', v.sucursal).maybeSingle()
      const { data } = await adm.from('empleado_turnos').select('hora_entrada, hora_salida, empleados!inner(nombre_completo, sucursal_id)').eq('empleados.sucursal_id', v.sucursal).eq('fecha', fecha).order('hora_entrada')
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: `No hay turnos cargados en ${suc?.nombre ?? 'esa sucursal'} para el ${fecha}.` }
      const lista = rows.map((r) => `• ${r.empleados?.nombre_completo ?? 'Empleado'}: ${hhmm(r.hora_entrada) ?? '—'}–${hhmm(r.hora_salida) ?? '—'}`).join('\n')
      return { texto: `Turnos en ${suc?.nombre ?? 'la sucursal'} (${fecha}):\n${lista}` }
    },
  },
  {
    id: 'consultar_fichajes',
    nombre: 'Consultar hora de entrada de un empleado',
    descripcion: 'Responde a qué hora entró/salió un empleado en una fecha (según su turno registrado). Solo encargados.',
    subapp: 'personas',
    soloLectura: true,
    permiso: { modulo: 'rrhh', accion: 'ver' },
    roles: ENCARGADO,
    slots: [
      { nombre: 'empleado', tipo: 'opcion', descripcion: 'El empleado', queryOpciones: (adm, v) => empleadosSlot(adm, v.empleado) },
      { nombre: 'fecha', tipo: 'texto', descripcion: 'Fecha (dd/mm/aaaa); vacío = hoy', requeridoSi: () => false },
    ],
    responder: async (adm, v, ctx) => {
      const fecha = v.fecha ? (parseFecha(v.fecha) ?? ctx.hoy) : (ctx.hoy ?? new Date().toISOString().slice(0, 10))
      const { data: e } = await adm.from('empleados').select('nombre_completo').eq('id', v.empleado).maybeSingle()
      const { data: t } = await adm.from('empleado_turnos').select('hora_entrada, hora_salida').eq('empleado_id', v.empleado).eq('fecha', fecha).maybeSingle()
      if (!t) return { texto: `No hay turno registrado de ${e?.nombre_completo ?? 'ese empleado'} para el ${fecha}.` }
      return { texto: `${e?.nombre_completo ?? 'El empleado'} el ${fecha}: entrada ${hhmm(t.hora_entrada) ?? '—'}, salida ${hhmm(t.hora_salida) ?? '—'}.` }
    },
  },
  {
    id: 'consultar_empleado',
    nombre: 'Consultar la ficha de un empleado',
    descripcion: 'Responde el puesto, la sucursal y el estado de un empleado. Solo encargados.',
    subapp: 'personas',
    soloLectura: true,
    permiso: { modulo: 'rrhh', accion: 'ver' },
    roles: ENCARGADO,
    slots: [
      { nombre: 'empleado', tipo: 'opcion', descripcion: 'El empleado', queryOpciones: (adm, v) => empleadosSlot(adm, v.empleado) },
    ],
    responder: async (adm, v) => {
      const { data: e } = await adm.from('empleados').select('nombre_completo, puesto, activo, sucursales(nombre)').eq('id', v.empleado).maybeSingle()
      if (!e) return { texto: 'No encontré ese empleado.' }
      return { texto: `**${e.nombre_completo}** — ${e.puesto ?? 'sin puesto'}\nSucursal: ${(e.sucursales as any)?.nombre ?? '—'} · ${e.activo ? 'activo' : 'inactivo'}` }
    },
  },
  {
    id: 'consultar_cobertura',
    nombre: 'Consultar cobertura farmacéutica',
    descripcion: 'Responde cuántas horas sin farmacéutico tiene una sucursal esta semana (regla de Compliance). Solo lectura.',
    subapp: 'personas',
    soloLectura: true,
    permiso: { modulo: 'rrhh', accion: 'ver' },
    slots: [
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
    ],
    responder: async (adm, v, ctx) => {
      const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10)
      const cob = await coberturaSemana(adm, v.sucursal, lunesDe(hoy))
      const { data: s } = await adm.from('sucursales').select('nombre').eq('id', v.sucursal).maybeSingle()
      if (cob.horasDescubiertas === 0) return { texto: `${s?.nombre ?? 'La sucursal'} está 100% cubierta esta semana (${cob.desde} → ${cob.hasta}). 👌` }
      const dias = cob.dias.filter((d) => d.horasDescubiertas > 0).map((d) => `${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}: ${d.horasDescubiertas}h`).join(' · ')
      const riesgo = cob.horasDescubiertas > cob.umbral ? ` ⚠️ supera el umbral (${cob.umbral}h)` : ''
      return { texto: `${s?.nombre ?? 'Sucursal'} tiene **${cob.horasDescubiertas}h sin farmacéutico** esta semana${riesgo}.\n${dias}\n\nVer grilla → /admin/rrhh/grilla?suc=${v.sucursal}` }
    },
  },
  {
    id: 'registrar_ausencia',
    nombre: 'Registrar una ausencia',
    descripcion: 'Solicita una ausencia de un empleado (queda pendiente de aprobación de un encargado). Extraé empleado, tipo y fechas.',
    subapp: 'personas',
    permiso: { modulo: 'rrhh', accion: 'ver' },
    slots: [
      { nombre: 'empleado', tipo: 'opcion', descripcion: 'El empleado', queryOpciones: (adm, v) => empleadosSlot(adm, v.empleado) },
      { nombre: 'tipo', tipo: 'opcion', descripcion: 'Tipo de ausencia', queryOpciones: async () => [{ valor: 'vacaciones', label: 'Vacaciones' }, { valor: 'enfermedad', label: 'Enfermedad' }, { valor: 'licencia', label: 'Licencia' }, { valor: 'falta', label: 'Falta' }] },
      { nombre: 'desde', tipo: 'texto', descripcion: 'Fecha de inicio (dd/mm/aaaa)' },
      { nombre: 'hasta', tipo: 'texto', descripcion: 'Fecha de fin (vacío = un solo día)', requeridoSi: () => false },
    ],
    armarConfirmacion: async (adm, v) => {
      const { data: e } = await adm.from('empleados').select('nombre_completo').eq('id', v.empleado).maybeSingle()
      const desde = parseFecha(v.desde), hasta = parseFecha(v.hasta) ?? desde
      return { titulo: 'Confirmá la ausencia', campos: [{ label: 'Empleado', valor: e?.nombre_completo ?? '—' }, { label: 'Tipo', valor: String(v.tipo ?? '—') }, { label: 'Fechas', valor: `${desde ?? '?'}${hasta && hasta !== desde ? ` → ${hasta}` : ''}` }], advertencias: ['Queda como SOLICITADA — la aprueba un encargado.'] }
    },
    ejecutar: async (adm, v) => {
      const desde = parseFecha(v.desde), hasta = parseFecha(v.hasta) ?? desde
      if (!desde) return { ok: false, texto: '', error: 'No entendí la fecha.' }
      const tipo = ['vacaciones', 'enfermedad', 'licencia', 'falta'].includes(v.tipo) ? v.tipo : 'licencia'
      const { data, error } = await adm.from('empleado_ausencias').insert({ empleado_id: v.empleado, tipo, fecha_desde: desde, fecha_hasta: hasta, estado: 'solicitada' }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      const { data: e } = await adm.from('empleados').select('nombre_completo').eq('id', v.empleado).maybeSingle()
      return { ok: true, texto: `✓ Ausencia de ${e?.nombre_completo ?? 'empleado'} solicitada (${desde}${hasta !== desde ? ` → ${hasta}` : ''}). Queda pendiente de aprobación.`, entidad_id: data?.id }
    },
  },
]
