import * as React from 'react'

import { createAdminClient } from '@/lib/supabase/server'
import { validarManifiesto } from './validador'
import { overridesActuales, resolver as aplicarOverrides } from './overrides'
import { PROYECTO_SOCIAL_AHORRO } from './flag'
import type { EstadoLector } from './lector-estados'
import type { Manifiesto } from './tipos'

/**
 * EL LECTOR.
 *
 * La pieza que hace que la declaración gobierne en vez de sólo describir.
 *
 * Lee el manifiesto de LA BASE, de la versión marcada `es_actual`. No del
 * código: el código ya está en el código, y leerlo sería teatro. La base es lo
 * que se puede cambiar sin un deploy, y por eso es lo único que puede gobernar
 * de verdad — y también por eso hace falta todo lo demás de este archivo.
 *
 * Desde v0.63 la copia en `lib/fabrica/manifiestos/` es SEMILLA, no fuente: se
 * usa para el arranque en frío de un proyecto nuevo. Quien manda es la fila.
 *
 * QUÉ LEE HOY: presentación y navegación. Títulos de pantalla, nada más.
 * QUÉ NO LEE: permisos, acciones ejecutables, automatizaciones. Si el lector
 * se equivoca en un título, se ve raro. Si se equivoca en un permiso, alguien
 * ve lo que no debe. Eso espera al escritor, que es lo que permitiría
 * revertir.
 *
 * USA service_role A PROPÓSITO. Las tablas `fab_*` tienen RLS que sólo deja
 * entrar a miembros de la fábrica, y quien mira una pantalla de Social Ahorro
 * no lo es. Con el cliente de sesión el lector caería al código SIEMPRE, y el
 * flag no serviría para nada.
 */

/** Qué parte del manifiesto se está pidiendo. */
export type Aspecto = 'pantallas'

export interface DefinicionPantallas {
  aspecto: 'pantallas'
  /** ruta → título declarado. */
  titulos: Record<string, string>
}

export type Definicion = DefinicionPantallas

interface Resuelto {
  estado: EstadoLector
  manifiesto: Manifiesto | null
  /** Por qué no se pudo usar la declaración, si no se pudo. */
  motivoFallback: string | null
}

/**
 * Memo por REQUEST, no por proceso.
 *
 * `cache()` de React dura lo que dura una request: dos títulos del mismo pool
 * en la misma pantalla hacen una sola consulta, y la request siguiente vuelve a
 * preguntar. Eso último es lo que importa — un cache de proceso haría que
 * apagar el flag tarde en verse, y el flag tiene que poder apagarse en
 * caliente.
 *
 * Fuera de un render de React (los scripts de consola) `cache` no existe: ahí
 * se degrada a llamar directo. Un lector que sólo funciona dentro de Next es un
 * lector que no se puede probar antes de prenderlo.
 */
const porRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof (React as { cache?: unknown }).cache === 'function'
    ? (React as unknown as { cache: <T extends (...args: never[]) => unknown>(fn: T) => T }).cache
    : (fn) => fn

const resolver = porRequest(async (pool: string): Promise<Resuelto> => {
  const vacio: Resuelto = { estado: 'apagado', manifiesto: null, motivoFallback: null }

  try {
    const adm = createAdminClient()
    const { data, error } = await adm
      .from('fab_instalaciones')
      .select(
        'id, lector, estado, pool:fab_pools!inner(clave, versiones:fab_pool_versiones(manifiesto, estado, numero, es_actual))',
      )
      .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
      .eq('fab_pools.clave', pool)
      .eq('fab_pools.fab_pool_versiones.es_actual', true)
      .maybeSingle()

    if (error || !data) return vacio

    const fila = data as unknown as {
      id: string
      lector: EstadoLector
      estado: string
      pool: { clave: string; versiones: { manifiesto: Manifiesto; estado: string; numero: number }[] } | null
    }

    // 1 · ¿el flag está apagado? Entonces no hay nada que resolver.
    if (fila.lector === 'apagado') return vacio

    // 2 · ¿hay una versión actual publicada?
    const actual = fila.pool?.versiones?.[0]
    if (!actual?.manifiesto) {
      return {
        estado: fila.lector,
        manifiesto: null,
        motivoFallback: 'El pool no tiene una versión marcada como actual.',
      }
    }
    if (actual.estado !== 'publicada') {
      return {
        estado: fila.lector,
        manifiesto: null,
        motivoFallback: `La versión actual está en estado "${actual.estado}", no publicada.`,
      }
    }

    // 3 · ¿valida contra el esquema vigente? Un manifiesto inválido en la base
    // no puede gobernar: valdría más el error que el código que funciona.
    const errores = validarManifiesto(actual.manifiesto).filter((p) => p.gravedad === 'error')
    if (errores.length > 0) {
      return {
        estado: fila.lector,
        manifiesto: null,
        motivoFallback: `El manifiesto no valida: ${errores.map((e) => `${e.campo} — ${e.mensaje}`).join(' · ')}`,
      }
    }

    // 4 · la pieza con lo de ESTE proyecto encima.
    // Sin este paso, dos proyectos con la misma pieza verían lo mismo, que es
    // exactamente el problema que esta separación vino a resolver.
    const propios = await overridesActuales(fila.id)
    const { manifiesto } = aplicarOverrides(actual.manifiesto, propios?.overrides ?? null)
    return { estado: fila.lector, manifiesto, motivoFallback: null }
  } catch {
    // La fábrica caída no puede tirar abajo Social Ahorro. Ni siquiera se
    // registra el evento: registrar requiere la misma base que acaba de fallar.
    return vacio
  }
})

