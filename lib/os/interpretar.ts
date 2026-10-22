/**
 * QUÉ QUISO DECIR LO QUE SE ESCRIBIÓ EN LA BARRA.
 *
 * ── LOS CUATRO TIPOS DE RESULTADO ───────────────────────────────────────────
 *
 *   cosa      un producto, un proveedor, una sucursal. Lleva a su ficha.
 *   accion    «pagar a Del Sud» hace eso, no busca la palabra «pagar».
 *   regla     «pedime para 1 mes» CAMBIA cómo funciona el sistema.
 *   pregunta  lo que no se entiende se lo lleva NORA.
 *
 * ── Y UN QUINTO QUE NO ES UN RESULTADO ──────────────────────────────────────
 *
 *   bloqueado  lo que la constitución no deja. Aparece EN EL MISMO LUGAR donde
 *              aparecería la acción, no en un error aparte: alguien que escribe
 *              «cambiar precio» tiene que leer por qué no se puede ahí mismo,
 *              no descubrirlo después de apretar.
 *
 * ── POR QUÉ ESTO NO ES UN MODELO DE LENGUAJE ────────────────────────────────
 *
 * Es un emparejador de frases contra una lista declarada. Un modelo que
 * interpreta «pedime para 1 mes» y cambia un parámetro sin que nadie revise la
 * lista de parámetros que puede tocar es un modelo con permiso de escritura
 * sobre la configuración. Lo que no está en esta lista, no se cambia — y se
 * ofrece preguntárselo a NORA, que contesta sin escribir.
 */

export type TipoDeResultado = 'cosa' | 'accion' | 'regla' | 'pregunta' | 'bloqueado'

export interface CambioDeRegla {
  /** El parámetro de `compras_parametros` que se toca. */
  clave: string
  valor: string
  /** Qué cambia, en castellano, para mostrarlo antes de hacerlo. */
  queCambia: string
  /** El valor anterior se completa al ejecutar, para poder deshacer. */
  unidad: string
}

