/**
 * LA CODIFICACIÓN DE LOS ARCHIVOS DE SIFACO.
 *
 * ── QUÉ ESTÁ ROTO ───────────────────────────────────────────────────────────
 *
 * Los .xls de SIFACO declaran code page 1252, pero los bytes vienen de un
 * sistema DOS. Leídos como 1252 se ven así:
 *
 *     l¡quido · UNG├£ENTO · 7┬¢ · c†ps. · Psicotr¢pico
 *
 * Si eso entra al catálogo, entra para siempre: las 46.000 descripciones
 * quedan con esos caracteres, y el matching por descripción del motor de
 * documentos deja de encontrarlas. No es cosmético.
 *
 * ── POR QUÉ SE PRUEBA Y NO SE ASUME ─────────────────────────────────────────
 *
 * Las muestras de arriba no son consistentes entre sí: 'l¡quido' se explica con
 * CP437 leído como 1252 (0xA1 es 'í' en 437), pero 'UNG├£ENTO' se explica con
 * UTF-8 leído como 437 (los bytes C3 9C de 'Ü' dan '├£'). Un archivo puede
 * tener las dos cosas si pasó por más de una capa.
 *
 * Entonces esto no decide de antemano: prueba cada arreglo candidato sobre el
 * texto real y se queda con el que produce más palabras del castellano que
 * sabemos que están ahí. Y deja escrito cuál ganó y con qué puntaje, que es lo
 * que se reporta.
 *
 * ── UNA SOLA FUNCIÓN ────────────────────────────────────────────────────────
 *
 * Todo el arreglo de codificación del proyecto pasa por `arreglarTexto`. No hay
 * lógica de esto repartida en el importador: si aparece un caso nuevo, se
 * agrega un candidato acá y se vuelve a correr la verificación.
 */

/** Lo que sabemos que dice el archivo, en castellano. */
export const PALABRAS_TESTIGO = [
  'líquido',
  'ungüento',
  'psicotrópico',
  'cápsulas',
  'solución',
] as const

/**
 * Los arreglos posibles. Cada uno toma el texto tal como lo entregó el lector
 * de .xls y devuelve lo que sería si los bytes se hubieran interpretado bien.
 *
 * `mojibake` es el caso clásico: el texto que tenemos son caracteres cuyo
 * code point es el byte original. Se recuperan los bytes y se decodifican con
 * la codificación correcta.
 */
export type CandidatoCodificacion = {
  nombre: string
  descripcion: string
  arreglar: (texto: string) => string
}

/** Los caracteres del texto son bytes disfrazados: los recupera. */
function aBytes(texto: string): Uint8Array | null {
  const out = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    if (c > 0xff) return null // no era un byte disfrazado
    out[i] = c
  }
  return out
}

