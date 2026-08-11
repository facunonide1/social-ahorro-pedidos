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
  /** El código no lo implementa todavía, y está declarado. */
  | 'con_brecha'
  /** Se buscó y el código no lo lee. No es un hueco: es una respuesta. */
  | 'sin_consumo'
  /** Hay otra fuente viva y nadie decidió cuál gana. Cablearlo empeora las cosas. */
  | 'conflicto_de_fuente'

export const ETIQUETA_CABLEADO: Record<EstadoCableado, string> = {
  completo: 'cableado completo y verificado',
  parcial: 'CABLEADO A MEDIAS',
  sin_cablear: 'sin cablear',
  sin_declarar: 'nadie declaró dónde se usa',
  con_brecha: 'el código todavía no lo implementa',
  sin_consumo: 'se buscó y el código no lo lee',
  conflicto_de_fuente: 'CONFLICTO DE FUENTE',
}

/**
 * ¿EL IDENTIFICADOR DECLARADO EXISTE EN EL ARCHIVO?
 *
 * Cierra el caso real de v0.70: el manifiesto decía `alertasDeCosto` y la
 * función es `evaluarAlertasCosto`. La verificación no lo detectó porque
 * comprobaba que el ARCHIVO llamara a la fábrica, no que `donde` fuera real.
 *
 * Tres estados y NO dos, porque colapsarlos volvería a esconder:
 *
 *   verificado  el identificador aparece como declaración en el archivo
 *   no_existe   no aparece de ninguna forma. El manifiesto afirma algo falso
 *   ambiguo     `donde` no es un identificador —"badge de Operaciones",
 *               "GET /api/os/badges"— y no hay nada que buscar. Es una
 *               respuesta, no un fallo: hay lugares de consumo que no tienen
 *               nombre de función
 */
export type EstadoIdentificador =
  /** Se encontró el identificador declarado o importado. Verificación FUERTE. */
  | 'verificado'
  /**
   * Se encontró el ancla, que es un fragmento de código.
   *
   * Verificación DÉBIL, y se dice: si alguien reformatea esa línea, el ancla
   * deja de coincidir sin que nada haya cambiado de fondo. Una alarma que suena
   * por un cambio de formato es la que entrena a ignorar el tablero.
   */
  | 'verificado_debil'
  | 'no_existe'
  /** Hay ancla declarada y NO coincide: no se puede afirmar nada, ni bien ni mal. */
  | 'ancla_no_coincide'
  | 'ambiguo'

/** ¿El consumidor declarado parece un identificador de código? */
function esIdentificador(consume: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(consume)
}

/**
 * Busca el identificador COMO DECLARACIÓN, no como cualquier aparición.
 *
 * Buscar la palabra suelta daría verde con un comentario que la menciona, que
 * es el detector difuso de v0.69 otra vez.
 */
export function verificarIdentificador(
  archivo: string,
  consume: string,
  ancla?: string,
): EstadoIdentificador {
  if (!existsSync(archivo)) return 'no_existe'

  // EL ANCLA MANDA cuando `donde` no es un identificador: es la forma de
  // verificar un lugar que no tiene nombre de función. Coincidencia literal y
  // exacta, no búsqueda difusa.
  if (!esIdentificador(consume)) {
    if (!ancla) return 'ambiguo'
    // Un ancla que no coincide NO dice "el cableado está roto": dice "no pude
    // verificar". Son cosas distintas y hasta v0.73 se leían igual — la
    // primera manda a alguien a arreglar código que puede estar perfecto.
    return readFileSync(archivo, 'utf8').includes(ancla) ? 'verificado_debil' : 'ancla_no_coincide'
  }
  const texto = readFileSync(archivo, 'utf8')
  const d = consume.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const formas = [
    `function\\s+${d}\\b`,
    `const\\s+${d}\\b`,
    `let\\s+${d}\\b`,
    `class\\s+${d}\\b`,
    // export default function X, export async function X, etc.
    `export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${d}\\b`,
    // Y el identificador IMPORTADO: existe en el scope de este archivo aunque
    // se declare en otro. La primera versión no lo contemplaba y marcó como
    // inexistentes cuatro constantes perfectamente importadas — el mismo error
    // que el detector difuso, del lado del falso positivo.
    `import\\s*\\{[^}]*\\b${d}\\b[^}]*\\}`,
  ]
  return formas.some((f) => new RegExp(f).test(texto)) ? 'verificado' : 'no_existe'
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
  /** Consumidor declarado que no existe en el archivo. Ídem, un nivel más fino. */
  identificadoresInexistentes: string[]
  /** Verificados por ancla: cierto hoy, y frágil ante un reformateo. */
  identificadoresDebiles: string[]
  /** Ancla declarada que no coincide: NO se pudo verificar. No es "está roto". */
  anclasQueNoCoinciden: string[]
  /** `donde` que no es un identificador: no hay nada que verificar. */
  identificadoresAmbiguos: string[]
  motivo: string
}

