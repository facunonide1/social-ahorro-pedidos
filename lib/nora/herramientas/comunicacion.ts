/**
 * Herramientas de COMUNICACIÓN para NORA (tanda 2). Publica SIEMPRE a nombre del
 * usuario (nunca como NORA). Comunicado/encuesta son encargado+. La búsqueda
 * respeta la membresía server-side (solo canales del solicitante o públicos).
 */
import type { AdminRole } from '@/lib/types/admin'
import type { Herramienta, Opcion, NoraCtx } from './tipos'

const ENCARGADOS: AdminRole[] = ['super_admin', 'gerente', 'encargado_sucursal', 'administrativo', 'sucursal']

/** IDs de canales visibles para el usuario: donde es miembro + públicos. */
async function canalesPermitidos(adm: any, userId: string): Promise<string[]> {
  const [{ data: mem }, { data: pub }] = await Promise.all([
    adm.from('canal_miembros').select('canal_id').eq('user_id', userId),
    adm.from('canales').select('id').eq('es_privado', false),
  ])
  return [...new Set([...((mem ?? []) as any[]).map((m) => m.canal_id), ...((pub ?? []) as any[]).map((p) => p.id)])]
}

async function canalesSlot(adm: any, ctx: NoraCtx): Promise<Opcion[]> {
  const ids = await canalesPermitidos(adm, ctx.userId)
  if (!ids.length) return []
  const { data } = await adm.from('canales').select('id, nombre').in('id', ids).order('nombre')
  return ((data ?? []) as any[]).map((c) => ({ valor: c.id, label: c.nombre }))
}
async function nombreCanal(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('canales').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? 'el canal'
}
function parseOpciones(v: any): string[] {
  return String(v ?? '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
}

export const HERRAMIENTAS_COMUNICACION: Herramienta[] = [
  {
    id: 'mandar_mensaje',
    nombre: 'Mandar un mensaje a un canal',
    descripcion: 'Publica un mensaje en un canal donde participás. Se envía a tu nombre.',
    subapp: 'comunicacion',
    permiso: { modulo: 'comunicacion', accion: 'crear' },
    slots: [
      { nombre: 'canal', tipo: 'opcion', descripcion: 'A qué canal', queryOpciones: (adm, _v, ctx) => canalesSlot(adm, ctx) },
      { nombre: 'texto', tipo: 'texto', descripcion: 'El mensaje' },
    ],
    armarConfirmacion: async (adm, v) => ({
      titulo: 'Confirmá el mensaje',
      campos: [{ label: 'Canal', valor: await nombreCanal(adm, v.canal) }, { label: 'Mensaje', valor: String(v.texto ?? '—') }],
      advertencias: ['Se envía a tu nombre (no como NORA).'],
    }),
    ejecutar: async (adm, v, ctx) => {
      const texto = String(v.texto ?? '').trim()
      if (!texto) return { ok: false, texto: '', error: 'El mensaje está vacío.' }
      const { data, error } = await adm.from('mensajes').insert({ canal_id: v.canal, autor_user_id: ctx.userId, tipo: 'texto', contenido: texto }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Mensaje enviado a ${await nombreCanal(adm, v.canal)}.`, entidad_id: data?.id }
    },
  },
  {
    id: 'publicar_comunicado',
    nombre: 'Publicar un comunicado',
    descripcion: 'Publica un comunicado (con confirmación de lectura) en un canal. Solo encargados.',
    subapp: 'comunicacion',
    permiso: { modulo: 'comunicacion', accion: 'crear' },
    roles: ENCARGADOS,
    slots: [
      { nombre: 'canal', tipo: 'opcion', descripcion: 'Alcance (canal de la sucursal o general)', queryOpciones: (adm, _v, ctx) => canalesSlot(adm, ctx) },
      { nombre: 'texto', tipo: 'texto', descripcion: 'El comunicado' },
    ],
    armarConfirmacion: async (adm, v) => ({
      titulo: 'Confirmá el comunicado',
      campos: [{ label: 'Canal', valor: await nombreCanal(adm, v.canal) }, { label: 'Texto', valor: String(v.texto ?? '—') }],
      advertencias: ['Se publica a tu nombre y pide confirmación de lectura al equipo.'],
    }),
    ejecutar: async (adm, v, ctx) => {
      const texto = String(v.texto ?? '').trim()
      if (!texto) return { ok: false, texto: '', error: 'El comunicado está vacío.' }
      const { data, error } = await adm.from('mensajes').insert({ canal_id: v.canal, autor_user_id: ctx.userId, tipo: 'comunicado', contenido: texto, es_urgente: true }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Comunicado publicado en ${await nombreCanal(adm, v.canal)} (pide confirmación de lectura).`, entidad_id: data?.id }
    },
  },
  {
    id: 'crear_encuesta',
    nombre: 'Crear una encuesta',
    descripcion: 'Crea una encuesta en un canal. Solo encargados. Extraé la pregunta y las opciones si las dan.',
    subapp: 'comunicacion',
    permiso: { modulo: 'comunicacion', accion: 'crear' },
    roles: ENCARGADOS,
    slots: [
      { nombre: 'canal', tipo: 'opcion', descripcion: 'A qué canal', queryOpciones: (adm, _v, ctx) => canalesSlot(adm, ctx) },
      { nombre: 'pregunta', tipo: 'texto', descripcion: 'La pregunta de la encuesta' },
      { nombre: 'opciones', tipo: 'texto', descripcion: 'Las opciones separadas por coma (2 a 6)' },
      { nombre: 'multi', tipo: 'opcion', descripcion: '¿Se puede elegir más de una?', queryOpciones: async () => [{ valor: 'no', label: 'Una sola opción' }, { valor: 'si', label: 'Varias opciones' }] },
    ],
    armarConfirmacion: async (adm, v) => {
      const ops = parseOpciones(v.opciones)
      return { titulo: 'Confirmá la encuesta', campos: [{ label: 'Canal', valor: await nombreCanal(adm, v.canal) }, { label: 'Pregunta', valor: String(v.pregunta ?? '—') }, { label: 'Opciones', valor: ops.join(' · ') || '—' }, { label: 'Selección', valor: v.multi === 'si' ? 'varias' : 'una' }], advertencias: [] }
    },
    ejecutar: async (adm, v, ctx) => {
      const pregunta = String(v.pregunta ?? '').trim()
      const ops = parseOpciones(v.opciones)
      if (!pregunta) return { ok: false, texto: '', error: 'Falta la pregunta.' }
      if (ops.length < 2) return { ok: false, texto: '', error: 'Necesito al menos 2 opciones.' }
      const { data: msg, error } = await adm.from('mensajes').insert({ canal_id: v.canal, autor_user_id: ctx.userId, tipo: 'encuesta', contenido: pregunta }).select('id').single()
      if (error || !msg) return { ok: false, texto: '', error: error?.message ?? 'No se pudo crear la encuesta.' }
      const { error: e2 } = await adm.from('encuestas').insert({ mensaje_id: msg.id, opciones: ops, multi: v.multi === 'si' })
      if (e2) return { ok: false, texto: '', error: e2.message }
      return { ok: true, texto: `✓ Encuesta publicada en ${await nombreCanal(adm, v.canal)}: "${pregunta}".`, entidad_id: msg.id }
    },
  },
  {
    id: 'buscar_en_conversaciones',
    nombre: 'Buscar en las conversaciones',
    descripcion: 'Busca texto en los mensajes de tus canales (respeta a qué canales tenés acceso). Solo lectura.',
    subapp: 'comunicacion',
    soloLectura: true,
    permiso: { modulo: 'comunicacion', accion: 'ver' },
    slots: [
      { nombre: 'texto', tipo: 'texto', descripcion: 'Qué buscar' },
    ],
    responder: async (adm, v, ctx) => {
      const q = String(v.texto ?? '').trim()
      if (q.length < 2) return { texto: 'Decime al menos 2 letras para buscar.' }
      const ids = await canalesPermitidos(adm, ctx.userId)
      if (!ids.length) return { texto: 'No tenés canales con acceso para buscar.' }
      const { data } = await adm.from('mensajes')
        .select('contenido, created_at, canales(nombre)')
        .in('canal_id', ids)
        .textSearch('contenido', q, { type: 'websearch', config: 'spanish' })
        .order('created_at', { ascending: false }).limit(15)
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: `No encontré mensajes con "${q}" en tus canales.` }
      const lista = rows.slice(0, 10).map((r) => `• [${r.canales?.nombre ?? 'canal'}] ${String(r.contenido ?? '').slice(0, 120)}`).join('\n')
      return { texto: `${rows.length} resultado(s) para "${q}":\n${lista}` }
    },
  },
]
