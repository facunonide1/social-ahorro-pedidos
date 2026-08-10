import type { EstadoPool } from './flag'
import type { Manifiesto } from './tipos'

/**
 * LAS CUATRO RAZONES PARA DECIR QUE NO.
 *
 * ── POR QUÉ ESTO NO VIVE EN EL PROMPT ───────────────────────────────────────
 *
 * Un modelo al que se le pide "no propongas cosas imposibles" es un modelo que
 * casi siempre obedece. "Casi siempre" no alcanza cuando el precio de fallar es
 * prometerle a alguien un cambio que no va a pasar.
 *
 * Así que la negativa se decide acá, en código, ANTES y DESPUÉS del modelo:
 *
 *   ANTES   el catálogo que ve el modelo ya viene filtrado. Lo que este
 *           usuario no puede tocar, no se lo mostramos. No se le pide que se
 *           autolimite: no tiene con qué salirse.
 *   DESPUÉS si igual pide algo prohibido en su herramienta, se corta acá y la
 *           persona lee el motivo real, no una disculpa del modelo.
 *
 * El prompt igual las explica: sirve para que la respuesta sea buena, no para
 * que sea segura. La seguridad no se delega al texto.
 *
 * ── EL ORDEN IMPORTA ────────────────────────────────────────────────────────
 *
 * Se evalúa de lo más grave a lo más circunstancial. Si un pedido toca la
 * constitución Y además el pool está apagado, lo que hay que decir es que toca
 * la constitución: lo otro se arregla prendiendo un flag, y eso invita a
 * insistir.
 */

export type MotivoNegativa =
  /** Está en la lista de intocables de la pieza. No se hace por esta vía, nunca. */
  | 'constitucional'
  /** Pide un molde, una entidad o un comportamiento que todavía no existe. */
  | 'no_existe'
  /** Está declarado, pero el lector todavía no lo lee: cambiarlo no se vería. */
  | 'fuera_del_lector'
  /** Existe y se leería, pero este pool no está en condiciones de recibirlo. */
  | 'proyecto_no_listo'

export interface Negativa {
  motivo: MotivoNegativa
  /** Lo que se le dice a la persona. En castellano, sin jerga. */
  texto: string
  /** Qué sí se puede hacer en su lugar. Nunca se dice que no a secas. */
  salida: string
}

/**
 * LO QUE EL LECTOR GOBIERNA HOY: presentación y navegación, y nada más.
 *
 * Está acá y no en un comentario porque el día que el lector lea algo más, esta
 * constante cambia y el chat deja de mentir sin que nadie tenga que acordarse
 * de él.
 */
// Desde v0.68 el lector también devuelve parámetros, pero SÓLO los gobernables
// —peso inocuo u operativo, sin conflicto de fuente— y sólo los que alguien
// cableó. Por eso `configurable` sigue fuera de esta lista: la respuesta correcta
// depende del parámetro, no del campo, y el chat la da parámetro por parámetro.
export const GOBIERNA_HOY = ['titulos', 'vocabulario', 'ocultas', 'nombre', 'descripcion']

/**
 * Se declara, todavía no se lee, pero SÍ se puede proponer.
 *
 * La propuesta es legítima: deja la decisión tomada y firmada para cuando el
 * lector la lea. Lo que no es legítimo es dejar que la persona crea que ya
 * cambió algo, así que se advierte antes y la advertencia viaja con la
 * propuesta.
 */
export const NO_LEIDO_PERO_PROPONIBLE: Record<string, string> = {
  configurable: 'los parámetros de configuración',
  dimensiones: 'las listas de valores',
}

/**
 * Se declara y NO se propone desde acá, ni con advertencia.
 *
 * Un permiso o una acción del asistente mal puestos no se ven raros: alguien ve
 * lo que no debe, o el sistema hace algo que nadie firmó. Esto espera a que el
 * lector los lea de verdad, con su reversión probada.
 */
