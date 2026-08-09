import {
  compararEnSombra,
  compararParametroEnSombra,
  obtenerDefinicion,
} from '@/lib/fabrica/lector'

/**
 * EL ÚNICO PUNTO EN QUE SOCIAL AHORRO LE PREGUNTA ALGO A LA FÁBRICA.
 *
 * Hasta v0.61 la fábrica leía Social Ahorro y nadie le preguntaba nada a ella.
 * Para que una declaración gobierne, algún punto tiene que consultarla, y eso
 * es inevitable. Lo que sí se puede elegir es que sea UNO SOLO, chico y
 * documentado, en vez de llamadas esparcidas por todo el código.
 *
 * ── LA GARANTÍA ────────────────────────────────────────────────────────────
 *
 * Esta función NUNCA lanza y NUNCA devuelve algo vacío. Si la fábrica no
 * responde, si el flag está apagado, si el manifiesto no existe o no valida:
 * devuelve el texto que estaba en el código. En el peor caso, la pantalla se ve
 * exactamente como antes de que la fábrica existiera.
 *
 * ── CÓMO SACAR LA FÁBRICA DE ACÁ ───────────────────────────────────────────
 *
 * Hay UN import arriba y dos funciones abajo. Borrando el import y reemplazando
 * cada cuerpo por `return enCodigo`, Social Ahorro compila y funciona sin la
 * carpeta `lib/fabrica/`. Está probado, no supuesto: ver docs/fabrica/FRONTERA.md.
 *
 * ── POR QUÉ SON DOS FUNCIONES Y NO DOS PUNTOS DE CONTACTO ──────────────────
 *
 * Desde v0.68 hay `tituloDePantalla` y `parametro`. Siguen siendo UN punto: el
 * mismo archivo, el mismo import, la misma garantía y el mismo fallback. Lo que
 * cambia es qué se pregunta, y eso tiene que ser explícito — un
 * `declaracion(aspecto, clave)` genérico haría que el llamador no sepa qué
 * garantía tiene.
 */

/**
 * El título de una pantalla.
 *
 * @param pool     Clave del pool que declara esta pantalla.
 * @param ruta     La ruta, tal como está declarada en el manifiesto.
 * @param enCodigo El título que el código usaría. Es también el fallback: si
 *                 algo falla, esto es lo que se devuelve.
 */
export async function tituloDePantalla(
  pool: string,
  ruta: string,
  enCodigo: string,
): Promise<string> {
  try {
    // En sombra esto compara y registra; en cualquier otro estado no hace nada.
    await compararEnSombra(pool, ruta, enCodigo)

    const def = await obtenerDefinicion(pool, 'pantallas')
    // `null` significa "usá lo tuyo": flag apagado, en sombra, o algo falló y
    // ya quedó registrado del lado de la fábrica.
    if (!def || def.aspecto !== 'pantallas') return enCodigo

    const declarado = def.titulos[ruta]
    // Una declaración sin esta pantalla no es motivo para dejar la cabecera en
    // blanco. Se usa el código, que es lo que se venía usando.
    return declarado && declarado.trim() ? declarado : enCodigo
  } catch {
    return enCodigo
  }
}

/**
 * El valor de un parámetro de configuración.
 *
 * ── LA DIFERENCIA CON UN TÍTULO, QUE NO ES MENOR ────────────────────────────
 *
 * Un título mal leído se ve feo. Un parámetro mal leído hace que el sistema se
 * comporte distinto sin que nadie lo note: se avisa un vencimiento tarde, o se
 * avisa siempre. Por eso el lector sólo devuelve los ponderados `inocuo` u
 * `operativo`, y los 14 `sensible` se declaran y no se leen.
 *
 * La garantía es la misma que en los títulos y por el mismo motivo: si la
 * fábrica no contesta, se usa `enCodigo`, que es el valor que el sector venía
 * usando. Nadie queda sin parámetro.
 *
 * @param pool     Clave del pool que declara este parámetro.
 * @param clave    La clave del parámetro, tal como está declarada.
 * @param enCodigo El valor que el código usaría. Es también el fallback.
 */
export async function parametro<T>(pool: string, clave: string, enCodigo: T): Promise<T> {
  try {
    // En sombra compara y registra; en cualquier otro estado no hace nada.
    await compararParametroEnSombra(pool, clave, enCodigo)

    const def = await obtenerDefinicion(pool, 'parametros')
    if (!def || def.aspecto !== 'parametros') return enCodigo

    const declarado = def.valores[clave]
    // Ausente puede significar dos cosas: que no está declarado, o que está
    // declarado como `sensible` y el lector no lo devuelve. En las dos, el valor
    // del código es la respuesta correcta.
    if (declarado === undefined || declarado === null) return enCodigo

    // Y el tipo tiene que coincidir. Un número que llega como texto porque
    // alguien escribió "30" en un jsonb no se convierte en silencio: se usa el
    // del código. Convertir sería adivinar, y adivinar sobre un parámetro es
    // cambiar el comportamiento sin que nadie lo haya pedido.
    if (typeof declarado !== typeof enCodigo) return enCodigo

    return declarado as T
  } catch {
    return enCodigo
  }
}
