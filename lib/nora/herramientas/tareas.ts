/**
 * Herramientas piloto de TAREAS para NORA (tanda 1). Reusan el mismo modelo que
 * la UI (insert en `tareas`, evidencia ON por default con opt-out registrado,
 * posponer con motivo obligatorio — reglas v0.38 / T-09).
 */
import type { Herramienta, Opcion, NoraCtx } from './tipos'
import { sucursalDefault } from './_comun'

const ACTIVOS = ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion', 'rechazada']

/** Sucursales para el slot: si hay contexto de sucursal, una sola → auto-selección. */
async function sucursalSlot(adm: any, ctx: NoraCtx): Promise<Opcion[]> {
  const def = sucursalDefault(ctx)
  if (def) {
    const { data } = await adm.from('sucursales').select('id, nombre').eq('id', def).maybeSingle()
    if (data) return [{ valor: data.id, label: data.nombre }]
  }
  const { data } = await adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
  return ((data ?? []) as any[]).map((s) => ({ valor: s.id, label: s.nombre }))
}

/** Empleados activos con usuario (para asignar), de la sucursal elegida. */
async function empleadosSlot(adm: any, sucursalId: string | null): Promise<Opcion[]> {
  let q = adm.from('empleados').select('user_id, nombre_completo, sucursal_id').eq('activo', true).not('user_id', 'is', null).order('nombre_completo')
  if (sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { data } = await q.limit(200)
  return ((data ?? []) as any[]).map((e) => ({ valor: e.user_id, label: e.nombre_completo }))
}

async function nombreEmpleado(adm: any, userId: string): Promise<string> {
  const { data } = await adm.from('empleados').select('nombre_completo').eq('user_id', userId).maybeSingle()
  return data?.nombre_completo ?? 'empleado'
}
async function nombreSucursal(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('sucursales').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? '—'
}

function fechaVenc(v: any): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
function fmt(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const HERRAMIENTAS_TAREAS: Herramienta[] = [
  {
    id: 'crear_tarea',
    nombre: 'Crear una tarea',
    descripcion: 'Crea y asigna una tarea a alguien del equipo desde lenguaje natural (ej: "Juan bajá las gaseosas del depósito antes de las 3"). Extraé título, la persona asignada, y la fecha/hora límite si la mencionan.',
    subapp: 'tareas',
    permiso: { modulo: 'tareas', accion: 'crear' },
    slots: [
      { nombre: 'titulo', tipo: 'texto', descripcion: 'Qué hay que hacer (título corto de la tarea)' },
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal de la tarea', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
      { nombre: 'asignado', tipo: 'opcion', descripcion: 'A quién se le asigna (por nombre)', queryOpciones: (adm, v) => empleadosSlot(adm, v.sucursal ?? null) },
      { nombre: 'vencimiento', tipo: 'texto', descripcion: 'Fecha/hora límite en ISO 8601 (inferila de expresiones como "antes de las 3" con la fecha de hoy). Vacío si no la dicen.', requeridoSi: () => false },
      { nombre: 'sin_evidencia', tipo: 'texto', descripcion: 'Poné "si" SOLO si piden explícitamente que la tarea sea sin evidencia/foto', requeridoSi: () => false },
    ],
    armarConfirmacion: async (adm, v) => {
      const asignado = v.asignado ? await nombreEmpleado(adm, v.asignado) : 'sin asignar'
      const suc = v.sucursal ? await nombreSucursal(adm, v.sucursal) : '—'
      const sinEv = !!String(v.sin_evidencia ?? '').trim()
      return {
        titulo: 'Confirmá la tarea',
        campos: [
          { label: 'Tarea', valor: String(v.titulo ?? '—') },
          { label: 'Asignada a', valor: asignado },
          { label: 'Sucursal', valor: suc },
          { label: 'Límite', valor: fmt(fechaVenc(v.vencimiento)) },
          { label: 'Evidencia', valor: sinEv ? 'sin foto (opt-out)' : 'con foto (obligatoria)' },
        ],
        advertencias: sinEv ? ['Queda registrado que la creaste SIN evidencia (opt-out).'] : [],
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const titulo = String(v.titulo ?? '').trim()
      if (!titulo) return { ok: false, texto: '', error: 'Falta el título de la tarea.' }
      const sinEv = !!String(v.sin_evidencia ?? '').trim()
      const asignado = v.asignado || null
      const venc = fechaVenc(v.vencimiento)
      const { data: tarea, error } = await adm.from('tareas').insert({
        tipo_origen: 'nora',
        titulo,
        prioridad: 'media',
        estado: asignado ? 'asignada' : 'pendiente',
        responsable_id: asignado,
        sucursal_id: v.sucursal || null,
        fecha_asignacion: asignado ? new Date().toISOString() : null,
        fecha_vencimiento: venc,
        evidencia_opt_out: sinEv,
        evidencia_opt_out_por: sinEv ? ctx.userId : null,
        creado_por: ctx.userId,
      }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      const quien = asignado ? await nombreEmpleado(adm, asignado) : null
      return { ok: true, texto: `✓ Tarea creada${quien ? ` para ${quien}` : ''}: "${titulo}"${venc ? ` (límite ${fmt(venc)})` : ''}.`, entidad_id: tarea?.id }
    },
  },
  {
    id: 'consultar_tareas',
    nombre: 'Consultar tareas pendientes',
    descripcion: 'Responde qué tareas están pendientes (las tuyas por default, o las de una sucursal si la nombran). Solo lectura.',
    subapp: 'tareas',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'tareas', accion: 'ver' },
    slots: [
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'Sucursal a consultar (opcional; vacío = mis tareas)', requeridoSi: () => false, queryOpciones: (adm) => sucursalSlot(adm, { esTodas: true } as NoraCtx) },
    ],
    responder: async (adm, v, ctx) => {
      let q = adm.from('tareas').select('titulo, estado, fecha_vencimiento, responsable_id').in('estado', ACTIVOS).order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(30)
      let cabecera: string
      if (v.sucursal) { q = q.eq('sucursal_id', v.sucursal); cabecera = `Pendientes en ${await nombreSucursal(adm, v.sucursal)}` }
      else { q = q.eq('responsable_id', ctx.userId); cabecera = 'Tus tareas pendientes' }
      const { data } = await q
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: `${cabecera}: no hay nada pendiente. 👌` }
      const lista = rows.slice(0, 12).map((r) => `• ${r.titulo} — ${r.estado}${r.fecha_vencimiento ? ` (${fmt(r.fecha_vencimiento)})` : ''}`).join('\n')
      return { texto: `${cabecera} (${rows.length}):\n${lista}\n\nVer todo → /admin/tareas` }
    },
  },
  {
    id: 'posponer_tarea',
    nombre: 'Posponer una tarea',
    descripcion: 'Pospone una de tus tareas activas. El motivo es obligatorio.',
    subapp: 'tareas',
    permiso: { modulo: 'tareas', accion: 'crear' },
    slots: [
      { nombre: 'tarea', tipo: 'opcion', descripcion: 'Cuál tarea posponer', queryOpciones: async (adm, _v, ctx) => {
        const { data } = await adm.from('tareas').select('id, titulo, estado, fecha_vencimiento').eq('responsable_id', ctx.userId).in('estado', ACTIVOS).order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(30)
        return ((data ?? []) as any[]).map((t) => ({ valor: t.id, label: t.titulo, sub: t.fecha_vencimiento ? fmt(t.fecha_vencimiento) : t.estado }))
      } },
      { nombre: 'motivo', tipo: 'texto', descripcion: 'Motivo por el que se pospone (obligatorio)' },
    ],
    armarConfirmacion: async (adm, v) => {
      const { data: t } = await adm.from('tareas').select('titulo').eq('id', v.tarea).maybeSingle()
      return { titulo: 'Confirmá que se pospone', campos: [{ label: 'Tarea', valor: t?.titulo ?? '—' }, { label: 'Motivo', valor: String(v.motivo ?? '—') }], advertencias: [] }
    },
    ejecutar: async (adm, v, ctx) => {
      const motivo = String(v.motivo ?? '').trim()
      if (motivo.length < 3) return { ok: false, texto: '', error: 'El motivo es obligatorio.' }
      const { data: t } = await adm.from('tareas').select('id, titulo').eq('id', v.tarea).eq('responsable_id', ctx.userId).maybeSingle()
      if (!t) return { ok: false, texto: '', error: 'No encontré esa tarea entre las tuyas activas.' }
      const { error } = await adm.from('tareas').update({ pospuesta_motivo: motivo }).eq('id', t.id)
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Pospuse "${t.titulo}". Motivo: ${motivo}.`, entidad_id: t.id }
    },
  },
]
