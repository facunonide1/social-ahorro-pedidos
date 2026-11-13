/**
 * POR QUÉ NO ENTRA ALGO DE DRIVE: lo que se puede saber sin mirar la base a mano.
 * Lo usa GET /api/integraciones/google-drive/estado y el panel de la pantalla.
 */
import { MINUTOS_TRABADO, prioridad } from './lote'
import { lockLibre, type Cursor } from './cursor'

/** Las dos carpetas compartidas de donde salen las compras y las listas. */
export const CARPETAS_ESPERADAS = ['compras farmacias', 'compras farmacias (privado)']

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export type Aviso = { nivel: 'error' | 'atencion' | 'info'; texto: string }

export function diagnosticar(s: {
  ahora: Date
  habilitada: boolean
  cronSecret: boolean
  conexion: { estado: string; last_error: string | null; listado_cursor: Cursor | null } | null
  carpetas: { folder_id: string; folder_nombre: string; incluir_subcarpetas: boolean }[]
  procesando: { nombre: string; updated_at: string | null }[]
  pendientes: { nombre: string; clasificacion: string | null; clasificacion_forzada?: string | null; bytes: number | null }[]
}): Aviso[] {
  const a: Aviso[] = []
  if (!s.habilitada) a.push({ nivel: 'error', texto: 'DRIVE_INGESTA_ENABLED no es «true»: el cron responde sin hacer nada.' })
  if (!s.cronSecret) a.push({ nivel: 'error', texto: 'CRON_SECRET no está configurado en Vercel: el cron automático no puede autenticarse. «Procesar ahora» sí anda.' })
  if (!s.conexion) a.push({ nivel: 'error', texto: 'No hay cuenta de Google conectada.' })
  else {
    if (s.conexion.estado === 'vencida') a.push({ nivel: 'error', texto: 'El permiso de Google venció: hay que reconectar.' })
    if (s.conexion.last_error) a.push({ nivel: 'atencion', texto: `Último error: ${s.conexion.last_error}` })
    const lock = s.conexion.listado_cursor?.lock
    if (lock && !lockLibre(lock, s.ahora)) a.push({ nivel: 'info', texto: `Hay una corrida en curso (hasta ${lock.hasta.slice(11, 16)} UTC).` })
  }

  const nombres = new Set(s.carpetas.map((c) => norm(c.folder_nombre)))
  for (const esperada of CARPETAS_ESPERADAS) {
    if (!nombres.has(esperada)) a.push({ nivel: 'error', texto: `Falta la carpeta «${esperada}»: agregala en Carpetas. Sin ella no entra nada de ahí.` })
  }
  for (const c of s.carpetas) {
    if (!c.incluir_subcarpetas) a.push({ nivel: 'atencion', texto: `«${c.folder_nombre}» no incluye subcarpetas: lo que esté adentro de una subcarpeta no entra.` })
  }

  for (const p of s.procesando) {
    const min = p.updated_at ? Math.round((s.ahora.getTime() - Date.parse(p.updated_at)) / 60_000) : null
    if (min == null || min >= MINUTOS_TRABADO) {
      a.push({ nivel: 'atencion', texto: `«${p.nombre}» quedó en procesando${min != null ? ` hace ${min} min` : ''}: la próxima corrida lo vuelve a pendiente.` })
    }
  }

  const primero = [...s.pendientes].sort((x, y) => prioridad({ bytes: x.bytes, clasificacion: x.clasificacion, clasificacionForzada: x.clasificacion_forzada })
    - prioridad({ bytes: y.bytes, clasificacion: y.clasificacion, clasificacionForzada: y.clasificacion_forzada }))[0]
  if (primero) a.push({ nivel: 'info', texto: `${s.pendientes.length} pendiente(s). El próximo: «${primero.nombre}».` })
  return a
}