/**
 * Deja constancia de que una pantalla consultó al lector.
 *
 * Nunca lanza y nunca bloquea: una pantalla no puede esperar a que la fábrica
 * lleve la cuenta.
 */
async function registrarConsulta(pool: string, ruta: string): Promise<void> {
  try {
    const adm = createAdminClient()
    await adm.rpc('fab_registrar_consulta', {
      p_proyecto: PROYECTO_SOCIAL_AHORRO,
      p_pool: pool,
      p_ruta: ruta,
    })
  } catch {
    // Silencio deliberado.
  }
}

/** Deja constancia. Nunca lanza: un problema de registro no puede romper una pantalla. */
async function registrar(
  pool: string,
  tipo: 'fallback' | 'diferencia',
  aspecto: string,
  motivo: string | null,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  try {
    const adm = createAdminClient()

    // Una pantalla se abre muchas veces por día y la diferencia sería siempre
    // la misma. Se registra una vez por día por pool/aspecto/detalle, para que
    // el panel muestre problemas distintos y no el mismo problema repetido.
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: yaHay } = await adm
      .from('fab_lector_eventos')
      .select('id')
      .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
      .eq('pool_clave', pool)
      .eq('tipo', tipo)
      .eq('aspecto', aspecto)
      .gte('ocurrido_at', desde)
      .contains('detalle', detalle)
      .limit(1)
    if (yaHay && yaHay.length > 0) return

    await adm.from('fab_lector_eventos').insert({
      proyecto_id: PROYECTO_SOCIAL_AHORRO,
      pool_clave: pool,
      tipo,
      aspecto,
      motivo,
      detalle,
    })
  } catch {
    // Silencio deliberado.
  }
}

/**
 * El contrato del lector.
 *
 * Orden de resolución:
 *   1. ¿el flag del pool está en `prendido`? Si no → null (el sector usa el código)
 *   2. ¿existe manifiesto publicado? Si no → null y se registra el fallback
 *   3. ¿valida contra el esquema vigente? Si no → null, fallback y alerta
 *   4. devolver la declaración
 *
 * Devolver `null` significa "usá lo tuyo". El sector NUNCA se rompe por esto:
 * en el peor caso hace exactamente lo que hacía antes de que existiera la
 * fábrica.
 */
export async function obtenerDefinicion(
  pool: string,
  aspecto: Aspecto,
): Promise<Definicion | null> {
  const r = await resolver(pool)

  if (r.estado === 'apagado') return null

  if (!r.manifiesto) {
    // Se registra sólo si el flag estaba prendido o en sombra: un fallback con
    // el flag apagado no es un fallback, es el funcionamiento normal.
    await registrar(pool, 'fallback', aspecto, r.motivoFallback, { estado: r.estado })
    return null
  }

  const definicion: DefinicionPantallas = {
    aspecto: 'pantallas',
    // Las de título dinámico quedan afuera: su cabecera sale de los datos de la
    // fila, y una etiqueta fija le quitaría información a la pantalla.
    titulos: Object.fromEntries(
      r.manifiesto.pantallas
        .filter((p) => !p.titulo_dinamico && !p.redirige_a)
        .map((p) => [p.ruta, p.titulo]),
    ),
  }

  // En sombra NO se devuelve la declaración: se devuelve null para que el
  // sector use el código, y la comparación la hace quien preguntó llamando a
  // `compararEnSombra`. Es lo que permite dejarlo días en producción.
  if (r.estado === 'sombra') return null

  return definicion
}

/**
 * En estado sombra: compara lo que habría devuelto la declaración contra lo que
 * el código va a devolver, y registra la diferencia.
 *
 * Se llama SIEMPRE, esté el flag como esté, y no hace nada salvo en sombra. Que
 * la decisión de si corresponde comparar viva acá y no en el llamador es lo que
 * evita que el punto de contacto en Social Ahorro tenga que entender los
 * estados del lector.
 */
export async function compararEnSombra(
  pool: string,
  ruta: string,
  enCodigo: string,
): Promise<void> {
  const r = await resolver(pool)
  if (r.estado === 'apagado') return

  // Queda constancia de que esta pantalla PREGUNTÓ. Es lo único que permite
  // distinguir después "no hubo diferencias" de "no se miró nada". Se registra
  // en sombra y prendido: con el flag apagado no hay nada que cubrir.
  await registrarConsulta(pool, ruta)

  if (r.estado !== 'sombra') return

  // Si en sombra el manifiesto no se puede usar, eso NO es "cero diferencias":
  // es que no se comparó nada. Sin este registro, un manifiesto inválido en la
  // base se ve exactamente igual que una declaración perfecta — y es el peor
  // cero posible, porque parece que está todo bien.
  if (!r.manifiesto) {
    await registrar(pool, 'fallback', 'pantallas', r.motivoFallback, { estado: 'sombra' })
    return
  }

  const pantalla = r.manifiesto.pantallas.find((p) => p.ruta === ruta)
  if (pantalla?.titulo_dinamico) return

  const declarado = pantalla?.titulo
  if (declarado === undefined) {
    await registrar(pool, 'diferencia', 'pantallas', 'La declaración no incluye esta pantalla.', {
      ruta,
      en_codigo: enCodigo,
      en_declaracion: null,
    })
    return
  }
  if (declarado !== enCodigo) {
    await registrar(pool, 'diferencia', 'pantallas', 'El título declarado no es el del código.', {
      ruta,
      en_codigo: enCodigo,
      en_declaracion: declarado,
    })
  }
}