function decodificar(bytes: Uint8Array, etiqueta: string): string | null {
  try {
    return new TextDecoder(etiqueta, { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * CP437 y CP850 no vienen en TextDecoder de Node ni del navegador. Las dos
 * tablas de la mitad alta, escritas a mano, que es la única forma: no hay de
 * dónde consultarlas en tiempo de ejecución.
 */
const ALTA_437 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

const ALTA_850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ '

function decodificarDos(bytes: Uint8Array, alta: string): string {
  let s = ''
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : alta[b - 0x80]
  return s
}

export const CANDIDATOS: CandidatoCodificacion[] = [
  {
    nombre: 'tal-cual',
    descripcion: 'el texto ya está bien y no hay nada que arreglar',
    arreglar: (t) => t,
  },
  {
    nombre: 'cp437-leido-como-1252',
    descripcion: 'bytes de DOS (CP437) interpretados como Windows-1252',
    arreglar: (t) => {
      const b = aBytes(t)
      return b ? decodificarDos(b, ALTA_437) : t
    },
  },
  {
    nombre: 'cp850-leido-como-1252',
    descripcion: 'bytes de DOS latino (CP850) interpretados como Windows-1252',
    arreglar: (t) => {
      const b = aBytes(t)
      return b ? decodificarDos(b, ALTA_850) : t
    },
  },
  {
    nombre: 'utf8-leido-como-1252',
    descripcion: 'bytes UTF-8 interpretados como Windows-1252 (el mojibake clásico)',
    arreglar: (t) => {
      const b = aBytes(t)
      if (!b) return t
      return decodificar(b, 'utf-8') ?? t
    },
  },
  {
    nombre: 'utf8-leido-como-cp437',
    descripcion: 'bytes UTF-8 interpretados como CP437 — explica UNG├£ENTO',
    arreglar: (t) => {
      // El texto trae caracteres de CP437; hay que volver a los bytes y leerlos
      // como UTF-8. Se invierte la tabla alta.
      const bytes: number[] = []
      for (const ch of t) {
        const c = ch.charCodeAt(0)
        if (c < 0x80) { bytes.push(c); continue }
        const i = ALTA_437.indexOf(ch)
        if (i < 0) return t // un carácter que CP437 no puede haber producido
        bytes.push(i + 0x80)
      }
      return decodificar(Uint8Array.from(bytes), 'utf-8') ?? t
    },
  },
]

/**
 * Caracteres que no tienen nada que hacer en una descripción de producto en
 * castellano. Si quedan después de aplicar el ganador, el arreglo fue parcial.
 *
 * Esto existe porque las muestras del relevamiento no se explican todas con la
 * misma capa de daño: 'l¡quido' sale con CP437-leído-como-1252 y 'UNG├£ENTO'
 * sale con UTF-8-leído-como-CP437. Un archivo que pasó por dos conversiones
 * tiene las dos cosas, y un detector que elige un solo ganador y se calla deja
 * la mitad rota diciendo que terminó.
 */
const SOSPECHOSOS = /[─-╿†‡¢¦­�]/g

export interface Veredicto {
  /** El candidato que ganó. */
  codificacion: string
  descripcion: string
  /** Cuántas palabras testigo aparecen con cada candidato. */
  puntajes: Record<string, number>
  /** Muestras antes y después, para poder mirarlo. */
  muestras: { antes: string; despues: string }[]
  /**
   * `false` cuando ningún candidato encontró una sola palabra testigo. No
   * significa que el archivo esté bien: significa que esto no lo pudo
   * verificar, y hay que mirar las muestras antes de guardar nada.
   */
  verificado: boolean
  /**
   * Cuántos textos siguen teniendo caracteres imposibles DESPUÉS del arreglo, y
   * una muestra. Si esto no es cero, el ganador arregló una capa de daño y hay
   * otra abajo: no se guarda hasta mirarlo.
   */
  residuo: { filas: number; muestra: string[] }
}

/** Cuántas palabras testigo aparecen en un texto (sin distinguir mayúsculas). */
function puntuar(textos: string[]): number {
  const junto = textos.join('\n').toLowerCase()
  let n = 0
  for (const p of PALABRAS_TESTIGO) {
    // Sin acentos no cuenta: la gracia es justamente que el acento esté bien.
    if (junto.includes(p)) n++
  }
  return n
}

/**
 * Decide la codificación mirando el texto, no el encabezado del archivo.
 *
 * Se le pasa una muestra grande de descripciones (cuantas más, mejor: con 2.000
 * filas ya aparecen las cinco palabras). Devuelve el candidato ganador y el
 * puntaje de todos, que es lo que se guarda en `codificacion_prueba` y se
 * reporta.
 */
export function detectarCodificacion(textos: string[]): Veredicto {
  const puntajes: Record<string, number> = {}
  let mejor = CANDIDATOS[0]
  let mejorPuntaje = -1

  for (const c of CANDIDATOS) {
    const arreglados = textos.map((t) => (typeof t === 'string' ? c.arreglar(t) : ''))
    const p = puntuar(arreglados)
    puntajes[c.nombre] = p
    if (p > mejorPuntaje) { mejorPuntaje = p; mejor = c }
  }

  // Muestras: las primeras filas donde el arreglo cambió algo.
  const muestras: { antes: string; despues: string }[] = []
  for (const t of textos) {
    if (muestras.length >= 8) break
    if (typeof t !== 'string' || !t) continue
    const d = mejor.arreglar(t)
    if (d !== t) muestras.push({ antes: t, despues: d })
  }

  // ¿Quedó daño abajo del que arreglamos?
  const conResiduo: string[] = []
  let filasConResiduo = 0
  for (const t of textos) {
    if (typeof t !== 'string' || !t) continue
    const d = mejor.arreglar(t)
    SOSPECHOSOS.lastIndex = 0
    if (SOSPECHOSOS.test(d)) {
      filasConResiduo++
      if (conResiduo.length < 8) conResiduo.push(d)
    }
  }

  return {
    codificacion: mejor.nombre,
    descripcion: mejor.descripcion,
    puntajes,
    muestras,
    verificado: mejorPuntaje > 0,
    residuo: { filas: filasConResiduo, muestra: conResiduo },
  }
}

/** El arreglo elegido, aplicado a un valor cualquiera. Es la única puerta. */
export function arreglarTexto(valor: unknown, codificacion: string): string | null {
  if (valor === null || valor === undefined) return null
  const t = String(valor)
  if (!t) return null
  const c = CANDIDATOS.find((x) => x.nombre === codificacion) ?? CANDIDATOS[0]
  return c.arreglar(t).trim() || null
}
