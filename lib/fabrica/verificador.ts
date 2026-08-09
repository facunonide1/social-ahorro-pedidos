import { createAdminClient } from '@/lib/supabase/server'
import { obtenerDefinicion } from './lector'
import { overridesActuales, resolver } from './overrides'
import { versionActual } from './versiones'
import { PROYECTO_SOCIAL_AHORRO } from './flag'

/**
 * VERIFICACIÓN PROVOCADA.
 *
 * Hasta v0.64 verificar dependía de que alguien navegara: Stock tenía 12
 * pantallas cableadas y 0 verificadas porque nadie las había abierto. El
 * indicador lo decía, pero no lo resolvía.
 *
 * Esto recorre las pantallas declaradas de un pool y le pregunta al lector qué
 * devolvería, sin que un humano abra nada.
 *
 * LO QUE NO PUEDE VERIFICAR, y hay que decirlo: qué título tiene la pantalla EN
 * SU CÓDIGO. Eso vive en un literal dentro del componente y sólo se conoce
 * cuando la pantalla se renderiza. Así que la verificación provocada contesta
 * "¿la declaración resuelve a algo usable?" y la verificación por navegación
 * contesta "¿coincide con lo que muestra la pantalla?". Son dos preguntas
 * distintas y ninguna reemplaza a la otra.
 */

export interface ResultadoPantalla {
  ruta: string
  /** Qué resolvería el lector para esta ruta. */
  declarado: string | null
  /** Si alguien la abrió alguna vez y quedó registrado. */
  vistaEnNavegacion: boolean
  problema: string | null
}

export interface ResultadoVerificacion {
  clave: string
  estadoLector: string
  declaradas: number
  /** Las que alguna vez consultaron al punto de contacto. */
  cableadas: number
  /** Las que la verificación provocada pudo resolver. */
  resueltas: number
  diferencias: number
  pantallas: ResultadoPantalla[]
  motivo: string | null
}

/**
 * Corre la verificación sobre un pool.
 *
 * Con el lector apagado no verifica: devuelve el motivo. Verificar un pool
 * apagado daría siempre "todo bien" sin haber preguntado nada, que es
 * exactamente el falso cero que v0.64 vino a sacar del sistema.
 */
export async function verificarPool(args: {
  proyectoId: string
  clave: string
  autorId?: string | null
  origen?: 'provocada' | 'navegacion'
}): Promise<ResultadoVerificacion> {
  const adm = createAdminClient()

  const { data: inst } = await adm
    .from('fab_instalaciones')
    .select('id, lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', args.proyectoId)
    .eq('fab_pools.clave', args.clave)
    .maybeSingle()
  const instalacion = inst as unknown as { id: string; lector: string } | null

  const version = await versionActual(args.clave)
  const propios = instalacion ? await overridesActuales(instalacion.id) : null
  const efectivo = version ? resolver(version.manifiesto, propios?.overrides ?? null).manifiesto : null

  const gobernables = (efectivo?.pantallas ?? []).filter(
    (p) => !p.titulo_dinamico && !p.redirige_a && p.pertenencia !== 'prestada',
  )

  const base: ResultadoVerificacion = {
    clave: args.clave,
    estadoLector: instalacion?.lector ?? 'apagado',
    declaradas: gobernables.length,
    cableadas: 0,
    resueltas: 0,
    diferencias: 0,
    pantallas: [],
    motivo: null,
  }

  if (!instalacion) return { ...base, motivo: 'Ese pool no está instalado en este proyecto.' }
  if (instalacion.lector === 'apagado') {
    return {
      ...base,
      motivo: 'El lector está apagado: no hay nada que verificar. Un pool apagado no está bien, está sin verificar.',
    }
  }
  if (!efectivo) return { ...base, motivo: 'El pool no tiene una versión actual.' }

  // Qué pantallas consultaron alguna vez al punto de contacto.
  const { data: cobertura } = await adm
    .from('fab_lector_cobertura')
    .select('ruta')
    .eq('proyecto_id', args.proyectoId)
    .eq('pool_clave', args.clave)
  const vistas = new Set(((cobertura ?? []) as { ruta: string }[]).map((c) => c.ruta))

  // Qué resolvería la declaración. Se toma del manifiesto EFECTIVO y no de
  // `obtenerDefinicion`, porque en sombra el lector devuelve null a propósito —
  // y usar eso daría "0 resueltas" en un pool cuya declaración está perfecta.
  // Otro cero que miente, en un lugar nuevo.
  const definicion = Object.fromEntries(gobernables.map((p) => [p.ruta, p.titulo]))

  // Con el lector prendido se comprueba además que el camino real lo entregue:
  // que la declaración resuelva no garantiza que el lector la esté sirviendo.
  const delLector = instalacion.lector === 'prendido'
    ? ((await obtenerDefinicion(args.clave, 'pantallas')) as { titulos: Record<string, string> } | null)
        ?.titulos ?? null
    : null

  const pantallas: ResultadoPantalla[] = gobernables.map((p) => {
    const declarado = definicion[p.ruta] ?? null
    let problema: string | null = null
    if (!declarado || !declarado.trim()) {
      problema = 'La declaración no resuelve un título usable para esta pantalla.'
    } else if (delLector && delLector[p.ruta] === undefined) {
      problema = 'El lector gobierna y no la entrega: esta pantalla va a caer al código.'
    } else if (!vistas.has(p.ruta)) {
      problema = 'Nunca consultó al punto de contacto: puede no estar cableada.'
    }
    return { ruta: p.ruta, declarado, vistaEnNavegacion: vistas.has(p.ruta), problema }
  })

  const resultado: ResultadoVerificacion = {
    ...base,
    cableadas: pantallas.filter((p) => p.vistaEnNavegacion).length,
    resueltas: pantallas.filter((p) => p.declarado !== null).length,
    diferencias: pantallas.filter((p) => p.problema !== null).length,
    pantallas,
    // Qué NO puede verificar esto, dicho: el título que la pantalla tiene en su
    // código vive en un literal del componente y sólo se conoce al renderizar.
    // La verificación provocada contesta "¿la declaración resuelve?"; la de
    // navegación contesta "¿coincide con lo que muestra?". Ninguna reemplaza a
    // la otra y decir que sí sería el error de siempre.
    motivo:
      'Verifica que la declaración resuelva y que el lector la entregue. Si coincide con el texto del código sólo se sabe cuando alguien abre la pantalla.',
  }

  await adm.from('fab_verificaciones').insert({
    proyecto_id: args.proyectoId,
    pool_clave: args.clave,
    origen: args.origen ?? 'provocada',
    pantallas_declaradas: resultado.declaradas,
    pantallas_verificadas: resultado.resueltas,
    diferencias: resultado.diferencias,
    detalle: resultado.pantallas as unknown as Record<string, unknown>[],
    corrida_por: args.autorId ?? null,
  })

  return resultado
}