/**
 * ¿La FUNCIÓN declarada llama a `parametro()` para esta clave?
 *
 * ── LA PREGUNTA 7, APLICADA A ESTA VERIFICACIÓN ─────────────────────────────
 *
 * Hasta v0.72 se comprobaba que el ARCHIVO llamara a la fábrica. Eso es cierto
 * y está al lado de lo que hace falta: `lib/documentos/costos.ts` tiene DOS
 * funciones que consumen el mismo parámetro, y con la comprobación por archivo
 * las dos daban verde aunque sólo una llamara. Una declaración podía nombrar
 * cualquier función del archivo y pasar.
 *
 * Ahora se busca la llamada DENTRO del cuerpo de la función declarada,
 * delimitado por balance de llaves desde su declaración. Si el consumidor no es
 * un identificador —un badge anónimo— se cae al archivo entero y se dice que
 * la verificación es de menor grado.
 */
function cuerpoDe(texto: string, consume: string): string | null {
  const m = new RegExp(
    `(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${consume}\\b|` +
      `(?:export\\s+)?const\\s+${consume}\\s*[:=]`,
  ).exec(texto)
  if (!m) return null

  // La `{` del CUERPO, no la primera que aparezca: la lista de parámetros
  // puede traer un tipo inline —`opts: { soloFacturas?: boolean } = {}`— y
  // tomar esa daba un "cuerpo" de tres palabras donde nunca iba a estar la
  // llamada. Todas las funciones dieron rojo hasta que se miró por qué.
  let i = texto.indexOf('(', m.index)
  if (i < 0) return null
  let par = 0
  for (; i < texto.length; i++) {
    if (texto[i] === '(') par++
    else if (texto[i] === ')') {
      par--
      if (par === 0) break
    }
  }
  // Y después del TIPO DE RETORNO, que también puede traer llaves:
  //   ): Promise<{ filas: Fila[]; total: number }> {
  // Se salta hasta la `{` que abre a nivel de línea, o sea la que no está
  // dentro de un `<...>` de genéricos.
  let ang = 0
  let desde = -1
  for (let j = i + 1; j < texto.length; j++) {
    const c = texto[j]
    if (c === '<') ang++
    else if (c === '>') ang--
    else if (c === '{' && ang <= 0) {
      desde = j
      break
    }
  }
  if (desde < 0) return null
  let prof = 0
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') prof++
    else if (texto[i] === '}') {
      prof--
      if (prof === 0) return texto.slice(desde, i + 1)
    }
  }
  return texto.slice(desde)
}

