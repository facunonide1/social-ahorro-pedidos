import { createAdminClient } from '@/lib/supabase/server'
import type { Manifiesto } from './tipos'
import type { Overrides } from './overrides'

/**
 * LA PROCEDENCIA DE CADA VALOR DECLARADO.
 *
 * NORA lo pidió textual en v0.66: "¿sabés quién lo revirtió y por qué?".
 *
 * Podía ver que un título se había cambiado y revertido dos veces —lo leía de
 * la cola de propuestas— pero no por qué: la nota de decisión vive en la
 * propuesta, y la propuesta expira. El valor sobrevive; el motivo no.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 * Todo valor tiene procedencia. Si no se sabe cuál, la procedencia es "de la
 * declaración inicial", que es una respuesta y no un hueco. Dejarlo vacío hace
 * que "no sé de dónde salió" y "nadie lo tocó nunca" se vean igual, y son
 * cosas distintas: la primera es una laguna, la segunda es un dato.
 */

export interface Procedencia {
  campo: string
  nivel: 'pool' | 'instalacion'
  valorAnterior: unknown
  valorNuevo: unknown
  motivo: string
  propuestaId: string | null
  esReversion: boolean
  decididoPor: string | null
  decididoAt: string
}

interface Fila {
  campo: string
  nivel: 'pool' | 'instalacion'
  valor_anterior: unknown
  valor_nuevo: unknown
  motivo: string
  propuesta_id: string | null
  es_reversion: boolean
  decidido_por: string | null
  decidido_at: string
}

const aProcedencia = (f: Fila): Procedencia => ({
  campo: f.campo,
  nivel: f.nivel,
  valorAnterior: f.valor_anterior,
  valorNuevo: f.valor_nuevo,
  motivo: f.motivo,
  propuestaId: f.propuesta_id,
  esReversion: f.es_reversion,
  decididoPor: f.decidido_por,
  decididoAt: f.decidido_at,
})

/** El motivo que se guarda cuando el valor viene del arranque y no de una decisión. */
export const DECLARACION_INICIAL = 'De la declaración inicial: nadie lo cambió desde que se escribió la pieza.'

/* ── Escribir ────────────────────────────────────────────────────────────── */

export interface CambioDeCampo {
  campo: string
  anterior: unknown
  nuevo: unknown
}

/**
 * Deja constancia de quién decidió qué.
 *
 * NUNCA LANZA. Si el registro de procedencia falla, el valor ya se escribió y
 * la pantalla ya cambió: tirar un error acá dejaría al usuario creyendo que su
 * cambio no se aplicó cuando sí se aplicó, que es peor que perder una línea de
 * historia.
 */
export async function registrarProcedencia(args: {
  nivel: 'pool' | 'instalacion'
  poolClave: string
  proyectoId?: string | null
  cambios: CambioDeCampo[]
  motivo: string
  versionId?: string | null
  propuestaId?: string | null
  esReversion?: boolean
  autorId: string | null
  /**
   * Cuándo se decidió. Sólo lo pasa la migración, con la fecha de la versión
   * que hizo el cambio: una historia reconstruida con la fecha de hoy dice que
   * todo pasó en el mismo minuto, y una historia con fechas falsas es peor que
   * no tenerla — se lee como si nadie hubiera esperado nada entre un cambio y
   * el siguiente.
   */
  decididoAt?: string
}): Promise<number> {
  if (args.cambios.length === 0) return 0
  try {
    const adm = createAdminClient()
    const { data: pool } = await adm
      .from('fab_pools')
      .select('id')
      .eq('clave', args.poolClave)
      .maybeSingle()
    const poolId = (pool as { id: string } | null)?.id
    if (!poolId) return 0

    const filas = args.cambios.map((c) => ({
      nivel: args.nivel,
      pool_id: poolId,
      proyecto_id: args.nivel === 'instalacion' ? (args.proyectoId ?? null) : null,
      campo: c.campo,
      valor_anterior: c.anterior ?? null,
      valor_nuevo: c.nuevo ?? null,
      motivo: args.motivo,
      version_id: args.versionId ?? null,
      propuesta_id: args.propuestaId ?? null,
      es_reversion: args.esReversion ?? false,
      decidido_por: args.autorId,
      ...(args.decididoAt ? { decidido_at: args.decididoAt } : {}),
    }))
    const { error } = await adm.from('fab_procedencia').insert(filas)
    return error ? 0 : filas.length
  } catch {
    return 0
  }
}

