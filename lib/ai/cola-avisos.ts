/**
 * AVISOS DE NORA EN LOTE.
 *
 * `emitirAviso` hace un SELECT (¿ya está pendiente?) y un INSERT por aviso. Para
 * un aviso suelto está bien; el auditor diario emite decenas y eso son decenas
 * de idas y vueltas en serie dentro de un cron con tope. La cola junta los
 * avisos de la corrida y al final revisa las claves de a 50 e inserta de a 200
 * (lib/avisos/dedup), leyendo los errores.
 */
import { clavesYaPendientes, insertarEnTandas } from '@/lib/avisos/dedup'

type Adm = { from: (t: string) => any }

export type AvisoNora = {
  tipo: string; severidad?: 'info' | 'sugerencia' | 'alerta' | 'critico'; titulo: string; detalle?: string
  modulo?: string; sucursalId?: string | null; accionLabel?: string; accionHref?: string
  accionTool?: string; accionParams?: any; entidadRef?: any; claveDedup?: string; esDemo?: boolean
}

export function filaDeAviso(a: AvisoNora) {
  return {
    tipo: a.tipo, severidad: a.severidad ?? 'sugerencia', titulo: a.titulo, detalle: a.detalle ?? null,
    modulo: a.modulo ?? null, sucursal_id: a.sucursalId ?? null,
    accion_label: a.accionLabel ?? null, accion_href: a.accionHref ?? null,
    accion_tool: a.accionTool ?? null, accion_params: a.accionParams ?? null,
    entidad_ref: a.entidadRef ?? null, clave_dedup: a.claveDedup ?? null, estado: 'pendiente',
    es_demo: a.esDemo ?? false,
  }
}

export function colaDeAvisos() {
  const avisos: AvisoNora[] = []
  return {
    agregar(a: AvisoNora) { avisos.push(a) },
    get cantidad() { return avisos.length },
    /** Publica lo que no está pendiente ni repetido en la cola. Devuelve cuántos entraron. */
    async vaciar(adm: Adm): Promise<number> {
      const ya = await clavesYaPendientes(adm, avisos.map((a) => a.claveDedup ?? '').filter(Boolean))
      const vistas = new Set<string>()
      const nuevos = avisos.filter((a) => {
        if (!a.claveDedup) return true
        if (ya.has(a.claveDedup) || vistas.has(a.claveDedup)) return false
        vistas.add(a.claveDedup)
        return true
      })
      return insertarEnTandas(adm, 'nora_avisos', nuevos.map(filaDeAviso))
    },
  }
}
