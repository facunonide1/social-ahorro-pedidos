import { createAdminClient, createClient } from '@/lib/supabase/server'
import { puedeBajarA } from './clasificacion'
import type { Manifiesto, Participacion } from './tipos'

/**
 * Lo que un proyecto declara distinto de la pieza compartida.
 *
 * Sólo campos de instalación — la lista está en `clasificacion.ts` y el escritor
 * la usa para rechazar cualquier otra cosa.
 */
export interface Overrides {
  nombre?: string
  descripcion?: string
  /**
   * ruta → título de esta instalación, CORRIGIENDO la pieza.
   *
   * Es para cuando la pieza dice algo que está mal —para todos, no sólo acá—.
   * Un override así es deuda: tapa un defecto de la pieza mientras se arregla,
   * y el próximo negocio que la instale se come el mismo problema. Debería ser
   * temporal y casi siempre no lo es.
   */
  titulos?: Record<string, string>
  /**
   * ruta → cómo le dice ESTE negocio.
   *
   * Es la otra cosa, y hasta 1.5.0 estaban mezcladas en `titulos`. "Recartelado"
   * es el término del oficio y está bien; "Cartelería de precios" es como le
   * dice este equipo y también está bien. No es un defecto de la pieza: es
   * vocabulario, es legítimamente local, y no hay nada que arreglar aguas
   * arriba.
   *
   * Gana sobre `titulos` y sobre la pieza, y NO borra el término del oficio.
   */
  vocabulario?: Record<string, string>
  /** Rutas que este proyecto no muestra en el menú. */
  ocultas?: string[]
  /** clave del parámetro → valor de este proyecto. */
  configurable?: Record<string, unknown>
  /** clave de dimensión → valores de este proyecto. */
  dimensiones?: Record<string, string[]>
  /** clave de agente → ajustes de este proyecto. */
  agentes?: Record<
    string,
    {
      /** clave de acción → nivel. Sólo puede BAJAR respecto del pool. */
      participacion?: Record<string, Participacion>
      /** clave de acción → brecha observada en ESTE sistema. */
      brechas?: Record<string, string>
    }
  >
}

export interface VersionInstalacion {
  id: string
  instalacionId: string
  numero: number
  overrides: Overrides
  esActual: boolean
  motivo: string | null
  revierteA: string | null
  creadaAt: string
  autorId: string | null
}

interface Fila {
  id: string
  instalacion_id: string
  numero: number
  overrides: Overrides
  es_actual: boolean
  notas_cambio: string | null
  revierte_a: string | null
  created_at: string
  created_by: string | null
}

const aVersion = (f: Fila): VersionInstalacion => ({
  id: f.id,
  instalacionId: f.instalacion_id,
  numero: f.numero,
  overrides: f.overrides ?? {},
  esActual: f.es_actual,
  motivo: f.notas_cambio,
  revierteA: f.revierte_a,
  creadaAt: f.created_at,
  autorId: f.created_by,
})

export async function overridesActuales(instalacionId: string): Promise<VersionInstalacion | null> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_instalacion_versiones')
    .select('*')
    .eq('instalacion_id', instalacionId)
    .eq('es_actual', true)
    .maybeSingle()
  return data ? aVersion(data as unknown as Fila) : null
}

export async function historialInstalacion(
  instalacionId: string,
  opciones: { conAdmin?: boolean } = {},
): Promise<VersionInstalacion[]> {
  const sb = opciones.conAdmin ? createAdminClient() : createClient()
  const { data } = await sb
    .from('fab_instalacion_versiones')
    .select('*')
    .eq('instalacion_id', instalacionId)
    .order('numero', { ascending: false })
  return ((data ?? []) as unknown as Fila[]).map(aVersion)
}

/* ── Resolución ──────────────────────────────────────────────────────────── */

export type Origen = 'pool' | 'instalacion'

export interface ValorResuelto<T> {
  valor: T
  origen: Origen
}

