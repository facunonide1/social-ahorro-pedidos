import { createAdminClient } from '@/lib/supabase/server'
import { artefactosVisibles } from './prueba'

/**
 * EL CORTE, POR CAMPO.
 *
 * ── QUÉ ES UN CORTE ─────────────────────────────────────────────────────────
 *
 * Una diferencia registrada antes de un cambio de declaración puede haber
 * quedado resuelta por ese cambio. Contarla igual es una falsa alarma, que es el
 * espejo del falso cero: decir que hay un problema cuando ya se arregló entrena
 * a ignorar el indicador igual que un cero mentiroso.
 *
 * ── POR QUÉ POR CAMPO Y NO POR POOL ─────────────────────────────────────────
 *
 * Hasta v0.67 el corte era la fecha del último cambio de declaración del POOL
 * entero. Eso significaba que escribir el vocabulario de UNA pantalla ponía en
 * cero las diferencias de las otras nueve, que no se habían resuelto en
 * absoluto. Pasó de verdad y dejó diez diferencias vivas invisibles.
 *
 * El corte es por campo porque las diferencias son por campo. Una diferencia
 * sobre `/admin/operaciones/alertas` sólo se resuelve si cambió el título de
 * `/admin/operaciones/alertas`. Nada de lo que pase en otra ruta la toca.
 *
 * ── Y SÓLO CUENTA UN CAMBIO DE PIEZA ────────────────────────────────────────
 *
 * Desde 1.5.0 la comparación en sombra va contra el TÉRMINO DEL OFICIO, que vive
 * en la pieza. Un override de instalación —vocabulario o corrección— no cambia
 * lo que se compara, así que no puede resolver la diferencia. Si contara,
 * volveríamos a esconder: alguien escribe un vocabulario y la deuda de la pieza
 * desaparece del tablero sin que nadie la haya tocado.
 *
 * ── LA INTERACCIÓN CON EL DEDUPE ────────────────────────────────────────────
 *
 * El hallazgo 13 de v0.67 no estaba en el corte ni en el dedupe, estaba en cómo
 * se combinaban: el corte escondía los eventos viejos y el dedupe se negaba a
 * volver a registrarlos porque "ya estaban". Por eso el dedupe usa ESTE MISMO
 * corte como piso de su ventana, y hay un caso en la prueba adversaria que
 * ejercita la combinación y no cada pieza por separado.
 */

/** El principio de los tiempos, para un campo que nunca cambió. */
export const SIN_CORTE = '1970-01-01T00:00:00Z'

/**
 * De qué campo habla un evento del lector.
 *
 * Devuelve `null` cuando el evento no es sobre un campo concreto —un fallback
 * habla del pool entero, no de una ruta—. Esos usan el corte del pool, que para
 * ellos sí es el correcto: una versión nueva puede arreglar un manifiesto
 * inválido.
 */
export function campoDelEvento(evento: {
  aspecto: string | null
  detalle: unknown
}): string | null {
  const d = (evento.detalle ?? {}) as { ruta?: string; clave?: string; automatizacion?: string }
  if (evento.aspecto === 'pantallas' && d.ruta) return `pantallas.${d.ruta}.titulo`
  if (evento.aspecto === 'parametros' && d.clave) return `configurable.${d.clave}`
  // Desde v0.75. Sin esta línea los eventos de automatización caían al corte del
  // POOL, que es el hallazgo 12: arreglar una automatización borraba las alarmas
  // de las otras tres. El nombre del campo es el mismo que usa la procedencia,
  // porque es el mismo campo.
  if (evento.aspecto === 'automatizaciones' && d.automatizacion) {
    return `automatizaciones.${d.automatizacion}.activa`
  }
  return null
}

/**
 * campo → cuándo cambió por última vez EN LA PIEZA.
 *
 * Sale de `fab_procedencia`, que desde v0.67 registra cada cambio con su campo
 * y su fecha. Sin esa tabla este corte no se podía calcular, y por eso el
 * hallazgo 12 quedó abierto una sesión.
 */
