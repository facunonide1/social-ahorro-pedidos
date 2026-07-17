/**
 * Contrato genérico de HERRAMIENTA de NORA (N-01/N-02/N-07).
 *
 * Una herramienta = una quickAction ejecutable por chat. Slot-filling con datos
 * reales (queryOpciones), card de confirmación (armarConfirmacion) y ejecución
 * server-side (ejecutar), reusando los MISMOS endpoints/lógica que la UI. Los
 * permisos son los del usuario logueado — NORA nunca tiene poderes propios.
 */
import type { AdminRole } from '@/lib/types/admin'
import type { PermisoModulo, PermisoAccion, PermisosCustom } from '@/lib/types/permisos'

export type NoraCtx = {
  userId: string
  rol: AdminRole
  permisosCustom: PermisosCustom | null
  sucursalId: string | null
  esTodas: boolean
  /** Fecha de hoy (YYYY-MM-DD, zona AR) para resolver vencimientos/deadlines. */
  hoy?: string
}

export type Opcion = { valor: string; label: string; sub?: string }
export type Valores = Record<string, any>

export type Slot = {
  nombre: string
  tipo: 'opcion' | 'texto' | 'numero' | 'evidencia'
  descripcion: string
  /** Opciones REALES para pintar chips. Usa los valores ya cargados. */
  queryOpciones?: (adm: any, v: Valores, ctx: NoraCtx) => Promise<Opcion[]>
  /** Requerido salvo que esta condición diga lo contrario (ej. comprobante si origen≠cheque). */
  requeridoSi?: (v: Valores) => boolean
}

export type CampoConfirm = { label: string; valor: string }
export type Confirmacion = { titulo: string; campos: CampoConfirm[]; advertencias: string[] }
export type Resultado = { ok: boolean; texto: string; entidad_id?: string | null; error?: string }

export type Herramienta = {
  id: string
  nombre: string
  descripcion: string
  /** Sub-app dueña de la herramienta (acota qué ve el modelo según el contexto). */
  subapp?: string
  /** Permiso requerido (se filtra ANTES de mandar la herramienta al modelo). null = todos. */
  permiso: { modulo: PermisoModulo; accion: PermisoAccion } | null
  /** Read-only: responde sin card de confirmación. */
  soloLectura?: boolean
  /** Lectura que puede cruzar de sub-app (ej: consultar stock desde Compras). */
  lecturaGlobal?: boolean
  slots: Slot[]
  armarConfirmacion?: (adm: any, v: Valores, ctx: NoraCtx) => Promise<Confirmacion>
  ejecutar?: (adm: any, v: Valores, ctx: NoraCtx) => Promise<Resultado>
  /** Solo para soloLectura: responde con datos reales. */
  responder?: (adm: any, v: Valores, ctx: NoraCtx) => Promise<{ texto: string }>
}

/** Match de un hint de texto libre contra las opciones reales (por valor/label/sub). */
export function matchOpciones(opciones: Opcion[], hint: string | null | undefined): Opcion[] {
  if (!hint) return []
  const h = String(hint).toLowerCase().trim()
  if (!h) return []
  const exacto = opciones.filter((o) => o.valor.toLowerCase() === h)
  if (exacto.length) return exacto
  return opciones.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(h))
}
