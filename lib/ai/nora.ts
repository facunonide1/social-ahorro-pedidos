/**
 * Núcleo NORA (v0.30) — capa "hace" + config + feed. Server-only.
 *
 * Las 3 capas:
 *  - EXPLICA: lee y traduce (las tools de lectura, NoraCards). Sin riesgo.
 *  - SUGIERE: propone en el feed (nora_avisos), el dueño aprueba.
 *  - HACE: ejecuta acciones REVERSIBLES y REGISTRADAS (nora_acciones). Por
 *    defecto pide confirmación; el dueño habilita modo 'auto' por acción.
 */
import { puede, type PermisoModulo, type PermisoAccion, type PermisosCustom } from '@/lib/types/permisos'
import { metaDe } from '@/lib/ai/tool-meta'
import type { AdminRole } from '@/lib/types/admin'

type Adm = any

export type NoraConfig = { accion: string; modo: 'confirmar' | 'auto'; habilitada: boolean; descripcion: string | null }

/** ¿NORA puede ejecutar esta acción SOLA (sin confirmar)? Default: no. */
export async function modoDeAccion(adm: Adm, accion: string): Promise<'confirmar' | 'auto' | 'deshabilitada'> {
  const { data } = await adm.from('nora_config').select('modo, habilitada').eq('accion', accion).maybeSingle()
  if (!data) return 'confirmar'
  if (!data.habilitada) return 'deshabilitada'
  return data.modo === 'auto' ? 'auto' : 'confirmar'
}

/** ¿El usuario (rol+permisos) tiene permiso para que NORA haga esta tool? */
export function usuarioPermiteTool(tool: string, rol: AdminRole, custom: PermisosCustom | null): boolean {
  const m = metaDe(tool)
  const accion: PermisoAccion = m.accion ?? (m.capa === 'accion' ? 'crear' : 'ver')
  return puede(rol, custom, m.modulo, accion)
}

/** Registra una acción de NORA en la auditoría (nora_acciones). */
export async function registrarAccion(adm: Adm, a: {
  tool: string; descripcion: string; modulo?: string; parametros?: any; resultado?: any
  reversible?: boolean; revertRef?: any; usuarioId?: string | null; usuarioNombre?: string | null
  autonoma?: boolean; esDemo?: boolean
}): Promise<string | null> {
  const { data } = await adm.from('nora_acciones').insert({
    tool: a.tool, descripcion: a.descripcion, modulo: a.modulo ?? null,
    parametros: a.parametros ?? {}, resultado: a.resultado ?? {},
    reversible: a.reversible ?? false, estado: 'ejecutada', revert_ref: a.revertRef ?? null,
    por_usuario: a.usuarioId ?? null, por_usuario_nombre: a.usuarioNombre ?? null,
    autonoma: a.autonoma ?? false, es_demo: a.esDemo ?? false,
  }).select('id').maybeSingle()
  return data?.id ?? null
}

/** Emite un aviso/sugerencia al feed de NORA (dedup por clave). */
export async function emitirAviso(adm: Adm, a: {
  tipo: string; severidad?: 'info' | 'sugerencia' | 'alerta' | 'critico'; titulo: string; detalle?: string
  modulo?: string; sucursalId?: string | null; accionLabel?: string; accionHref?: string
  accionTool?: string; accionParams?: any; entidadRef?: any; claveDedup?: string; esDemo?: boolean
}): Promise<void> {
  // dedup: si ya hay un aviso pendiente con esa clave, no repetir
  if (a.claveDedup) {
    const { data: ya } = await adm.from('nora_avisos').select('id').eq('clave_dedup', a.claveDedup).eq('estado', 'pendiente').maybeSingle()
    if (ya) return
  }
  await adm.from('nora_avisos').insert({
    tipo: a.tipo, severidad: a.severidad ?? 'sugerencia', titulo: a.titulo, detalle: a.detalle ?? null,
    modulo: a.modulo ?? null, sucursal_id: a.sucursalId ?? null,
    accion_label: a.accionLabel ?? null, accion_href: a.accionHref ?? null,
    accion_tool: a.accionTool ?? null, accion_params: a.accionParams ?? null,
    entidad_ref: a.entidadRef ?? null, clave_dedup: a.claveDedup ?? null, estado: 'pendiente',
    es_demo: a.esDemo ?? false,
  })
}
