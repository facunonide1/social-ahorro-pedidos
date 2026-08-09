import * as React from 'react'

import { createAdminClient } from '@/lib/supabase/server'
import { validarManifiesto } from './validador'
import { corteDe } from './cobertura-lector'
import { corteParaRegistrar } from './corte'
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
export type Aspecto = 'pantallas' | 'parametros'

export interface DefinicionPantallas {
  aspecto: 'pantallas'
  /** ruta → título declarado. */
  titulos: Record<string, string>
}

/**
 * Los parámetros que el lector gobierna.
 *
 * SÓLO los ponderados `inocuo` u `operativo`. Los 14 `sensible` se declaran y
 * NO se leen: un parámetro sensible mal leído afloja un control o mueve plata, y
 * eso espera a que este mecanismo tenga historia. Un título mal leído se ve
 * feo; un parámetro mal leído hace que el sistema se comporte distinto sin que
 * nadie lo note.
 *
 * El filtro está acá, en el lector, y no en el llamador: si estuviera en el
 * llamador, cada llamador nuevo sería una oportunidad de leer un sensible.
 */
export interface DefinicionParametros {
  aspecto: 'parametros'
  /** clave → valor declarado. Sólo inocuos y operativos. */
  valores: Record<string, unknown>
  /** clave → de dónde salió, para que el portal pueda decirlo. */
  pesos: Record<string, string>
}

export type Definicion = DefinicionPantallas | DefinicionParametros

