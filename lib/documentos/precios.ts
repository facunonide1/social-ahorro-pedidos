/**
 * Cálculo de precios de una línea de documento comercial argentino.
 *
 * El punto central: **el precio unitario del renglón significa cosas distintas
 * según la letra del comprobante**. En una factura A el IVA va discriminado y
 * el renglón es neto; en una B o C el IVA viene adentro del precio. Guardar el
 * mismo número en `precio_neto` y `precio_con_iva` haría que el comparador
 * mienta cada vez que se comparen proveedores que facturan con letras distintas.
 */

export type AlicuotaPie = { alicuota: number; base: number | null; importe: number | null }
export type PercepcionPie = { tipo: string | null; importe: number | null }

export type TotalesDoc = {
  neto_gravado?: number | null
  neto_no_gravado?: number | null
  exento?: number | null
  iva_por_alicuota?: AlicuotaPie[] | null
  percepciones_detalle?: PercepcionPie[] | null
  bonificaciones?: number | null
  subtotal?: number | null
  descuentos?: number | null
  impuestos?: number | null
  percepciones?: number | null
  total?: number | null
}

/**
 * ¿El precio del renglón viene sin IVA?
 *
 * A y M discriminan IVA (el renglón es neto). B y C lo traen adentro. Ante una
 * letra que no se leyó, se asume A: es lo que emiten las droguerías a un
 * responsable inscripto, que es el caso de esta cadena.
 */
export function ivaDiscriminado(letra: string | null | undefined): boolean {
  const l = (letra ?? '').trim().toUpperCase()
  if (l === 'B' || l === 'C') return false
  return true
}

export type OrigenAlicuota = 'linea' | 'pie_unica' | 'pie_promedio' | 'desconocida'

export type AlicuotaResuelta = {
  alicuota: number | null
  origen: OrigenAlicuota
  /** Cuánto confiar en ella. Se muestra al revisar. */
  confianza: number | null
}

/**
 * De dónde sale la alícuota de una línea.
 *
 * En las facturas de droguería el IVA casi nunca está renglón por renglón: está
 * en el cuadro de totales del pie. Por eso:
 *
 * 1. Si la línea la trae, se usa esa y listo.
 * 2. Si el pie declara UNA sola alícuota, se aplica a todas las líneas: es una
 *    inferencia segura, no un invento.
 * 3. Si el pie declara VARIAS (21% y 10,5% conviven seguido: medicamentos al
 *    10,5 y perfumería al 21), no hay forma de saber cuál va a cada renglón. Se
 *    calcula la alícuota efectiva promedio, se marca como prorrateada y se pide
 *    revisión. Adivinar acá desbalancea el costo de cada producto.
 * 4. Si no hay nada, null y confianza nula. Nunca se inventa un número.
 */
export function resolverAlicuota(
  alicuotaLinea: number | null | undefined,
  totales: TotalesDoc | null | undefined,
): AlicuotaResuelta {
  if (alicuotaLinea != null && Number.isFinite(alicuotaLinea)) {
    return { alicuota: Number(alicuotaLinea), origen: 'linea', confianza: 1 }
  }

  const porAlicuota = (totales?.iva_por_alicuota ?? []).filter(
    (a) => a && Number.isFinite(a.alicuota) && Number(a.alicuota) > 0,
  )

  if (porAlicuota.length === 1) {
    return { alicuota: Number(porAlicuota[0].alicuota), origen: 'pie_unica', confianza: 0.85 }
  }

  if (porAlicuota.length > 1) {
    const base = porAlicuota.reduce((a, x) => a + (Number(x.base) || 0), 0)
    const imp = porAlicuota.reduce((a, x) => a + (Number(x.importe) || 0), 0)
    if (base > 0 && imp > 0) {
      return { alicuota: +((imp / base) * 100).toFixed(3), origen: 'pie_promedio', confianza: 0.4 }
    }
  }

  // Último recurso: un solo importe de IVA contra el neto gravado.
  const neto = Number(totales?.neto_gravado) || 0
  const iva = Number(totales?.impuestos) || 0
  if (neto > 0 && iva > 0) {
    return { alicuota: +((iva / neto) * 100).toFixed(3), origen: 'pie_promedio', confianza: 0.5 }
  }

  return { alicuota: null, origen: 'desconocida', confianza: null }
}

export type PreciosLinea = {
  /** Sin IVA. */
  precioNeto: number | null
  /** Con IVA. */
  precioConIva: number | null
}