/**
 * El manifiesto EFECTIVO de un proyecto: la pieza con lo suyo encima.
 *
 *   1 · el default que trae el pool
 *   2 · si la instalación declara un override, gana el override
 *   3 · si no dice nada, vale el default
 *
 * Devuelve también de dónde salió cada valor. Que el origen sea consultable no
 * es un lujo: sin eso, mirar una declaración no dice si lo que estás viendo es
 * de la pieza o una decisión de este negocio, y son cosas muy distintas a la
 * hora de cambiarla.
 */
export function resolver(
  delPool: Manifiesto,
  overrides: Overrides | null,
): { manifiesto: Manifiesto; origenes: Record<string, Origen> } {
  const m: Manifiesto = JSON.parse(JSON.stringify(delPool))
  const origenes: Record<string, Origen> = {}
  const o = overrides ?? {}

  const marcar = (campo: string, hayOverride: boolean) => {
    origenes[campo] = hayOverride ? 'instalacion' : 'pool'
  }

  marcar('nombre', o.nombre !== undefined)
  if (o.nombre !== undefined) m.nombre = o.nombre

  marcar('descripcion', o.descripcion !== undefined)
  if (o.descripcion !== undefined) m.descripcion = o.descripcion

  m.pantallas = m.pantallas.map((p) => {
    const delNegocio = o.vocabulario?.[p.ruta]
    const corregido = o.titulos?.[p.ruta]
    marcar(`pantallas.${p.ruta}.vocabulario`, delNegocio !== undefined)
    // El origen del título sólo dice `instalacion` si el override CAMBIA algo.
    // Un override idéntico a la pieza no es una decisión del negocio, y marcarlo
    // como tal hace que el portal afirme algo que no pasó.
    marcar(
      `pantallas.${p.ruta}.titulo`,
      corregido !== undefined && corregido !== p.titulo,
    )
    const oculta = o.ocultas?.includes(p.ruta)
    marcar(`pantallas.${p.ruta}.navegable`, oculta === true)
    return {
      ...p,
      // Orden: vocabulario del negocio → corrección de la pieza → la pieza.
      titulo: delNegocio ?? corregido ?? p.titulo,
      // El término del oficio no se pierde nunca. Es el punto entero de 1.5.0.
      titulo_de_oficio: p.titulo,
      nombre_en_el_negocio: delNegocio,
      navegable: oculta ? false : p.navegable,
    }
  })

  if (m.configurable) {
    m.configurable = m.configurable.map((c) => {
      const propio = o.configurable?.[c.clave]
      marcar(`configurable.${c.clave}`, propio !== undefined)
      return propio !== undefined ? { ...c, default: propio } : c
    })
  }

  if (m.dimensiones) {
    m.dimensiones = m.dimensiones.map((d) => {
      const propios = o.dimensiones?.[d.clave]
      marcar(`dimensiones.${d.clave}`, propios !== undefined)
      return propios ? { ...d, valores: propios } : d
    })
  }

  if (m.agentes) {
    m.agentes = m.agentes.map((ag) => {
      const propio = o.agentes?.[ag.clave]
      return {
        ...ag,
        acciones: ag.acciones.map((acc) => {
          const nivel = propio?.participacion?.[acc.clave]
          const brecha = propio?.brechas?.[acc.clave]
          marcar(`agentes.${ag.clave}.${acc.clave}.participacion`, nivel !== undefined)
          marcar(`agentes.${ag.clave}.${acc.clave}.brecha`, brecha !== undefined)
          return {
            ...acc,
            // El nivel sólo puede BAJAR. La validación está en el escritor; acá
            // se aplica lo que ya pasó por ella.
            participacion: nivel ?? acc.participacion,
            brecha: brecha ?? acc.brecha,
          }
        }),
      }
    })
  }

  return { manifiesto: m, origenes }
}

/* ── Validación de un override ───────────────────────────────────────────── */

export interface RechazoOverride {
  campo: string
  motivo: string
}

/**
 * Qué NO puede hacer un proyecto.
 *
 * Lo que rechaza acá es lo que separa "configurar una pieza" de "bifurcarla".
 */