export interface Interpretacion {
  tipo: TipoDeResultado
  titulo: string
  detalle?: string
  /** Para `accion`: a dónde va. */
  ruta?: string
  /** Para `regla`: qué se cambia. */
  cambio?: CambioDeRegla
  /** Para `bloqueado`: por qué no se puede. */
  porQueNo?: string
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Las frases que CAMBIAN cómo funciona el sistema.
 *
 * Cada una toca un parámetro declarado y nada más. El valor se saca de la
 * frase con una expresión: «pedime para 2 meses» pone 2, no un número fijo.
 */
const REGLAS: {
  prueba: RegExp
  clave: string
  unidad: string
  queCambia: (v: string) => string
}[] = [
  {
    prueba: /ped[ií](?:me|r)?\s+(?:para\s+)?(\d+(?:[.,]\d+)?)\s*mes/,
    clave: 'cobertura_objetivo_meses',
    unidad: 'meses',
    queCambia: (v) => `El plan de compra va a pedir para ${v} mes(es) de venta en vez de lo que pide hoy. ` +
      'Cambia cuántas unidades sugiere de cada producto y, con eso, la plata del pedido.',
  },
  {
    prueba: /sobre?stock\s+(?:a|desde)\s+(\d+(?:[.,]\d+)?)\s*mes/,
    clave: 'cobertura_sobrestock_meses',
    unidad: 'meses',
    queCambia: (v) => `A partir de ${v} mes(es) de cobertura un producto se va a considerar sobrestock. ` +
      'Cambia qué aparece en la lista de «no comprar».',
  },
  {
    prueba: /(?:tasa|rinde)\s+(?:a\s+)?(\d+(?:[.,]\d+)?)\s*%/,
    clave: 'tasa_mensual_pct',
    unidad: '% mensual',
    queCambia: (v) => `La plata va a valer ${v}% por mes en el comparador de pago. ` +
      'Cambia si conviene pagar contado con descuento o a plazo.',
  },
  {
    prueba: /(?:maestro|archivo)\s+viejo\s+(?:a|en)\s+(\d+)\s*d/,
    clave: 'dias_maestro_viejo',
    unidad: 'dias',
    queCambia: (v) => `NORA va a avisar que la foto de stock está vieja a los ${v} días en vez de a los de hoy.`,
  },
  {
    prueba: /impago\s+(?:a|en)\s+(\d+)\s*d/,
    clave: 'dias_impago',
    unidad: 'dias',
    queCambia: (v) => `Un comprobante va a pasar de «vencido» a «impago» a los ${v} días del vencimiento.`,
  },
]

/**
 * Lo que la constitución no deja, reconocido por la frase.
 *
 * No alcanza con que la acción no exista: alguien que escribe «cambiar el
 * precio de la amoxicilina» tiene que leer POR QUÉ no se puede, no un «no
 * encontré nada» que parece un problema de búsqueda.
 */
const PROHIBIDO: { prueba: RegExp; titulo: string; porQue: string }[] = [
  {
    prueba: /cambiar?\s+(?:el\s+)?precio|subir?\s+(?:el\s+)?precio|bajar?\s+(?:el\s+)?precio|poner?\s+(?:el\s+)?precio/,
    titulo: 'Cambiar un precio de venta',
    porQue: 'SIFACO es la autoridad del precio (regla de oro 1). Un precio que NORA cambia sola es un ' +
      'precio que el mostrador no sabe que cambió. Se cambia en SIFACO, y NORA exporta la lista para subirla.',
  },
  {
    prueba: /pagar\s+(?:todo|sin|automat)|pago\s+automat/,
    titulo: 'Pagar sin que lo firme una persona',
    porQue: 'Regla de oro 7: retiros de fondo sólo con aprobación, todo trazado. NORA arma la tanda de ' +
      'pagos y la aprueba alguien.',
  },
  {
    prueba: /receta|paciente|psicotr[oó]pic|estupefacient/,
    titulo: 'Tocar datos de receta, paciente o controlado',
    porQue: 'Terreno legal-farmacéutico (regla de oro 9). No es una decisión comercial y no pasa por acá.',
  },
]

/** Las acciones que la barra puede ejecutar, declaradas. */
const ACCIONES: { prueba: RegExp; titulo: string; ruta: string }[] = [
  { prueba: /^(?:pagar|pago)\s+/, titulo: 'Armar un pago a proveedor', ruta: '/admin/finanzas/pagos' },
  { prueba: /^(?:comprar|pedido|pedir)\b/, titulo: 'Ir al plan de compra', ruta: '/admin/compras/plan' },
  { prueba: /^(?:transferir|mover)\b/, titulo: 'Mover stock entre sucursales', ruta: '/admin/operaciones/sucursales' },
  { prueba: /^(?:cerrar|cierre)\s+(?:la\s+)?caja/, titulo: 'Cerrar la caja', ruta: '/admin/finanzas/caja' },
  { prueba: /^(?:controlar|control)\s+(?:la\s+)?caja/, titulo: 'Controlar la caja del día', ruta: '/admin/finanzas/caja/control' },
  { prueba: /^(?:recibir|lleg[oó])\b/, titulo: 'Registrar mercadería que llegó', ruta: '/admin/recepciones/nueva' },
  { prueba: /^(?:importar|subir)\s+(?:el\s+)?maestro/, titulo: 'Importar el maestro de SIFACO', ruta: '/admin/operaciones/sifaco' },
  { prueba: /^repartir?\b/, titulo: 'Repartir las tareas del turno', ruta: '/admin/tareas/turno' },
]

/**
 * Interpreta lo escrito. Devuelve TODAS las lecturas posibles, no una:
 * «pagar» puede ser una acción y además el nombre de un proveedor.
 */
export function interpretar(texto: string): Interpretacion[] {
  const t = norm(texto)
  if (t.length < 2) return []
  const out: Interpretacion[] = []

  // El bloqueo va primero: si lo que se pide no se puede, eso es lo que hay
  // que leer antes que cualquier otra cosa.
  for (const p of PROHIBIDO) {
    if (p.prueba.test(t)) {
      out.push({ tipo: 'bloqueado', titulo: p.titulo, porQueNo: p.porQue })
    }
  }

  for (const r of REGLAS) {
    const m = t.match(r.prueba)
    if (m) {
      const valor = m[1].replace(',', '.')
      out.push({
        tipo: 'regla',
        titulo: `Cambiar cómo funciona: ${r.clave.replace(/_/g, ' ')} → ${valor}`,
        detalle: r.queCambia(valor),
        cambio: { clave: r.clave, valor, unidad: r.unidad, queCambia: r.queCambia(valor) },
      })
    }
  }

  for (const a of ACCIONES) {
    if (a.prueba.test(t)) out.push({ tipo: 'accion', titulo: a.titulo, ruta: a.ruta })
  }

  return out
}