/** Los pesos que el lector gobierna hoy. El resto se declara y no se lee. */
export const PESOS_GOBERNADOS = ['inocuo', 'operativo'] as const

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
    //
    // PERO LA VENTANA NO PUEDE SER MÁS VIEJA QUE EL CORTE, y esto costó caro:
    // el corte descarta los eventos anteriores al último cambio de declaración,
    // y el dedupe se negaba a volver a registrarlos porque "ya estaban". Entre
    // los dos hacían desaparecer diez diferencias vivas por 24 horas — el corte
    // las escondía y el dedupe impedía que volvieran a aparecer.
    //
    // Un cambio de declaración empieza la cuenta de nuevo: lo que se registre
    // después es información nueva aunque el texto sea idéntico.
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    // El corte DEL CAMPO, no el del pool: si fuera el del pool, tocar una ruta
    // reabriría el dedupe de todas las demás y el panel se llenaría del mismo
    // problema repetido. Es el mismo corte que usa el conteo, a propósito.
    const corteDelPool = await corteDe(PROYECTO_SOCIAL_AHORRO, pool).catch(() => hace24h)
    const corte = await corteParaRegistrar(pool, aspecto, detalle, corteDelPool).catch(
      () => hace24h,
    )
    const desde = corte > hace24h ? corte : hace24h
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

  const definicion: Definicion =
    aspecto === 'parametros'
      ? {
          aspecto: 'parametros',
          valores: Object.fromEntries(
            (r.manifiesto.configurable ?? [])
              .filter((c) => (PESOS_GOBERNADOS as readonly string[]).includes(c.peso))
              .filter((c) => c.default !== undefined)
              .map((c) => [c.clave, c.default]),
          ),
          pesos: Object.fromEntries(
            (r.manifiesto.configurable ?? []).map((c) => [c.clave, c.peso]),
          ),
        }
      : {
          aspecto: 'pantallas',
          // Las de título dinámico quedan afuera: su cabecera sale de los datos
          // de la fila, y una etiqueta fija le quitaría información.
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
 * QUÉ TÍTULO GOBIERNA HOY, sin comparar y sin registrar nada.
 *
 * Existe porque hasta v0.68 observar y afirmar pasaban por la misma puerta. Un
 * script que sólo quería MIRAR qué resuelve la declaración tenía que llamar a
 * `tituloDePantalla(pool, ruta, 'FALLBACK')` — y ese 'FALLBACK' se registraba
 * como el literal del código, o sea como una diferencia real. Catorce eventos
 * inventados en el log, que inflaron el conteo de diferencias de 13 a 17.
 *
 * Es la quinta pregunta otra vez, en otra forma: el canal de observación y el de
 * afirmación no pueden ser el mismo. Quien mira no afirma nada.
 *
 * Devuelve `null` si la declaración no gobierna esta pantalla, en cualquiera de
 * sus sentidos: flag apagado, sin versión, no valida, o no declarada.
 */
export async function tituloGobernante(pool: string, ruta: string): Promise<string | null> {
  const r = await resolver(pool)
  if (!r.manifiesto) return null
  const p = r.manifiesto.pantallas.find((x) => x.ruta === ruta)
  if (!p || p.titulo_dinamico || p.redirige_a) return null
  return p.titulo?.trim() ? p.titulo : null
}

/**
 * QUÉ VALOR DE PARÁMETRO GOBIERNA HOY, sin comparar y sin registrar nada.
 *
 * El equivalente de `tituloGobernante` para parámetros, y por el mismo motivo:
 * observar y afirmar no pueden pasar por la misma puerta (hallazgo 15).
 *
 * Devuelve también de dónde salió, porque con un parámetro eso importa más que
 * con un título: un número que se comporta distinto sin que se sepa por qué es
 * exactamente el problema que este bloque tiene que no crear.
 */
export async function parametroGobernante(
  pool: string,
  clave: string,
): Promise<{ valor: unknown; peso: string; gobernado: boolean } | null> {
  const r = await resolver(pool)
  if (!r.manifiesto) return null
  const c = (r.manifiesto.configurable ?? []).find((x) => x.clave === clave)
  if (!c) return null
  const gobernado =
    (PESOS_GOBERNADOS as readonly string[]).includes(c.peso) && r.estado === 'prendido'
  return { valor: c.default, peso: c.peso, gobernado }
}

/**
 * En sombra, para un parámetro: compara lo declarado contra lo que usa el
 * código y registra la diferencia.
 *
 * Separado de `compararEnSombra` a propósito: comparten la forma pero no la
 * clave del detalle —`ruta` contra `clave`—, y unificarlos obligaría a un
 * campo genérico que después nadie sabe leer. El corte por campo depende de
 * poder distinguirlos (`campoDelEvento`).
 */
export async function compararParametroEnSombra(
  pool: string,
  clave: string,
  enCodigo: unknown,
): Promise<void> {
  const r = await resolver(pool)
  if (r.estado !== 'sombra') return
  if (!r.manifiesto) {
    await registrar(pool, 'fallback', 'parametros', r.motivoFallback, { clave, estado: 'sombra' })
    return
  }
  const c = (r.manifiesto.configurable ?? []).find((x) => x.clave === clave)
  if (!c || !(PESOS_GOBERNADOS as readonly string[]).includes(c.peso)) return
  if (JSON.stringify(c.default) !== JSON.stringify(enCodigo)) {
    await registrar(pool, 'diferencia', 'parametros', 'El parámetro declarado no es el del código.', {
      clave,
      en_codigo: enCodigo,
      en_declaracion: c.default,
    })
  }
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

  // SE COMPARA CONTRA EL TÉRMINO DEL OFICIO, NO CONTRA EL TÍTULO EFECTIVO.
  //
  // Si este negocio declaró que a esta pantalla le dice distinto, eso es una
  // DECISIÓN, no una diferencia. Compararlo contra el literal del código haría
  // que cada entrada legítima de vocabulario deje una alarma que nunca se puede
  // cerrar: alguien tendría que elegir entre registrar cómo habla su equipo y
  // tener el tablero en cero. Una diferencia es que la PIEZA no coincida con el
  // código, que sí es un defecto y sí hay que arreglar.
  const declarado = pantalla?.titulo_de_oficio ?? pantalla?.titulo
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
      // Se deja asentado si además hay vocabulario, para que quien lea el evento
      // no crea que la diferencia la causó el vocabulario.
      nombre_en_el_negocio: pantalla?.nombre_en_el_negocio ?? null,
    })
  }
}