export function validarOverrides(delPool: Manifiesto, o: Overrides): RechazoOverride[] {
  const out: RechazoOverride[] = []

  const rutas = new Set(delPool.pantallas.map((p) => p.ruta))
  for (const ruta of Object.keys(o.titulos ?? {})) {
    if (!rutas.has(ruta)) {
      out.push({ campo: `titulos.${ruta}`, motivo: 'La pieza no declara esa pantalla.' })
    }
  }
  for (const [ruta, titulo] of Object.entries(o.titulos ?? {})) {
    const p = delPool.pantallas.find((x) => x.ruta === ruta)
    if (p?.titulo_dinamico) {
      out.push({
        campo: `titulos.${ruta}`,
        motivo: 'Esa pantalla se titula con sus datos: una etiqueta fija le quitaría información.',
      })
    }
    if (!titulo.trim()) {
      out.push({ campo: `titulos.${ruta}`, motivo: 'Un título vacío deja la cabecera en blanco.' })
    }
  }
  // El vocabulario del negocio: mismas reglas que un título, más una propia.
  for (const [ruta, nombre] of Object.entries(o.vocabulario ?? {})) {
    const p = delPool.pantallas.find((x) => x.ruta === ruta)
    if (!p) {
      out.push({ campo: `vocabulario.${ruta}`, motivo: 'La pieza no declara esa pantalla.' })
      continue
    }
    if (p.titulo_dinamico) {
      out.push({
        campo: `vocabulario.${ruta}`,
        motivo: 'Esa pantalla se titula con sus datos: una etiqueta fija le quitaría información.',
      })
    }
    if (!nombre.trim()) {
      out.push({ campo: `vocabulario.${ruta}`, motivo: 'Un nombre vacío deja la cabecera en blanco.' })
    }
    if (nombre.trim() === p.titulo) {
      // No es un detalle de prolijidad: un override idéntico a la pieza hace que
      // el origen diga "decisión de este negocio" sobre algo que nadie decidió.
      out.push({
        campo: `vocabulario.${ruta}`,
        motivo: `Es idéntico al término del oficio ("${p.titulo}"). Un override que no cambia nada hace que el origen mienta: si acá se dice igual, no hace falta declararlo.`,
      })
    }
  }

  for (const ruta of o.ocultas ?? []) {
    if (!rutas.has(ruta)) out.push({ campo: `ocultas.${ruta}`, motivo: 'La pieza no declara esa pantalla.' })
  }

  const claves = new Set((delPool.configurable ?? []).map((c) => c.clave))
  for (const clave of Object.keys(o.configurable ?? {})) {
    if (!claves.has(clave)) {
      out.push({ campo: `configurable.${clave}`, motivo: 'La pieza no ofrece ese parámetro.' })
    }
  }

  const dims = new Set((delPool.dimensiones ?? []).map((d) => d.clave))
  for (const clave of Object.keys(o.dimensiones ?? {})) {
    if (!dims.has(clave)) {
      out.push({ campo: `dimensiones.${clave}`, motivo: 'La pieza no declara esa dimensión.' })
    }
  }

  for (const [claveAg, ajuste] of Object.entries(o.agentes ?? {})) {
    const ag = delPool.agentes?.find((x) => x.clave === claveAg)
    if (!ag) {
      out.push({ campo: `agentes.${claveAg}`, motivo: 'La pieza no aporta ese agente.' })
      continue
    }
    for (const [claveAcc, nivel] of Object.entries(ajuste.participacion ?? {})) {
      const acc = ag.acciones.find((x) => x.clave === claveAcc)
      if (!acc) {
        out.push({ campo: `agentes.${claveAg}.${claveAcc}`, motivo: 'El agente no tiene esa acción.' })
        continue
      }
      const r = puedeBajarA(acc.participacion, nivel)
      if (!r.ok) out.push({ campo: `agentes.${claveAg}.${claveAcc}`, motivo: r.motivo! })
    }
  }

  return out
}
