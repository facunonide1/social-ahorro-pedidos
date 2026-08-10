import { createAdminClient, createClient } from '@/lib/supabase/server'
import { cortesPorCampo, diferenciasAbiertas } from './corte'
import { versionActual } from './versiones'
import { overridesActuales } from './overrides'

/**
 * QUE EL CERO NO MIENTA.
 *
 * La regla que manda acá: cuando algo da cero, hay que poder distinguir si es
 * cero porque está bien o cero porque no miró. Ningún indicador de la fábrica
 * puede ser ambiguo entre esas dos cosas.
 *
 * Antes de v0.64 el sistema tenía tres falsos ceros, y los tres se veían igual
 * de bien:
 *   · un pool en sombra sin pantallas cableadas: "0 diferencias"
 *   · un manifiesto inválido en sombra: "0 diferencias"  (corregido en v0.63)
 *   · un pool apagado: "0 diferencias"
 */

/** Nunca dos estados. Siempre tres. */
export type Veredicto = 'verificado_sin_diferencias' | 'verificado_con_diferencias' | 'no_verificado'

export interface CoberturaPool {
  clave: string
  veredicto: Veredicto
  /** Pantallas declaradas que un proyecto podría gobernar. */
  gobernables: number
  /** De ésas, cuántas consultaron al lector alguna vez. */
  verificadas: number
  /** Las que nunca preguntaron: nadie las miró. */
  sinVerificar: string[]
  diferencias: number
  /** Por qué no se verificó, cuando corresponde. */
  motivo?: string
  ultimaConsulta: string | null
}

/**
 * El estado real de verificación de un pool.
 *
 * "Gobernables" excluye las de título dinámico: su cabecera sale de los datos y
 * el lector no las toca, así que no tiene sentido contarlas como pendientes.
 */
export async function coberturaDe(
  proyectoId: string,
  clave: string,
  estadoLector: 'apagado' | 'sombra' | 'prendido',
  // Igual que en `historial`: por defecto lee con la sesión para que RLS mande
  // en el portal, y `conAdmin` deja correrlo desde un script. Un indicador que
  // sólo se puede mirar desde el navegador no se mira antes de un deploy.
  opciones: { conAdmin?: boolean } = {},
): Promise<CoberturaPool> {
  const sb = opciones.conAdmin ? createAdminClient() : createClient()

  const version = await versionActual(clave)
  const gobernables = (version?.manifiesto.pantallas ?? []).filter(
    (p) => !p.titulo_dinamico && !p.redirige_a && p.pertenencia !== 'prestada',
  )

  // Una diferencia registrada ANTES del último cambio de declaración puede
  // haber quedado resuelta por ese mismo cambio. Contarla igual sería la falsa
  // alarma que es el espejo del falso cero: decir que hay un problema cuando
  // ya se arregló entrena a ignorar el indicador igual que un cero mentiroso.
  const instalacionId = await idDeInstalacion(sb, proyectoId, clave)
  const propios = instalacionId ? await overridesActuales(instalacionId) : null
  const desde =
    [version?.creadaAt, propios?.creadaAt].filter(Boolean).sort().pop() ?? '1970-01-01T00:00:00Z'

  const [{ data: consultas }, { data: eventos }] = await Promise.all([
    sb
      .from('fab_lector_cobertura')
      .select('ruta, ultima_consulta')
      .eq('proyecto_id', proyectoId)
      .eq('pool_clave', clave),
    // Se traen TODAS y se filtran por el corte de su campo. Filtrar por fecha
    // en la consulta sería volver al corte por pool, que es el hallazgo 12.
    sb
      .from('fab_lector_eventos')
      .select('tipo, aspecto, detalle, ocurrido_at')
      .eq('proyecto_id', proyectoId)
      .eq('pool_clave', clave)
      .eq('tipo', 'diferencia'),
  ])

  // Sólo cuentan las consultas posteriores al último cambio: una pantalla que
  // preguntó antes de la corrección no verificó la declaración de ahora.
  const vistas = new Set(
    ((consultas ?? []) as { ruta: string; ultima_consulta: string }[])
      .filter((c) => c.ultima_consulta >= desde)
      .map((c) => c.ruta),
  )
  const sinVerificar = gobernables.filter((p) => !vistas.has(p.ruta)).map((p) => p.ruta)
  const cortes = await cortesPorCampo(clave)
  // Campos distintos en desacuerdo, no eventos registrados. Ver el comentario de
  // `diferenciasAbiertas`: contar eventos infla el número y un indicador inflado
  // se ignora igual de rápido que uno en cero.
  const abiertas = diferenciasAbiertas(
    (eventos ?? []) as { aspecto: string | null; detalle: unknown; ocurrido_at: string }[],
    cortes,
    desde,
  )
  const diferencias = abiertas.campos.size + abiertas.sinCampo
  const ultimaConsulta =
    ((consultas ?? []) as { ultima_consulta: string }[])
      .map((c) => c.ultima_consulta)
      .sort()
      .pop() ?? null

  const base = {
    clave,
    gobernables: gobernables.length,
    verificadas: gobernables.length - sinVerificar.length,
    sinVerificar,
    diferencias,
    ultimaConsulta,
  }

  // Un pool apagado no está "bien": está sin verificar. Es la distinción entera.
  if (estadoLector === 'apagado') {
    return { ...base, veredicto: 'no_verificado', motivo: 'El lector está apagado: no se comparó nada.' }
  }
  if (!version) {
    return { ...base, veredicto: 'no_verificado', motivo: 'El pool no tiene una versión actual.' }
  }
  if (gobernables.length === 0) {
    return { ...base, veredicto: 'no_verificado', motivo: 'La declaración no tiene pantallas gobernables.' }
  }
  if (base.verificadas === 0) {
    // DOS CEROS DISTINTOS, y hasta v0.70 decían lo mismo.
    //
    // "Nunca consultó nadie" es un pool que puede no estar cableado. "Consultó,
    // pero antes del último cambio de declaración" es un pool cableado cuya
    // verificación quedó vieja porque se republicó. El segundo se arregla
    // abriendo una pantalla; el primero, cableando.
    const consultoAlgunaVez = base.ultimaConsulta !== null
    return {
      ...base,
      veredicto: 'no_verificado',
      motivo: consultoAlgunaVez
        ? `Sus pantallas consultaron al lector, pero antes del último cambio de declaración (${desde.slice(0, 16).replace('T', ' ')}). Lo verificado quedó viejo: alcanza con abrir una pantalla.`
        : 'Ninguna de sus pantallas consultó al lector todavía. Puede ser que no estén cableadas, o que nadie las haya abierto.',
    }
  }
  if (diferencias > 0) return { ...base, veredicto: 'verificado_con_diferencias' }

  // Verificado de verdad, pero puede estar verificado A MEDIAS.
  return {
    ...base,
    veredicto: 'verificado_sin_diferencias',
    motivo:
      sinVerificar.length > 0
        ? `${sinVerificar.length} de ${gobernables.length} pantallas todavía no consultaron.`
        : undefined,
  }
}