function resuelve(
  archivo: string,
  pool: string,
  clave: string,
  consume: string,
): { ok: boolean; grado: 'en_la_funcion' | 'en_el_archivo' } {
  if (!existsSync(archivo)) return { ok: false, grado: 'en_el_archivo' }
  const texto = readFileSync(archivo, 'utf8')
  const re = new RegExp(
    `parametro(?:<[^>]*>)?\\(\\s*'${pool}'\\s*,\\s*'${clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
  )
  const cuerpo = cuerpoDe(texto, consume)
  if (cuerpo) return { ok: re.test(cuerpo), grado: 'en_la_funcion' }
  return { ok: re.test(texto), grado: 'en_el_archivo' }
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
      identificadoresInexistentes: [],
      identificadoresDebiles: [],
      anclasQueNoCoinciden: [],
      identificadoresAmbiguos: [],
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
    identificadoresInexistentes: [] as string[],
    identificadoresDebiles: [] as string[],
    anclasQueNoCoinciden: [] as string[],
    identificadoresAmbiguos: [] as string[],
  }

  // ARRASTRE de v0.71: una brecha declarada NO es "sin declarar". Sin esto,
  // los tres que el código no implementa se contaban como huecos, que es
  // exactamente la mezcla que esta sesión vino a deshacer.
  if (p.brecha) {
    return {
      ...base,
      gobernado: false,
      estado: 'con_brecha',
      motivo: p.brecha,
    }
  }

  if (p.sin_consumo) {
    return {
      ...base,
      gobernado: false,
      estado: 'sin_consumo',
      motivo: `${p.sin_consumo.motivo} (${p.sin_consumo.verificado_por})`,
    }
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
      base.inexistentes.push(`${d.archivo} (${d.consume})`)
      continue
    }
    const etiqueta = `${d.archivo} (${d.consume})`

    // El identificador se verifica SIEMPRE, incluso en un `literal`: una
    // dependencia que nombra algo inexistente es falsa aunque no esté cableada.
    const ident = verificarIdentificador(d.archivo, d.consume, d.ancla)
    if (ident === 'no_existe') base.identificadoresInexistentes.push(etiqueta)
    else if (ident === 'ambiguo') base.identificadoresAmbiguos.push(etiqueta)
    else if (ident === 'verificado_debil') base.identificadoresDebiles.push(etiqueta)
    else if (ident === 'ancla_no_coincide') base.anclasQueNoCoinciden.push(etiqueta)

    if (d.via === 'literal') {
      base.faltan.push(etiqueta)
      continue
    }
    const r = d.via === 'resuelve' ? resuelve(d.archivo, poolClave, p.clave, d.consume) : null
    const ok = r ? r.ok : recibe(d.archivo, d.senal)
    if (ok) {
      base.verificados.push(
        `${etiqueta} · ${d.via}` + (r?.grado === 'en_el_archivo' ? ' (en el archivo, no en la función)' : ''),
      )
    }
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
  // Un identificador inexistente manda sobre el cableado: el manifiesto está
  // afirmando algo falso, y todo lo demás se apoya en él.
  if (base.identificadoresInexistentes.length > 0) {
    return {
      ...base,
      estado: 'parcial',
      motivo: `${base.identificadoresInexistentes.length} dependencia(s) nombran una función o constante que NO existe en el archivo declarado.`,
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
    /** Revisados y no consumidos: fuera del denominador de gobernados. */
    sinConsumo: revisiones.filter((r) => r.estado === 'sin_consumo').length,
    /** Declarados y no implementados por el código. Fuera del denominador. */
    conBrecha: revisiones.filter((r) => r.estado === 'con_brecha').length,
    /** Los tres estados del identificador, sin colapsar. */
    identificadores: {
      verificados: revisiones.reduce(
        (a, r) =>
          a +
          (r.verificados.length + r.faltan.length + r.desmentidos.length) -
          r.identificadoresInexistentes.length -
          r.identificadoresAmbiguos.length -
          r.identificadoresDebiles.length -
          r.anclasQueNoCoinciden.length,
        0,
      ),
      inexistentes: revisiones.reduce((a, r) => a + r.identificadoresInexistentes.length, 0),
      ambiguos: revisiones.reduce((a, r) => a + r.identificadoresAmbiguos.length, 0),
      /** Ciertos hoy, frágiles ante un reformateo. NO se suman a `verificados`. */
      debiles: revisiones.reduce((a, r) => a + r.identificadoresDebiles.length, 0),
      /** No se pudo verificar. Distinto de "está roto". */
      sinPoderVerificar: revisiones.reduce((a, r) => a + r.anclasQueNoCoinciden.length, 0),
    },
    /** Con dos fuentes vivas: no se cuentan como gobernados y son un problema. */
    conflictosDeFuente: conflictos.length,
    conflictos: conflictos.map((r) => `${r.poolClave}.${r.clave}`),
  }
}
