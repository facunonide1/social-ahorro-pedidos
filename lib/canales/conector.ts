/**
 * EL CONTRATO DE UN CANAL DE VENTA.
 *
 * ── LA PRUEBA DEL MODELO ────────────────────────────────────────────────────
 *
 * Si agregar Mercado Libre obliga a tocar algo fuera de su propio conector, el
 * modelo está mal. Por eso el conector de ML se escribe ahora —aunque no se
 * conecte— y se verifica que compile sin cambiar una línea del de Woo.
 *
 * ── VOCABULARIO NEUTRO ──────────────────────────────────────────────────────
 *
 * Acá no aparece la palabra «woo». Un canal es un lugar donde se vende que no
 * es el mostrador; WooCommerce y Mercado Libre son dos casos. Escrito así, esta
 * pieza es exactamente lo que el catálogo de la fábrica necesita como pool
 * externo.
 *
 * ── LO QUE EL CONTRATO NO PERMITE ───────────────────────────────────────────
 *
 * No hay método para «publicar todo». Publicar es una acción que compromete y
 * pasa por una persona: el conector recibe una lista ya aprobada.
 */

export interface ProductoDelCanal {
  externoId: string
  sku: string | null
  barras: string | null
  nombre: string | null
  precio: number | null
  stock: number | null
  gestionaStock: boolean
  /** El del canal, sin traducir. La traducción a castellano es de NORA. */
  estado: string | null
  permalink: string | null
}

export interface ResultadoDeEnvio {
  externoId: string
  ok: boolean
  /** El error YA TRADUCIDO. NORA nunca muestra un código técnico del canal. */
  error?: string
}

export interface CambioDePrecio {
  externoId: string
  sku: string | null
  precioAnterior: number | null
  precioNuevo: number
}

/**
 * Lo propio de cada canal, declarado como DATO y no como código: comisión,
 * atributos obligatorios, qué no se puede vender, límites de la API.
 */
export interface ReglasDelCanal {
  /** Cuántas publicaciones por request admite. */
  loteMaximo: number
  /** Cuántos requests por minuto tolera antes de cortar. */
  porMinuto: number
  /** Campos que el canal exige y NORA tiene que poder llenar. */
  atributosObligatorios: string[]
  /** Lo que este canal prohíbe, ADEMÁS del filtro legal que nunca se negocia. */
  prohibidoAdemas: string[]
  /** Qué falta para poder conectarlo. Vacío = está listo. */
  faltaParaConectar: string[]
}

export interface ConectorDeCanal {
  readonly id: string
  readonly nombre: string
  readonly reglas: ReglasDelCanal

  /** ¿Están las credenciales? No conecta: sólo mira si puede. */
  configurado(): boolean

  /** Lee lo que HAY publicado. Sólo lectura: no modifica nada allá. */
  leerPublicaciones(): AsyncGenerator<ProductoDelCanal[]>

  /**
   * Aplica cambios de precio YA APROBADOS por una persona.
   *
   * Idempotente POR PRODUCTO, no por tanda: un canal puede fallar a la mitad, y
   * el reintento no puede volver a mandar lo que ya fue.
   */
  aplicarPrecios(cambios: CambioDePrecio[]): Promise<ResultadoDeEnvio[]>

  /** Traduce un error del canal a castellano, con qué hacer. */
  traducirError(codigo: string | number, mensaje: string): string
}