export interface UltimaVerificacion {
  clave: string
  corridaAt: string | null
  diferencias: number
  declaradas: number
  verificadas: number
  origen: string | null
  /** Hace cuántos días. null si nunca corrió. */
  dias: number | null
}

/**
 * Cuándo se verificó cada pool por última vez.
 *
 * Un pool en sombra hace días sin verificar nada tiene que aparecer como
 * problema, no como éxito: dejar algo en sombra y olvidarse se ve idéntico a
 * dejarlo en sombra y que ande todo bien.
 */
export async function ultimasVerificaciones(proyectoId: string): Promise<Map<string, UltimaVerificacion>> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_verificaciones')
    .select('pool_clave, corrida_at, diferencias, pantallas_declaradas, pantallas_verificadas, origen')
    .eq('proyecto_id', proyectoId)
    .order('corrida_at', { ascending: false })

  const out = new Map<string, UltimaVerificacion>()
  for (const f of (data ?? []) as {
    pool_clave: string
    corrida_at: string
    diferencias: number
    pantallas_declaradas: number
    pantallas_verificadas: number
    origen: string
  }[]) {
    if (out.has(f.pool_clave)) continue
    out.set(f.pool_clave, {
      clave: f.pool_clave,
      corridaAt: f.corrida_at,
      diferencias: f.diferencias,
      declaradas: f.pantallas_declaradas,
      verificadas: f.pantallas_verificadas,
      origen: f.origen,
      dias: Math.floor((Date.now() - new Date(f.corrida_at).getTime()) / 86_400_000),
    })
  }
  return out
}

/**
 * Chequeo perezoso: verifica lo que haga falta cuando alguien abre el portal.
 *
 * No hay cron. El plan del entorno no da crons finos y ya se aprendió en este
 * proyecto que simular que algo corre solo es peor que decir cuándo corre. Esto
 * corre al abrir el Taller, y se declara así en la pantalla.
 */
export async function verificarLoQueHagaFalta(
  proyectoId: string,
  horas = 24,
): Promise<string[]> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .neq('lector', 'apagado')

  const activos = ((data ?? []) as unknown as { lector: string; pool: { clave: string } }[]).map(
    (x) => x.pool.clave,
  )
  const ultimas = await ultimasVerificaciones(proyectoId)
  const corridos: string[] = []

  for (const clave of activos) {
    const u = ultimas.get(clave)
    const vieja = !u?.corridaAt || Date.now() - new Date(u.corridaAt).getTime() > horas * 3_600_000
    if (!vieja) continue
    await verificarPool({ proyectoId, clave, origen: 'provocada' })
    corridos.push(clave)
  }
  return corridos
}

export const PROYECTO_POR_DEFECTO = PROYECTO_SOCIAL_AHORRO