const NI_CON_ADVERTENCIA: Record<string, string> = {
  agentes: 'las acciones y la autonomía del asistente',
}

/** Claves válidas de un override, y qué campo de la clasificación son. */
const CLAVES_DE_OVERRIDE = new Set([
  'nombre',
  'descripcion',
  'titulos',
  'vocabulario',
  'ocultas',
  'configurable',
  'dimensiones',
  'agentes',
])

export interface PedidoEvaluable {
  clave: string
  /** Las claves de primer nivel del override propuesto. */
  campos: string[]
  /** Rutas de pantalla que toca, si toca alguna. */
  rutas?: string[]
  /** Claves de configurable que toca, si toca alguna. */
  configurables?: string[]
}

/**
 * ¿Se puede? Devuelve `null` si sí.
 *
 * `manifiesto` es el EFECTIVO del proyecto (pieza + lo suyo encima), no la
 * semilla del repo: preguntarle a la semilla sería preguntarle al código, que
 * es justo lo que la fábrica no quiere hacer.
 */
export function porQueNo(
  pedido: PedidoEvaluable,
  manifiesto: Manifiesto | null,
  estado: EstadoPool | undefined,
): Negativa | null {
  /* ── 1 · la constitución ──────────────────────────────────────────── */
  const intocables = manifiesto?.constitucional ?? []
  for (const campo of pedido.campos) {
    const choca = intocables.find((c) => c.elemento === campo || c.elemento.startsWith(`${campo}.`))
    if (choca) {
      return {
        motivo: 'constitucional',
        texto: `Eso toca ${choca.elemento}, que está protegido por un límite de la pieza: ${choca.motivo}`,
        salida:
          'Un límite constitucional no se levanta desde acá, ni con aprobación. Si de verdad hay que cambiarlo, se cambia la pieza compartida con la gente que la mantiene, y queda registrado.',
      }
    }
  }
  for (const conf of pedido.configurables ?? []) {
    const choca = intocables.find(
      (c) => c.elemento === `configurable.${conf}` || c.elemento === conf,
    )
    if (choca) {
      return {
        motivo: 'constitucional',
        texto: `El parámetro "${conf}" está protegido por ${choca.limite}: ${choca.motivo}`,
        salida:
          'No lo puedo proponer. Lo que sí puedo es mostrarte qué protege ese límite y quién lo declaró.',
      }
    }
  }

  /* ── 2 · algo que no existe ───────────────────────────────────────── */
  if (!manifiesto) {
    return {
      motivo: 'no_existe',
      texto: `No hay ninguna pieza declarada con la clave "${pedido.clave}".`,
      salida:
        'Lo puedo dejar anotado como pedido de construcción, con lo que contaste. No lo voy a intentar por otro lado ni prometerte que después sí.',
    }
  }
  const rutasConocidas = new Set(manifiesto.pantallas.map((p) => p.ruta))
  const desconocida = (pedido.rutas ?? []).find((r) => !rutasConocidas.has(r))
  if (desconocida) {
    return {
      motivo: 'no_existe',
      texto: `La pantalla "${desconocida}" no está declarada en ${manifiesto.nombre}. No la puedo inventar.`,
      salida:
        'Si esa pantalla tendría que existir, la anoto como pedido de construcción. Hoy no hay molde para crearla desde acá.',
    }
  }
  const clavesConf = new Set((manifiesto.configurable ?? []).map((c) => c.clave))
  const inexistente = (pedido.configurables ?? []).find((c) => !clavesConf.has(c))
  if (inexistente) {
    return {
      motivo: 'no_existe',
      texto: `"${inexistente}" no es un parámetro declarado de ${manifiesto.nombre}.`,
      salida: `Los que sí existen son: ${[...clavesConf].join(', ') || 'ninguno'}. Si hace falta uno nuevo, lo anoto como pedido.`,
    }
  }

  /* ── 3 · fuera de lo que el lector gobierna ───────────────────────── */
  for (const campo of pedido.campos) {
    if (!CLAVES_DE_OVERRIDE.has(campo)) {
      return {
        motivo: 'fuera_del_lector',
        texto: `"${campo}" es una decisión de la pieza compartida, no de este proyecto. Cambiarlo acá lo cambiaría para todos los negocios que la usan.`,
        salida:
          'Desde este proyecto sólo se pueden ajustar los campos de instalación. Si el cambio tiene que valer para todos, va por la pieza y por la gente que la mantiene.',
      }
    }
    const duro = NI_CON_ADVERTENCIA[campo]
    if (duro) {
      return {
        motivo: 'fuera_del_lector',
        texto: `Hoy el lector gobierna títulos de pantalla y qué se ve en el menú, nada más. ${duro[0].toUpperCase()}${duro.slice(1)} se declaran, pero el sistema sigue usando su código, y eso no se propone desde acá ni con advertencia: si un título sale mal se ve raro, si una acción sale mal el sistema hace algo que nadie firmó.`,
        salida:
          'Lo anoto como pedido para cuando el lector lea las acciones, que es cuando va a poder revertirse. Mientras tanto se cambia en el código, con deploy y con quien lo mantiene.',
      }
    }
    const blando = NO_LEIDO_PERO_PROPONIBLE[campo]
    if (blando && !GOBIERNA_HOY.includes(campo)) {
      return {
        motivo: 'fuera_del_lector',
        texto: `Hoy el lector gobierna títulos de pantalla y qué se ve en el menú, nada más. ${blando[0].toUpperCase()}${blando.slice(1)} se declaran, pero el sistema sigue usando su código: si lo cambiamos, queda escrito y NO se ve en pantalla.`,
        salida:
          'Puedo dejar la propuesta igual, si querés que la decisión quede tomada y registrada para cuando el lector la lea. Pero te lo digo antes, no después.',
      }
    }
  }

  /* ── 4 · el proyecto no está listo ────────────────────────────────── */
  // El último de los cuatro, y el más importante de los cuatro. Proponer sobre
  // un pool que no está prendido da la ilusión de que el cambio se va a ver.
  if (!estado) {
    return {
      motivo: 'proyecto_no_listo',
      texto: `${manifiesto.nombre} no está instalado en este proyecto.`,
      salida: 'Hay que instalarlo primero. Eso no se hace desde el chat.',
    }
  }
  if (estado.lector !== 'prendido') {
    return {
      motivo: 'proyecto_no_listo',
      texto:
        estado.lector === 'apagado'
          ? `${manifiesto.nombre} tiene el lector APAGADO: la declaración no gobierna nada todavía. Lo que aprobemos no se va a ver en ninguna pantalla.`
          : `${manifiesto.nombre} está en SOMBRA: se está comparando la declaración contra el código, pero todavía manda el código. Lo que aprobemos no se va a ver hasta que se prenda.`,
      salida:
        estado.diferencias > 0
          ? `Antes de prenderlo hay ${estado.diferencias} diferencia(s) sin resolver. Se miran en el Taller. Igual puedo dejar la propuesta lista para cuando se prenda.`
          : 'Se prende desde el Taller, cuando la verificación dé cero. Igual puedo dejar la propuesta lista para ese momento.',
    }
  }

  return null
}

/**
 * La advertencia que va con una propuesta que SÍ se puede hacer.
 *
 * No es una negativa: es lo que hay que decir igual. Un pool prendido con
 * fallbacks está usando el código a espaldas de la declaración, y quien aprueba
 * merece saberlo.
 */
export function advertencia(estado: EstadoPool | undefined): string | null {
  if (!estado) return null
  if (estado.fallbacks > 0)
    return `Ojo: este pool cayó al código ${estado.fallbacks} vez/veces con el lector prendido. Puede que el cambio no se vea en todas las pantallas.`
  return null
}