export async function cortesPorCampo(clave: string): Promise<Map<string, string>> {
  const salida = new Map<string, string>()
  try {
    const adm = createAdminClient()
    const { data: pool } = await adm.from('fab_pools').select('id').eq('clave', clave).maybeSingle()
    const poolId = (pool as { id: string } | null)?.id
    if (!poolId) return salida

    const { data, error } = await adm
      .from('fab_procedencia')
      .select('campo, decidido_at')
      .eq('pool_id', poolId)
      .eq('nivel', 'pool')
      .in('es_prueba', artefactosVisibles())
      .order('decidido_at', { ascending: true })
      .limit(5000)

    // Si la consulta falla, se devuelve el mapa VACÍO y no un corte inventado.
    // Un mapa vacío hace que todos los eventos cuenten, que es el lado seguro:
    // se ve una alarma de más, no una de menos.
    if (error) return salida

    for (const f of (data ?? []) as { campo: string; decidido_at: string }[]) {
      salida.set(f.campo, f.decidido_at) // ascendente: queda la más reciente
    }
  } catch {
    return salida
  }
  return salida
}

/**
 * ¿Este evento sigue vivo?
 *
 * `corteDelPool` es el que se usa para los eventos que no hablan de un campo.
 */
export function sigueVivo(
  evento: { aspecto: string | null; detalle: unknown; ocurrido_at: string },
  cortes: Map<string, string>,
  corteDelPool: string,
): boolean {
  const campo = campoDelEvento(evento)
  if (!campo) return evento.ocurrido_at >= corteDelPool
  const corte = cortes.get(campo)
  // Un campo sin procedencia nunca cambió: nada pudo haber resuelto su
  // diferencia, así que cuenta siempre.
  if (!corte) return true
  return evento.ocurrido_at >= corte
}

/**
 * CUÁNTAS DIFERENCIAS DISTINTAS SIGUEN ABIERTAS.
 *
 * No cuántos eventos: cuántos CAMPOS están en desacuerdo hoy.
 *
 * La diferencia importa y costó un hallazgo. Un mismo campo puede tener cinco
 * eventos —se registró en cinco corridas distintas, cada una después de un
 * cambio de declaración que reabrió el dedupe— y sigue siendo UN problema. Con
 * el corte por pool, stock decía 0 cuando había 10; al pasarlo a por campo pasó
 * a decir 37, que es el mismo error del otro lado: inflar en vez de esconder.
 *
 * Un indicador inflado se ignora igual de rápido que uno en cero. Lo que hay que
 * contar es lo que alguien tiene que ir a arreglar.
 *
 * Los eventos SIN campo —los fallbacks— se cuentan de a uno: no hay un campo
 * por el cual agruparlos, y cada fallback es una vez que el sector se cayó al
 * código.
 */
export function diferenciasAbiertas(
  eventos: { aspecto: string | null; detalle: unknown; ocurrido_at: string }[],
  cortes: Map<string, string>,
  corteDelPool: string,
): { campos: Set<string>; sinCampo: number } {
  const campos = new Set<string>()
  let sinCampo = 0
  for (const e of eventos) {
    if (!sigueVivo(e, cortes, corteDelPool)) continue
    const campo = campoDelEvento(e)
    if (campo) campos.add(campo)
    else sinCampo++
  }
  return { campos, sinCampo }
}

/**
 * El corte que corresponde a un evento que se está por registrar.
 *
 * Lo usa el dedupe: su ventana no puede empezar antes de esto, porque un cambio
 * de declaración empieza la cuenta de nuevo y lo que se registre después es
 * información nueva aunque el texto sea idéntico.
 */
export async function corteParaRegistrar(
  clave: string,
  aspecto: string,
  detalle: unknown,
  corteDelPool: string,
): Promise<string> {
  const campo = campoDelEvento({ aspecto, detalle })
  if (!campo) return corteDelPool
  const cortes = await cortesPorCampo(clave)
  return cortes.get(campo) ?? SIN_CORTE
}
