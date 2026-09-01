import type {
  ConectorDeCanal, ProductoDelCanal, CambioDePrecio, ResultadoDeEnvio, ReglasDelCanal,
} from './conector'

/**
 * MERCADO LIBRE — ESCRITO, NO CONECTADO.
 *
 * ── POR QUÉ EXISTE SI NO SE USA ─────────────────────────────────────────────
 *
 * Es la prueba del modelo. Si agregar un segundo canal obligara a tocar el
 * conector de WooCommerce, o el cálculo de precio, o el espejo, el modelo del
 * bloque A estaría mal. Este archivo compila sin haber cambiado una línea de
 * los otros — ésa es la verificación, y el resultado va en el reporte.
 *
 * ── LO QUE FALTA PARA CONECTARLO ────────────────────────────────────────────
 *
 * Está declarado abajo en `faltaParaConectar`, como dato y no como comentario,
 * para que la pantalla lo pueda mostrar.
 *
 * Lo que ML tiene y Woo no: catálogo propio con estructura fija, atributos
 * obligatorios POR CATEGORÍA, publicaciones con variantes, y reglas de qué se
 * puede vender. Esas reglas, en la parte que nos toca, **ya están cubiertas por
 * la regla de oro 9**: nada con receta ni controlado sale por un canal abierto.
 * ML además prohíbe medicamentos de venta bajo receta, así que las dos reglas
 * apuntan al mismo lado.
 */
export class ConectorMercadoLibre implements ConectorDeCanal {
  readonly id = 'meli'
  readonly nombre = 'Mercado Libre'

  readonly reglas: ReglasDelCanal = {
    loteMaximo: 20,
    porMinuto: 100,
    atributosObligatorios: ['BRAND', 'MODEL', 'GTIN', 'ITEM_CONDITION', 'PACKAGE_LENGTH'],
    prohibidoAdemas: [
      'medicamentos de venta bajo receta',
      'productos que requieran cadena de frío sin envío propio',
    ],
    faltaParaConectar: [
      'Credenciales: APP_ID, SECRET y el refresh token del OAuth de ML',
      'El mapeo de nuestras categorías contra las de ML, que son un árbol propio',
      'Los atributos obligatorios por categoría: ML rechaza la publicación si falta uno',
      'Confirmar la comisión REAL por categoría — el 13% es un orden de magnitud, no un dato',
      'Definir quién paga el envío y cómo entra Mercado Envíos',
    ],
  }

  configurado(): boolean {
    return Boolean(process.env.MELI_APP_ID && process.env.MELI_REFRESH_TOKEN)
  }

  async *leerPublicaciones(): AsyncGenerator<ProductoDelCanal[]> {
    if (!this.configurado()) return
    // Sin credenciales no hay nada que leer, y no se inventa una respuesta.
  }

  async aplicarPrecios(cambios: CambioDePrecio[]): Promise<ResultadoDeEnvio[]> {
    return cambios.map((c) => ({
      externoId: c.externoId,
      ok: false,
      error: 'Mercado Libre todavía no está conectado. Faltan las credenciales y el mapeo de categorías.',
    }))
  }

  traducirError(codigo: string | number, mensaje: string): string {
    const c = String(codigo)
    if (c === '401' || c === '403') return 'Mercado Libre rechazó las credenciales. Hay que renovar el token.'
    if (c === '429') return 'Mercado Libre pidió esperar: se mandaron demasiados cambios seguidos.'
    if (/attribute/i.test(mensaje)) return 'Falta un atributo que Mercado Libre exige para esa categoría.'
    return `Mercado Libre no aceptó el cambio. Lo que contestó: ${mensaje.slice(0, 140)}`
  }
}
