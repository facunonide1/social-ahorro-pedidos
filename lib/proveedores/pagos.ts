/**
 * PAGAR A UN PROVEEDOR.
 *
 * ── UN PAGO CUBRE VARIAS FACTURAS ───────────────────────────────────────────
 *
 * Y una factura se paga en partes. Es lo que más pasa: Asopro y Americana
 * mandan un resumen con decenas de facturas y se paga todo junto — 315 casos
 * sólo en el archivo de Guzmán. Por eso la aplicación del pago a las facturas
 * es una lista, no un campo.
 *
 * ── Y EL PAGO EN EFECTIVO ES UN RETIRO DE FONDO ─────────────────────────────
 *
 * Regla de oro 7: sale de la caja, necesita aprobación del dueño y queda
 * trazado. No es un detalle contable — es plata que sale de un cajón y tiene
 * que aparecer en el arqueo de esa caja, o el arqueo va a dar diferencia y
 * alguien va a pensar que falta.
 *
 * Por eso el movimiento de caja se crea en estado `pendiente_aprobacion` y el
 * pago queda en `solicitado`: NORA prepara, una persona confirma.
 */

type Adm = { from: (t: string) => any }

export interface AplicacionAFactura {
  factura_id: string
  monto: number
}

export interface PagoEntrante {
  proveedor_id: string
  fecha_pago: string
  metodo: 'transferencia' | 'cheque' | 'echeq' | 'efectivo' | 'tarjeta' | 'nota_credito' | 'otro'
  monto_total: number
  sucursal_id?: string | null
  /** Cuando sale de la caja del día: el nombre con el que la llaman. */
  caja_nombre?: string | null
  resumen_numero?: string | null
  observaciones?: string | null
  aplicaciones: AplicacionAFactura[]
}

export interface ResultadoPago {
  pago_id: string
  aplicado: number
  facturas: number
  /** El retiro de fondo, si el pago salió de la caja. Queda esperando aprobación. */
  caja_movimiento_id: string | null
  espera_aprobacion: boolean
}

export async function registrarPago(
  adm: Adm,
  p: PagoEntrante,
  userId: string | null,
): Promise<{ ok: true; pago: ResultadoPago } | { ok: false; error: string }> {
  if (!p.proveedor_id) return { ok: false, error: 'Falta el proveedor.' }
  if (!(p.monto_total > 0)) return { ok: false, error: 'El monto tiene que ser mayor a cero.' }

  const aplic = (p.aplicaciones ?? []).filter((a) => a.factura_id && a.monto > 0)
  const aplicado = aplic.reduce((a, x) => a + x.monto, 0)
  if (aplicado - p.monto_total > 0.01) {
    return { ok: false, error: `Estás aplicando ${aplicado.toFixed(2)} a facturas y el pago es de ${p.monto_total.toFixed(2)}.` }
  }

  const esEfectivo = p.metodo === 'efectivo'
  // El efectivo sale de una caja concreta. Sin sucursal no se sabe de cuál, y
  // un retiro sin caja identificada no se puede arquear.
  if (esEfectivo && !p.sucursal_id) {
    return { ok: false, error: 'Un pago en efectivo sale de la caja de una sucursal: elegí cuál.' }
  }

  const { data: pago, error } = await adm.from('pagos').insert({
    proveedor_id: p.proveedor_id,
    fecha_pago: p.fecha_pago,
    metodo_pago: p.metodo,
    monto_total: p.monto_total,
    monto_neto: p.monto_total,
    moneda: 'ARS',
    // Todo pago nace SOLICITADO. Nada que comprometa plata se ejecuta solo.
    estado: 'solicitado',
    origen_tipo: esEfectivo ? 'efectivo_sucursal'
      : p.metodo === 'nota_credito' ? 'nota_credito'
      : p.metodo === 'cheque' || p.metodo === 'echeq' ? 'cheque'
      : 'cuenta_bancaria',
    origen_sucursal_id: esEfectivo ? p.sucursal_id : null,
    sucursal_id: p.sucursal_id ?? null,
    caja_nombre: p.caja_nombre ?? null,
    resumen_numero: p.resumen_numero ?? null,
    observaciones: p.observaciones ?? null,
    solicitado_por: userId,
  }).select('id').maybeSingle()

  if (error || !pago) return { ok: false, error: error?.message ?? 'No se pudo registrar el pago.' }

  if (aplic.length) {
    await adm.from('pago_facturas').insert(
      aplic.map((a) => ({ pago_id: pago.id, factura_id: a.factura_id, monto_aplicado: a.monto })),
    )
  }

  // ── REGLA DE ORO 7 ────────────────────────────────────────────────────────
  let cajaMovId: string | null = null
  if (esEfectivo) {
    const { data: caja } = await adm.from('caja_general')
      .select('id').eq('sucursal_id', p.sucursal_id).limit(1).maybeSingle()
    if (caja?.id) {
      const { data: mov } = await adm.from('caja_general_movimientos').insert({
        caja_general_id: caja.id,
        tipo: 'pago_proveedor',
        monto: -Math.abs(p.monto_total),
        referencia_tipo: 'pago_proveedor',
        referencia_id: pago.id,
        estado: 'pendiente_aprobacion',
        solicitado_por: userId,
        categoria: p.caja_nombre ?? null,
        notas: `Pago a proveedor${p.resumen_numero ? ` · resumen ${p.resumen_numero}` : ''}. Espera aprobación del dueño (regla de oro 7).`,
      }).select('id').maybeSingle()
      cajaMovId = mov?.id ?? null
      if (cajaMovId) await adm.from('pagos').update({ caja_movimiento_id: cajaMovId }).eq('id', pago.id)
    }
  }

  return {
    ok: true,
    pago: {
      pago_id: pago.id, aplicado, facturas: aplic.length,
      caja_movimiento_id: cajaMovId,
      espera_aprobacion: true,
    },
  }
}
