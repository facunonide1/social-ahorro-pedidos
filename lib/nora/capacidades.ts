/**
 * QUÉ PUEDE HACER NORA, LEÍDO DEL SISTEMA.
 *
 * ── POR QUÉ NO ES UN TEXTO ──────────────────────────────────────────────────
 *
 * Ya pasó dos veces que un párrafo escrito a mano envejeció y NORA terminó
 * mintiendo sobre sí misma: prometía cosas que ya no hacía y callaba cosas que
 * sí. Un texto no se entera de que se agregó una herramienta.
 *
 * Esto sale de dos fuentes que no se pueden desactualizar sin que se note:
 *
 *   · el catálogo de herramientas (`TODAS_HERRAMIENTAS`), que es lo que el
 *     modelo recibe de verdad; y
 *   · el estado del sistema, que se cuenta en la base cada vez.
 *
 * Y lo mismo del otro lado: **lo que NORA no puede afirmar** sale de mirar qué
 * datos faltan, no de una lista escrita.
 */

import { TODAS_HERRAMIENTAS, herramientasParaUsuario } from '@/lib/nora/herramientas'
import { puedeUsar } from '@/lib/ai/permisos-tools'
import type { AdminRole } from '@/lib/types/admin'
import type { PermisosCustom } from '@/lib/types/permisos'

export interface CapacidadPorSector {
  subapp: string
  total: number
  puede: number
  soloLectura: number
  escriben: number
}

export interface Capacidades {
  totalDeclaradas: number
  paraEsteUsuario: number
  porSector: CapacidadPorSector[]
  /** Las que existen y este rol NO puede usar. Es la otra mitad de la verdad. */
  negadasPorPermiso: number
}

export function capacidadesDe(rol: AdminRole, custom: PermisosCustom | null): Capacidades {
  const mias = herramientasParaUsuario(rol, custom, null)
  const idsMias = new Set(mias.map((h) => h.id))

  const sectores = new Map<string, CapacidadPorSector>()
  for (const h of TODAS_HERRAMIENTAS) {
    const k = h.subapp ?? 'general'
    const s = sectores.get(k) ?? { subapp: k, total: 0, puede: 0, soloLectura: 0, escriben: 0 }
    s.total++
    if (idsMias.has(h.id)) {
      s.puede++
      if (h.soloLectura) s.soloLectura++; else s.escriben++
    }
    sectores.set(k, s)
  }

  return {
    totalDeclaradas: TODAS_HERRAMIENTAS.length,
    paraEsteUsuario: mias.length,
    porSector: [...sectores.values()].sort((a, b) => b.total - a.total),
    negadasPorPermiso: TODAS_HERRAMIENTAS.length - mias.length,
  }
}

/**
 * El párrafo que NORA contesta cuando le preguntan qué puede hacer.
 *
 * Se arma con los números de arriba. Si mañana se agrega una herramienta, este
 * texto cambia solo; si se saca una, también.
 */
export function comoSePresenta(rol: AdminRole, c: Capacidades): string {
  const top = c.porSector.filter((s) => s.puede > 0).slice(0, 5).map((s) => s.subapp).join(', ')
  const partes = [
    `Con tu rol (${rol}) puedo ejecutar ${c.paraEsteUsuario} de las ${c.totalDeclaradas} cosas que sé hacer`,
    top ? `, sobre todo en ${top}` : '',
    '. ',
  ]
  if (c.negadasPorPermiso > 0) {
    partes.push(
      `Las otras ${c.negadasPorPermiso} existen pero tu rol no las habilita — no es que no sepa hacerlas: es que no te las puedo ejecutar a vos. `,
    )
  }
  partes.push('Todo lo que hago queda registrado con tu nombre y tu rol.')
  return partes.join('')
}

/** ¿Esta herramienta la puede usar este rol? Reusa el default-deny de v0.86. */
export function puedeEjecutar(toolId: string, rol: AdminRole, custom: PermisosCustom | null): boolean {
  return puedeUsar(toolId, { rol, permisosCustom: custom })
}
