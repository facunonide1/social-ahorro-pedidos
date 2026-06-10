/**
 * Tipos y constantes del módulo Gestión de Ofertas (`/admin/ofertas`).
 *
 * Mirror manual de las tablas `offers_gestion` y `offers_gestion_history`
 * (proyecto Supabase hrjxjbirajbsurobqdca). Estas tablas las comparte la app
 * cuponera; su RLS valida `current_user_role()` contra `public.users` (que no
 * es el modelo de roles del ERP), así que el módulo accede vía API routes con
 * admin client + gate de `requireAdminHubAccess`.
 */

// ============ ENTIDADES ============

/** Estado interno del flujo de trabajo de una oferta. */
export type OfertaEstadoInterno = 'nuevo' | 'modificado' | 'verificado' | 'sacar'

export type OfferGestion = {
  id: string
  nombre: string
  hoja: string | null
  subcategoria: string | null
  codigo_barra: string | null
  /** Texto libre de la oferta: "2x1", "35" (%/precio), "lleve 3 pague 2", etc. */
  oferta: string | null
  precio: number | null
  /** Campo legacy de la cuponera: a veces guarda una fecha de diseño. */
  precio_canva: string | null
  estado_interno: OfertaEstadoInterno | null
  en_folleto: boolean
  en_pantalla: boolean
  en_televisor: boolean
  /** Texto/fecha de cuándo se mandó por WhatsApp; null = sin enviar. */
  estado_wsp: string | null
  campana: string | null
  proveedor: string | null
  notas: string | null
  publicado_cuponera: boolean
  expires_at: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  updated_by: string | null
  updated_by_name: string | null
  eliminado: boolean
  eliminado_at: string | null
  eliminado_by: string | null
}

export type OfferHistory = {
  id: string
  offer_id: string
  campo_modificado: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
  modificado_by: string | null
  modificado_by_name: string | null
  modificado_at: string | null
}

// ============ ESTADOS INTERNOS ============

/** Orden del pipeline (kanban). `sacar` = marcada para retirar de la cartelera. */
export const OFERTA_ESTADOS_ORDER: OfertaEstadoInterno[] = [
  'nuevo',
  'modificado',
  'verificado',
  'sacar',
]

export const OFERTA_ESTADO_LABELS: Record<OfertaEstadoInterno, string> = {
  nuevo: 'Nuevo',
  modificado: 'Modificado',
  verificado: 'Verificado',
  sacar: 'Sacar',
}

/** Clases Tailwind para badges/columnas por estado. */
export const OFERTA_ESTADO_STYLES: Record<
  OfertaEstadoInterno,
  { badge: string; dot: string; col: string }
> = {
  nuevo: {
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    dot: 'bg-blue-500',
    col: 'border-t-blue-500',
  },
  modificado: {
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    dot: 'bg-amber-500',
    col: 'border-t-amber-500',
  },
  verificado: {
    badge:
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-500',
    col: 'border-t-emerald-500',
  },
  sacar: {
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    dot: 'bg-rose-500',
    col: 'border-t-rose-500',
  },
}

// ============ CANALES DE PUBLICACIÓN ============

/** Claves de canal: 4 booleanos + WhatsApp (texto/fecha). */
export type CanalKey =
  | 'en_folleto'
  | 'en_pantalla'
  | 'en_televisor'
  | 'publicado_cuponera'
  | 'estado_wsp'

export type CanalDef = {
  key: CanalKey
  label: string
  /** Etiqueta corta para chips/columnas. */
  corto: string
  /** Nombre del icono Lucide (resuelto en el render). */
  icon: string
  /** Color de acento del canal (clase de texto Tailwind). */
  color: string
  /** WhatsApp es de tipo texto/fecha; el resto son boolean. */
  tipo: 'bool' | 'texto'
}

export const CANALES: CanalDef[] = [
  { key: 'en_folleto', label: 'Folleto', corto: 'Folleto', icon: 'Newspaper', color: 'text-orange-500', tipo: 'bool' },
  { key: 'en_pantalla', label: 'Pantalla', corto: 'Pantalla', icon: 'MonitorSmartphone', color: 'text-sky-500', tipo: 'bool' },
  { key: 'en_televisor', label: 'Televisor', corto: 'TV', icon: 'Tv', color: 'text-violet-500', tipo: 'bool' },
  { key: 'publicado_cuponera', label: 'Cuponera', corto: 'Cuponera', icon: 'Ticket', color: 'text-fuchsia-500', tipo: 'bool' },
  { key: 'estado_wsp', label: 'WhatsApp', corto: 'WhatsApp', icon: 'MessageCircle', color: 'text-green-500', tipo: 'texto' },
]

/** True si la oferta está publicada en ese canal. */
export function enCanal(o: OfferGestion, key: CanalKey): boolean {
  if (key === 'estado_wsp') return Boolean(o.estado_wsp && o.estado_wsp.trim())
  return Boolean(o[key])
}

/** Cantidad de canales en los que está publicada. */
export function coberturaCanales(o: OfferGestion): number {
  return CANALES.reduce((n, c) => n + (enCanal(o, c.key) ? 1 : 0), 0)
}

// ============ HOJAS ============

export const HOJA_LABELS: Record<string, string> = {
  farmacia: 'Farmacia',
  perfumeria: 'Perfumería',
}

// ============ HELPERS ============

/**
 * Días hasta el vencimiento (negativo = ya vencida). null si no tiene fecha.
 */
export function diasParaVencer(expires_at: string | null): number | null {
  if (!expires_at) return null
  const ms = new Date(expires_at).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

/** Etiqueta amigable del valor de oferta ("2x1" tal cual, número → "−35%"). */
export function ofertaLabel(oferta: string | null): string {
  if (!oferta) return '—'
  const t = oferta.trim()
  if (/^\d{1,2}$/.test(t)) return `−${t}%`
  return t
}
