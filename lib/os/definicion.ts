import { compararEnSombra, obtenerDefinicion } from '@/lib/fabrica/lector'

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
 * Hay UN import arriba y DOS usos abajo. Borrando el import y reemplazando el
 * cuerpo por `return enCodigo`, Social Ahorro compila y funciona sin la
 * carpeta `lib/fabrica/`. Está probado, no supuesto: ver docs/fabrica/FRONTERA.md.
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
    if (!def) return enCodigo

    const declarado = def.titulos[ruta]
    // Una declaración sin esta pantalla no es motivo para dejar la cabecera en
    // blanco. Se usa el código, que es lo que se venía usando.
    return declarado && declarado.trim() ? declarado : enCodigo
  } catch {
    return enCodigo
  }
}
