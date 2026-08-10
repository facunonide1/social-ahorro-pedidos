import { existsSync, readFileSync } from 'node:fs'

import { PESOS_GOBERNADOS } from './lector'
import { esGobernable, tieneConflictoDeFuente } from './tipos'
import type { Manifiesto, ParametroConfigurable } from './tipos'

/**
 * ¿EL CÓDIGO USA LO QUE GOBIERNA?
 *
 * ── EL ESTADO QUE HAY QUE PODER VER ─────────────────────────────────────────
 *
 * Un parámetro usado en tres lugares y cableado en dos es PEOR que uno sin
 * cablear. Sin cablear, todo el sistema usa el valor del código y se comporta
 * de una sola manera. Cableado a medias, la misma decisión rige en una pantalla
 * y no en la otra: el resumen dice 3 y el badge dice 14, los dos "bien", y nadie
 * puede saber cuál está mal porque los dos son coherentes con su propia fuente.
 *
 * Hasta v0.68 ese estado era INDETECTABLE. Con `depende_de` en el manifiesto se
 * puede contar, y contarlo es lo único que lo convierte en un problema visible
 * en vez de una diferencia que se descubre cuando alguien pregunta por qué dos
 * números no coinciden.
 *
 * ── TRES ESTADOS, NUNCA UN CERO ────────────────────────────────────────────
 *
 * `sin_declarar` no es un caso raro ni un error: es la respuesta correcta para
 * un parámetro que nadie cableó todavía, y es distinta de "está bien". Un
 * booleano de un pool apagado que nunca se usó en el código tiene que decir
 * "nadie declaró dónde va", no "0 problemas".
 *
 * ── OBSERVA Y NO AFIRMA ────────────────────────────────────────────────────
 *
 * Esta rutina lee archivos y no escribe NADA: ni en la base, ni en el log de la
 * fábrica, ni en el manifiesto. Es el hallazgo 15 —una sonda que escribía en el
 * log lo que estaba midiendo, y después alguien leía esos datos como reales—
 * aplicado antes de repetirlo.
 */

export type EstadoCableado =
  | 'completo'
  | 'parcial'
  | 'sin_cablear'
  | 'sin_declarar'
  /** Hay otra fuente viva y nadie decidió cuál gana. Cablearlo empeora las cosas. */
  | 'conflicto_de_fuente'

export const ETIQUETA_CABLEADO: Record<EstadoCableado, string> = {
  completo: 'cableado completo y verificado',
  parcial: 'CABLEADO A MEDIAS',
  sin_cablear: 'sin cablear',
  sin_declarar: 'nadie declaró dónde se usa',
  conflicto_de_fuente: 'CONFLICTO DE FUENTE',
}

export interface RevisionDeParametro {
  clave: string
  poolClave: string
  peso: string
  gobernado: boolean
  estado: EstadoCableado
  /** Lugares declarados como cableados y que además existen y llaman a la fábrica. */
  verificados: string[]
  /** Declarados como cableados pero que NO llaman a la fábrica. Es lo peor. */
  desmentidos: string[]
  /** Declarados como NO cableados: lo que falta. */
  faltan: string[]
  /** Archivos declarados que no existen. Una dependencia inventada. */
  inexistentes: string[]
  motivo: string
}