/**
 * Calcula los dos precios de una línea a partir de lo que se leyó.
 *
 * Los dos se guardan siempre: cuál se usa para comparar es una decisión del
 * negocio que todavía no está tomada, y sin ambos no se puede reconstruir
 * después.
 *
 * Las percepciones NO entran acá. No son costo del producto: son un pago a
 * cuenta de un impuesto del comprador. Prorratearlas en el precio del renglón
 * inflaría el costo y rompería todos los márgenes.
 */
export function calcularPreciosLinea(args: {
  precioUnitario: number | null | undefined
  descuentoPct?: number | null
  alicuota: number | null | undefined
  ivaDiscriminado: boolean
}): PreciosLinea {
  const pu = Number(args.precioUnitario)
  if (!Number.isFinite(pu)) return { precioNeto: null, precioConIva: null }

  const desc = Number(args.descuentoPct)
  const conDesc = Number.isFinite(desc) && desc > 0 ? pu * (1 - desc / 100) : pu

  const ali = Number(args.alicuota)
  const tieneAli = Number.isFinite(ali) && ali >= 0

  if (args.ivaDiscriminado) {
    // El renglón ya es neto.
    return {
      precioNeto: red4(conDesc),
      precioConIva: tieneAli ? red4(conDesc * (1 + ali / 100)) : null,
    }
  }

  // B/C: el renglón trae el IVA adentro; se le saca para obtener el neto.
  return {
    precioNeto: tieneAli ? red4(conDesc / (1 + ali / 100)) : null,
    precioConIva: red4(conDesc),
  }
}

function red4(n: number): number {
  return +n.toFixed(4)
}

// ── Desglose de la diferencia ────────────────────────────────────────────────

export type ParteDesglose = { concepto: string; monto: number }

export type Desglose = {
  sumaLineas: number
  total: number
  diferencia: number
  partes: ParteDesglose[]
  /** Lo que no explica ningún concepto conocido. Es lo único preocupante. */
  sinExplicar: number
  cuadra: boolean
}

/**
 * Explica por qué los renglones no suman el total.
 *
 * Decir "hay $261.232 de diferencia" no ayuda a nadie. Decir "el IVA explica
 * $228.578, las percepciones $32.654, y no queda nada sin explicar" convierte
 * un susto en una confirmación de que la lectura estuvo bien.
 */
export function desglosarDiferencia(sumaLineas: number, totales: TotalesDoc | null | undefined): Desglose {
  const total = Number(totales?.total) || 0
  const diferencia = +(total - sumaLineas).toFixed(2)
  const partes: ParteDesglose[] = []

  const porAlicuota = (totales?.iva_por_alicuota ?? []).filter((a) => a && Number(a.importe))
  if (porAlicuota.length) {
    for (const a of porAlicuota) {
      partes.push({ concepto: `IVA ${a.alicuota}%`, monto: Number(a.importe) || 0 })
    }
  } else if (Number(totales?.impuestos)) {
    partes.push({ concepto: 'IVA', monto: Number(totales!.impuestos) })
  }

  const perc = (totales?.percepciones_detalle ?? []).filter((p) => p && Number(p.importe))
  if (perc.length) {
    for (const p of perc) {
      partes.push({ concepto: `Percepción ${p.tipo ?? ''}`.trim(), monto: Number(p.importe) || 0 })
    }
  } else if (Number(totales?.percepciones)) {
    partes.push({ concepto: 'Percepciones', monto: Number(totales!.percepciones) })
  }

  // Bonificaciones y descuentos al pie restan.
  const bonif = Number(totales?.bonificaciones) || 0
  if (bonif) partes.push({ concepto: 'Bonificaciones al pie', monto: -Math.abs(bonif) })
  const descPie = Number(totales?.descuentos) || 0
  if (descPie) partes.push({ concepto: 'Descuentos al pie', monto: -Math.abs(descPie) })

  const explicado = partes.reduce((a, p) => a + p.monto, 0)
  const sinExplicar = +(diferencia - explicado).toFixed(2)

  // Un peso arriba o abajo es redondeo del papel, no un error de lectura.
  const tolerancia = Math.max(1, Math.abs(total) * 0.005)

  return {
    sumaLineas: +sumaLineas.toFixed(2),
    total,
    diferencia,
    partes,
    sinExplicar,
    cuadra: Math.abs(sinExplicar) <= tolerancia,
  }
}