/**
 * Desde cuándo cuenta lo que se registró.
 *
 * El último cambio de declaración —de la pieza o del proyecto— borra la
 * pizarra: un evento anterior puede haber quedado resuelto por ese cambio.
 * Todos los indicadores usan este mismo corte; si uno lo usara y otro no, el
 * panel se contradiría a sí mismo.
 */
export async function corteDe(proyectoId: string, clave: string): Promise<string> {
  const adm = createAdminClient()
  const version = await versionActual(clave)
  const instalacionId = await idDeInstalacion(adm, proyectoId, clave)
  const propios = instalacionId ? await overridesActuales(instalacionId) : null
  return [version?.creadaAt, propios?.creadaAt].filter(Boolean).sort().pop() ?? '1970-01-01T00:00:00Z'
}

/** El id de la instalación de un pool en un proyecto. */
async function idDeInstalacion(
  sb: ReturnType<typeof createClient> | ReturnType<typeof createAdminClient>,
  proyectoId: string,
  clave: string,
): Promise<string | null> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { id: string } | null)?.id ?? null
}

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  verificado_sin_diferencias: 'sin diferencias',
  verificado_con_diferencias: 'con diferencias',
  no_verificado: 'sin verificar',
}

export const VARIANTE_VEREDICTO: Record<Veredicto, 'success' | 'warning' | 'outline'> = {
  verificado_sin_diferencias: 'success',
  verificado_con_diferencias: 'warning',
  no_verificado: 'outline',
}

/**
 * Un pool en sombra que hace días no verifica nada es un problema, no un éxito.
 *
 * Sin esto, dejar algo en sombra y olvidarse se ve exactamente igual que
 * dejarlo en sombra y que ande todo bien.
 */
export function sombraCiega(c: CoberturaPool, estado: string, diasTolerancia = 2): string | null {
  if (estado !== 'sombra') return null
  if (c.verificadas === 0) {
    return 'Está en sombra y ninguna pantalla consultó todavía: no está verificando nada.'
  }
  if (!c.ultimaConsulta) return null
  const dias = (Date.now() - new Date(c.ultimaConsulta).getTime()) / 86_400_000
  if (dias > diasTolerancia) {
    return `Está en sombra y la última consulta fue hace ${Math.floor(dias)} días. Puede estar mirando poco.`
  }
  return null
}