/** ¿Este archivo llama a `parametro()` para esta clave? */
function resuelve(archivo: string, pool: string, clave: string): boolean {
  if (!existsSync(archivo)) return false
  const texto = readFileSync(archivo, 'utf8')
  const re = new RegExp(
    `parametro(?:<[^>]*>)?\\(\\s*'${pool}'\\s*,\\s*'${clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
  )
  return re.test(texto)
}

/**
 * ¿Este archivo recibe el valor por su señal?
 *
 * Un `recibe` no se puede verificar buscando `parametro(`: el valor le llega por
 * argumento. Lo que sí se puede verificar es que la señal declarada —el nombre
 * del argumento o de la prop— exista en el archivo. Es una comprobación más
 * débil que la del `resuelve`, y se dice que lo es.
 */
function recibe(archivo: string, senal: string | undefined): boolean {
  if (!senal || !existsSync(archivo)) return false
  return new RegExp(`\\b${senal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(
    readFileSync(archivo, 'utf8'),
  )
}

/**
 * Revisa un parámetro contra el código.
 *
 * `declarados_cableados` se CONFRONTA, no se cree. Si el manifiesto dice que un
 * archivo está cableado y el archivo no llama a la fábrica, eso es un
 * `desmentido` y manda sobre todo lo demás: una dependencia que afirma algo
 * falso es peor que una que falta, porque la que falta se ve.
 */
export function revisarParametro(
  poolClave: string,
  p: ParametroConfigurable,
): RevisionDeParametro {
  // ARRASTRE de v0.70: "gobernado" ya no es sólo el peso. Un parámetro con la
  // fuente sin resolver o marcada no gobernable NO lo devuelve el lector, así
  // que contarlo entre los gobernados infla el denominador — el mismo error
  // que el hallazgo 14, en otra cuenta.
  const gobernado = esGobernable(p, PESOS_GOBERNADOS)
  const deps = p.depende_de ?? []

  // El conflicto manda sobre todo lo demás: cablear un parámetro con dos
  // fuentes vivas es crear el conflicto silencioso, no resolverlo.
  if (tieneConflictoDeFuente(p)) {
    return {
      clave: p.clave,
      poolClave,
      peso: p.peso,
      gobernado: false,
      estado: 'conflicto_de_fuente',
      verificados: [],
      desmentidos: [],
      faltan: [],
      inexistentes: [],
      motivo: `Tiene otra fuente viva (${p.fuente!.nombre}) y ninguna gana. Hay que resolver la fuente ANTES de cablear.`,
    }
  }

  const base = {
    clave: p.clave,
    poolClave,
    peso: p.peso,
    gobernado,
    verificados: [] as string[],
    desmentidos: [] as string[],
    faltan: [] as string[],
    inexistentes: [] as string[],
  }

  if (deps.length === 0) {
    return {
      ...base,
      estado: 'sin_declarar',
      motivo:
        'El manifiesto no dice dónde se usa. No es "está bien": es que no se puede verificar nada.',
    }
  }

  for (const d of deps) {
    if (!existsSync(d.archivo)) {
      base.inexistentes.push(`${d.archivo} (${d.donde})`)
      continue
    }
    const etiqueta = `${d.archivo} (${d.donde})`
    if (d.via === 'literal') {
      base.faltan.push(etiqueta)
      continue
    }
    const ok = d.via === 'resuelve' ? resuelve(d.archivo, poolClave, p.clave) : recibe(d.archivo, d.senal)
    if (ok) base.verificados.push(`${etiqueta} · ${d.via}`)
    else base.desmentidos.push(`${etiqueta} · declarado "${d.via}"${d.senal ? ` con señal "${d.senal}"` : ''}`)
  }

  // El orden importa: primero lo que desmiente al manifiesto, después lo que
  // falta. Un manifiesto que afirma algo falso se arregla antes que un cableado
  // incompleto, porque todo lo demás se apoya en él.
  if (base.inexistentes.length > 0) {
    return {
      ...base,
      estado: 'parcial',
      motivo: `${base.inexistentes.length} dependencia(s) apuntan a archivos que no existen: el manifiesto afirma algo que no se puede verificar.`,
    }
  }
  if (base.desmentidos.length > 0) {
    return {
      ...base,
      estado: 'parcial',
      motivo: `${base.desmentidos.length} lugar(es) están declarados como cableados y NO llaman a la fábrica.`,
    }
  }
  if (base.verificados.length === 0) {
    return {
      ...base,
      estado: 'sin_cablear',
      motivo: `Se usa en ${base.faltan.length} lugar(es) y ninguno pasa por la fábrica: el valor declarado no gobierna nada.`,
    }
  }
  if (base.faltan.length > 0) {
    return {
      ...base,
      estado: 'parcial',
      motivo:
        `${base.verificados.length} de ${deps.length} lugar(es) usan el valor de la fábrica. ` +
        'Los otros usan un literal, así que la misma decisión rige en un lado y no en el otro.',
    }
  }
  return {
    ...base,
    estado: 'completo',
    motivo: `Los ${base.verificados.length} lugar(es) declarados reciben el valor de la fábrica.`,
  }
}

/** Revisa todos los parámetros de una tanda de manifiestos. */
export function revisarCableado(
  manifiestos: { clave: string; manifiesto: Manifiesto }[],
): RevisionDeParametro[] {
  return manifiestos.flatMap(({ clave, manifiesto }) =>
    (manifiesto.configurable ?? []).map((p) => revisarParametro(clave, p)),
  )
}

/**
 * El resumen, sin ceros que se lean como "todo bien".
 *
 * `verificables` es el denominador honesto: no se puede decir "3 de 23 están
 * completos" cuando 19 no declaran dónde van. Eso mezclaría "lo revisamos y
 * está mal" con "no lo pudimos revisar".
 */
export function resumenCableado(revisiones: RevisionDeParametro[]) {
  const conflictos = revisiones.filter((r) => r.estado === 'conflicto_de_fuente')
  const gobernados = revisiones.filter((r) => r.gobernado)
  const verificables = gobernados.filter((r) => r.estado !== 'sin_declarar')
  return {
    total: revisiones.length,
    gobernados: gobernados.length,
    verificables: verificables.length,
    completos: verificables.filter((r) => r.estado === 'completo').length,
    parciales: verificables.filter((r) => r.estado === 'parcial').length,
    sinCablear: verificables.filter((r) => r.estado === 'sin_cablear').length,
    sinDeclarar: gobernados.filter((r) => r.estado === 'sin_declarar').length,
    /** Con dos fuentes vivas: no se cuentan como gobernados y son un problema. */
    conflictosDeFuente: conflictos.length,
    conflictos: conflictos.map((r) => `${r.poolClave}.${r.clave}`),
  }
}