/* ── Qué cambió: el diff campo por campo ─────────────────────────────────── */

/**
 * Los campos que cambian entre dos juegos de overrides.
 *
 * Se compara por VALOR y no por presencia de la clave: un override que se
 * agrega con el mismo valor que ya tenía no es un cambio, y contarlo como tal
 * llenaría la historia de decisiones que nadie tomó — el mismo problema que
 * los cuatro overrides de ruido de v0.67.
 */
export function camposQueCambian(antes: Overrides | null, ahora: Overrides): CambioDeCampo[] {
  const out: CambioDeCampo[] = []
  const a = antes ?? {}

  const mapa = (o: Overrides, k: 'titulos' | 'vocabulario' | 'configurable' | 'dimensiones') =>
    (o[k] ?? {}) as Record<string, unknown>

  for (const clave of ['titulos', 'vocabulario', 'configurable', 'dimensiones'] as const) {
    const antesM = mapa(a, clave)
    const ahoraM = mapa(ahora, clave)
    for (const k of new Set([...Object.keys(antesM), ...Object.keys(ahoraM)])) {
      const x = antesM[k]
      const y = ahoraM[k]
      if (JSON.stringify(x) !== JSON.stringify(y)) {
        const campo =
          clave === 'titulos'
            ? `pantallas.${k}.titulo`
            : clave === 'vocabulario'
              ? `pantallas.${k}.vocabulario`
              : `${clave}.${k}`
        out.push({ campo, anterior: x ?? null, nuevo: y ?? null })
      }
    }
  }

  const ocultasAntes = new Set(a.ocultas ?? [])
  const ocultasAhora = new Set(ahora.ocultas ?? [])
  for (const r of new Set([...ocultasAntes, ...ocultasAhora])) {
    if (ocultasAntes.has(r) !== ocultasAhora.has(r)) {
      out.push({
        campo: `pantallas.${r}.navegable`,
        anterior: !ocultasAntes.has(r),
        nuevo: !ocultasAhora.has(r),
      })
    }
  }

  for (const k of ['nombre', 'descripcion'] as const) {
    if (a[k] !== ahora[k]) out.push({ campo: k, anterior: a[k] ?? null, nuevo: ahora[k] ?? null })
  }

  return out
}

/** Lo mismo, entre dos manifiestos de pieza. */
export function camposQueCambianEnLaPieza(antes: Manifiesto, ahora: Manifiesto): CambioDeCampo[] {
  const out: CambioDeCampo[] = []
  const porRuta = new Map(antes.pantallas.map((p) => [p.ruta, p]))

  for (const p of ahora.pantallas) {
    const x = porRuta.get(p.ruta)
    if (!x) {
      out.push({ campo: `pantallas.${p.ruta}`, anterior: null, nuevo: p.titulo })
      continue
    }
    if (x.titulo !== p.titulo) {
      out.push({ campo: `pantallas.${p.ruta}.titulo`, anterior: x.titulo, nuevo: p.titulo })
    }
  }
  for (const [ruta, p] of porRuta) {
    if (!ahora.pantallas.some((x) => x.ruta === ruta)) {
      out.push({ campo: `pantallas.${ruta}`, anterior: p.titulo, nuevo: null })
    }
  }

  const confAntes = new Map((antes.configurable ?? []).map((c) => [c.clave, c.default]))
  for (const c of ahora.configurable ?? []) {
    const x = confAntes.get(c.clave)
    if (JSON.stringify(x) !== JSON.stringify(c.default)) {
      out.push({ campo: `configurable.${c.clave}`, anterior: x ?? null, nuevo: c.default ?? null })
    }
  }

  if (antes.nombre !== ahora.nombre) {
    out.push({ campo: 'nombre', anterior: antes.nombre, nuevo: ahora.nombre })
  }

  return out
}

