/**
 * EL ESTADO DEL LISTADO Y EL LOCK DE LA INGESTA, SIN COLUMNAS NUEVAS.
 *
 * Todo vive en `integraciones_google_drive.listado_cursor` (jsonb, 0294):
 *
 *   tareas        la cola BFS de carpetas por listar (como antes)
 *   desdePorRaiz  durante un listado: desde cuándo traer en cada carpeta raíz
 *   inicio        cuándo arrancó ese listado
 *   porCarpeta    al terminar un listado: folderId → `inicio` de ese listado
 *   lock          { corrida, hasta }: quién está corriendo y hasta cuándo vale
 *
 * ── POR QUÉ UNA FECHA POR CARPETA ───────────────────────────────────────────
 *
 * Antes había una sola (`last_sync_at`, el fin del último listado completo).
 * Una carpeta agregada después tenía todos sus archivos «más viejos» que esa
 * fecha y quedaban filtrados para siempre. Una carpeta que nunca se listó
 * entera arranca en null: trae todo. Se guarda el INICIO del listado, no el
 * fin, para no perder lo que se modificó mientras se listaba.
 *
 * ── EL LOCK ─────────────────────────────────────────────────────────────────
 *
 * El cron y «Procesar ahora» se podían cruzar y procesar el mismo archivo dos
 * veces. Una corrida toma el lock con un UPDATE condicionado a que esté libre
 * o vencido; si no lo consigue, sale sin hacer nada. Vence solo a los
 * LOCK_MS: una función de 60 s que murió a la mitad no lo deja tomado.
 */
import type { TareaCarpeta } from './recorrer'
import { tareasIniciales } from './recorrer'

export const LOCK_MS = 2 * 60_000

export type Lock = { corrida: string; hasta: string }

export type Cursor = {
  tareas?: TareaCarpeta[]
  /** Formato viejo: una sola fecha para todas las carpetas. */
  desde?: string | null
  desdePorRaiz?: Record<string, string | null>
  inicio?: string | null
  porCarpeta?: Record<string, string>
  lock?: Lock | null
}

export type CarpetaConfig = { folder_id: string; folder_nombre: string; incluir_subcarpetas: boolean }

/** Lo que hay que listar en esta corrida: sigue el listado en curso o arranca otro. */
export function planDeListado(cursor: Cursor | null | undefined, carpetas: CarpetaConfig[], ahoraIso: string): {
  tareas: TareaCarpeta[]
  desdePorRaiz: Record<string, string | null>
  inicio: string
  nuevo: boolean
} {
  const c = cursor ?? {}
  const enCurso = Array.isArray(c.tareas) && c.tareas.length > 0
  if (enCurso && c.desdePorRaiz && c.inicio) {
    // Una carpeta que se agregó en medio de un listado entra en el próximo.
    return { tareas: c.tareas!, desdePorRaiz: c.desdePorRaiz, inicio: c.inicio, nuevo: false }
  }
  if (enCurso) {
    // Listado en curso con el formato viejo: se termina con su fecha única.
    const desde = c.desde ?? null
    const desdePorRaiz = Object.fromEntries(c.tareas!.map((t) => [t.raizId, desde]))
    return { tareas: c.tareas!, desdePorRaiz, inicio: c.inicio ?? ahoraIso, nuevo: false }
  }
  const porCarpeta = c.porCarpeta ?? {}
  return {
    tareas: tareasIniciales(carpetas.map((x) => ({
      folderId: x.folder_id, folderNombre: x.folder_nombre, incluirSubcarpetas: x.incluir_subcarpetas !== false,
    }))),
    // Sin fecha propia = nunca se listó entera = se trae todo.
    desdePorRaiz: Object.fromEntries(carpetas.map((x) => [x.folder_id, porCarpeta[x.folder_id] ?? null])),
    inicio: ahoraIso,
    nuevo: true,
  }
}

/** El cursor después de una tanda de listado. Conserva el lock. */
export function cursorTrasListar(cursor: Cursor | null | undefined, plan: {
  tareas: TareaCarpeta[]; desdePorRaiz: Record<string, string | null>; inicio: string
}): { cursor: Cursor; completo: boolean } {
  const c = cursor ?? {}
  const completo = plan.tareas.length === 0
  if (!completo) {
    return { cursor: { ...c, tareas: plan.tareas, desde: undefined, desdePorRaiz: plan.desdePorRaiz, inicio: plan.inicio }, completo }
  }
  const porCarpeta = { ...(c.porCarpeta ?? {}) }
  for (const raiz of Object.keys(plan.desdePorRaiz)) porCarpeta[raiz] = plan.inicio
  return { cursor: { porCarpeta, lock: c.lock ?? null, tareas: [] }, completo }
}

/** ¿El lock está libre (no hay, o venció)? */
export function lockLibre(lock: Lock | null | undefined, ahora: Date): boolean {
  return !lock || !lock.hasta || Date.parse(lock.hasta) <= ahora.getTime()
}

export function nuevoLock(corrida: string, ahora: Date, ms = LOCK_MS): Lock {
  return { corrida, hasta: new Date(ahora.getTime() + ms).toISOString() }
}