/* ── Leer ────────────────────────────────────────────────────────────────── */

/**
 * La procedencia de cada campo de un pool en un proyecto.
 *
 * Devuelve la fila MÁS RECIENTE por campo, mezclando pieza e instalación: gana
 * la de instalación cuando existe, igual que gana el override. Preguntar "¿por
 * qué este valor está así?" tiene que contestar sobre el valor que se ve, no
 * sobre el que quedó tapado.
 */
export async function procedenciaDe(
  poolClave: string,
  proyectoId: string,
): Promise<Map<string, Procedencia>> {
  const salida = new Map<string, Procedencia>()
  try {
    const adm = createAdminClient()
    const { data: pool } = await adm.from('fab_pools').select('id').eq('clave', poolClave).maybeSingle()
    const poolId = (pool as { id: string } | null)?.id
    if (!poolId) return salida

    const { data } = await adm
      .from('fab_procedencia')
      .select('*')
      .eq('pool_id', poolId)
      .or(`proyecto_id.eq.${proyectoId},proyecto_id.is.null`)
      .order('decidido_at', { ascending: true })
      .limit(2000)

    // Se recorre de vieja a nueva y se pisa: la última que quede es la más
    // reciente. Y la de instalación pisa a la de pieza porque se consulta
    // después del orden temporal sólo si es más nueva... no: gana el nivel.
    for (const f of (data ?? []) as unknown as Fila[]) {
      const previa = salida.get(f.campo)
      if (previa && previa.nivel === 'instalacion' && f.nivel === 'pool') continue
      salida.set(f.campo, aProcedencia(f))
    }
  } catch {
    // Sin procedencia, el portal muestra "no registrada". No rompe nada.
  }
  return salida
}

/**
 * La historia completa de un campo, de la más nueva a la más vieja.
 *
 * Es lo que el chat mira antes de proponer sobre algo que ya se tocó: "esto se
 * cambió y se revirtió dos veces" es la diferencia entre una propuesta útil y
 * hacerle perder el tiempo a quien firma por tercera vez.
 */
export async function historialDeCampo(
  poolClave: string,
  campo: string,
  proyectoId?: string,
): Promise<Procedencia[]> {
  try {
    const adm = createAdminClient()
    const { data: pool } = await adm.from('fab_pools').select('id').eq('clave', poolClave).maybeSingle()
    const poolId = (pool as { id: string } | null)?.id
    if (!poolId) return []

    let q = adm.from('fab_procedencia').select('*').eq('pool_id', poolId).eq('campo', campo)
    if (proyectoId) q = q.or(`proyecto_id.eq.${proyectoId},proyecto_id.is.null`)
    const { data } = await q.order('decidido_at', { ascending: false }).limit(50)
    return ((data ?? []) as unknown as Fila[]).map(aProcedencia)
  } catch {
    return []
  }
}

/**
 * Los campos de un proyecto que ya se cambiaron y se dieron para atrás.
 *
 * Se cuenta con `es_reversion`, no interpretando el texto del motivo: un
 * contador que depende de cómo alguien redactó una nota es un contador que
 * cambia de valor cuando alguien escribe distinto.
 */
export async function camposConHistoriaDificil(
  proyectoId: string,
): Promise<{ campo: string; poolClave: string; reversiones: number }[]> {
  try {
    const adm = createAdminClient()
    const { data } = await adm
      .from('fab_procedencia')
      .select('campo, es_reversion, pool:fab_pools(clave)')
      .eq('proyecto_id', proyectoId)
      .eq('es_reversion', true)
      .limit(500)

    const cuenta = new Map<string, { campo: string; poolClave: string; reversiones: number }>()
    for (const f of (data ?? []) as unknown as { campo: string; pool: { clave: string } | null }[]) {
      const clave = `${f.pool?.clave ?? '?'}|${f.campo}`
      const x = cuenta.get(clave) ?? { campo: f.campo, poolClave: f.pool?.clave ?? '?', reversiones: 0 }
      x.reversiones++
      cuenta.set(clave, x)
    }
    return [...cuenta.values()].sort((a, b) => b.reversiones - a.reversiones)
  } catch {
    return []
  }
}
