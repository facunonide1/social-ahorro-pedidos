'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { METODO_PAGO_LABELS } from '@/lib/types/admin'
import type { MetodoPago } from '@/lib/types/admin'

const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
const INPUT: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const BTN: React.CSSProperties = { padding: '10px 14px', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px' }

type Prov = { id: string; razon_social: string; cuit: string }

type FacturaPend = {
  id: string
  tipo_factura: string
  punto_venta: string
  numero_factura: string
  fecha_emision: string
  fecha_vencimiento: string
  total: number
  estado: string
  pago_facturas: { monto_aplicado: number }[] | null
}

type Aplicacion = {
  factura_id: string
  monto_aplicado: string
}

const ESTADOS_PENDIENTES = ['aprobada','programada_pago','pagada_parcial','vencida']

export default function NuevoPagoForm({ proveedores }: { proveedores: Prov[] }) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    proveedor_id: '',
    fecha_pago: today,
    metodo_pago: 'transferencia' as MetodoPago,
    cuenta_bancaria_origen: '',
    monto_total: '',
    retenciones_aplicadas: '0',
    observaciones: '',
  })

  const [facturas, setFacturas] = useState<FacturaPend[]>([])
  const [loadingFacs, setLoadingFacs] = useState(false)
  const [aplicaciones, setAplicaciones] = useState<Record<string, string>>({})

  function patchForm<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  useEffect(() => {
    if (!form.proveedor_id) { setFacturas([]); setAplicaciones({}); return }
    let cancelled = false
    setLoadingFacs(true)
    ;(async () => {
      const { data } = await sb
        .from('facturas_proveedor')
        .select('id, tipo_factura, punto_venta, numero_factura, fecha_emision, fecha_vencimiento, total, estado, pago_facturas(monto_aplicado)')
        .eq('proveedor_id', form.proveedor_id)
        .in('estado', ESTADOS_PENDIENTES)
        .order('fecha_vencimiento', { ascending: true })
      if (cancelled) return
      setFacturas((data ?? []) as FacturaPend[])
      setAplicaciones({})
      setLoadingFacs(false)
    })()
    return () => { cancelled = true }
  }, [form.proveedor_id, sb])

  const facturasConSaldo = useMemo(() =>
    facturas.map(f => {
      const aplicado = (f.pago_facturas ?? []).reduce((a, x) => a + Number(x.monto_aplicado), 0)
      const saldo = Math.max(0, Number(f.total) - aplicado)
      return { ...f, _aplicado: aplicado, _saldo: saldo }
    }), [facturas])

  const sumaAplicaciones = useMemo(() =>
    Object.values(aplicaciones).reduce((a, v) => a + (Number(v) || 0), 0)
  , [aplicaciones])

  function setAplicacion(facId: string, valor: string) {
    setAplicaciones(prev => {
      const next = { ...prev }
      if (!valor || Number(valor) <= 0) delete next[facId]
      else next[facId] = valor
      return next
    })
  }

  function autoLlenar() {
    // Lleva monto_total al total de aplicaciones
    if (sumaAplicaciones > 0) patchForm('monto_total', sumaAplicaciones.toFixed(2))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (!form.proveedor_id) { setErr('Elegí un proveedor.'); return }
    if (!form.fecha_pago) { setErr('Falta la fecha de pago.'); return }
    const monto = Number(form.monto_total) || 0
    if (monto <= 0) { setErr('Ingresá el monto total del pago.'); return }

    const aplicacionesPayload = Object.entries(aplicaciones)
      .map(([factura_id, monto]) => ({ factura_id, monto_aplicado: Number(monto) }))
      .filter(a => a.monto_aplicado > 0)

    const sumaApl = aplicacionesPayload.reduce((a, x) => a + x.monto_aplicado, 0)
    if (sumaApl > 0 && Math.abs(sumaApl - monto) > 0.01) {
      setErr(`La suma de las aplicaciones ($${sumaApl.toFixed(2)}) tiene que coincidir con el monto del pago ($${monto.toFixed(2)}).`)
      return
    }

    setBusy(true)
    const res = await fetch('/api/hub/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proveedor_id: form.proveedor_id,
        fecha_pago: form.fecha_pago,
        metodo_pago: form.metodo_pago,
        cuenta_bancaria_origen: form.cuenta_bancaria_origen.trim() || null,
        monto_total: monto,
        retenciones_aplicadas: Number(form.retenciones_aplicadas) || 0,
        observaciones: form.observaciones.trim() || null,
        aplicaciones: aplicacionesPayload,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(json.hint || json.error || 'No se pudo crear la orden de pago.')
      return
    }
    router.push(`/hub/pagos/${json.pagoId}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, padding: 12, fontSize: 13, color: '#FF6D6E' }}>
          ⚠ {err}
        </div>
      )}

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>PROVEEDOR Y FECHA</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Proveedor *</label>
            <select value={form.proveedor_id} onChange={e => patchForm('proveedor_id', e.target.value)} style={INPUT} required>
              <option value="">— Elegí proveedor —</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.razon_social} — {p.cuit}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Fecha de pago *</label>
            <input type="date" value={form.fecha_pago} onChange={e => patchForm('fecha_pago', e.target.value)} style={INPUT} required />
          </div>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>FACTURAS PENDIENTES DEL PROVEEDOR</div>
          {sumaAplicaciones > 0 && (
            <button type="button" onClick={autoLlenar}
              style={{ ...BTN, background: '#f0ede8', color: '#666', padding: '7px 12px', fontSize: 12 }}>
              Usar suma como monto total ({`$${sumaAplicaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`})
            </button>
          )}
        </div>

        {!form.proveedor_id && (
          <div style={{ fontSize: 13, color: '#aaa', padding: '14px 0' }}>Elegí un proveedor para ver sus facturas pendientes.</div>
        )}
        {form.proveedor_id && loadingFacs && (
          <div style={{ fontSize: 13, color: '#aaa' }}>Cargando facturas…</div>
        )}
        {form.proveedor_id && !loadingFacs && facturasConSaldo.length === 0 && (
          <div style={{ fontSize: 13, color: '#aaa', padding: '14px 0' }}>
            Este proveedor no tiene facturas pendientes en estado aprobada/programada/parcial/vencida.
          </div>
        )}
        {form.proveedor_id && !loadingFacs && facturasConSaldo.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #ede9e4' }}>
                  {['Comprobante','Vence','Total','Saldo','Aplicar'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturasConSaldo.map(f => (
                  <tr key={f.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {f.tipo_factura} {f.punto_venta}-{f.numero_factura}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#666' }}>
                      {new Date(f.fecha_vencimiento).toLocaleDateString('es-AR')}
                    </td>
                    <td style={{ padding: '8px 10px' }}>${Number(f.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: f._saldo > 0 ? '#a33' : '#1f8a4c' }}>
                      ${f._saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 10px', width: 180 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="number" min="0" step="0.01" max={f._saldo}
                          value={aplicaciones[f.id] ?? ''}
                          onChange={e => setAplicacion(f.id, e.target.value)}
                          placeholder="0.00"
                          style={{ ...INPUT, padding: '7px 10px', fontSize: 13 }} />
                        <button type="button" onClick={() => setAplicacion(f.id, f._saldo.toFixed(2))}
                          title="Aplicar saldo total de esta factura"
                          style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', padding: '6px 9px', fontSize: 11 }}>
                          Saldo
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>MÉTODO Y MONTOS</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Método de pago *</label>
            <select value={form.metodo_pago} onChange={e => patchForm('metodo_pago', e.target.value as MetodoPago)} style={INPUT}>
              {Object.entries(METODO_PAGO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Cuenta bancaria origen / referencia</label>
            <input value={form.cuenta_bancaria_origen} onChange={e => patchForm('cuenta_bancaria_origen', e.target.value)}
              placeholder="Ej: Galicia 123/456 — CBU 0070..." style={INPUT} />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Monto total a pagar *</label>
            <input type="number" min="0" step="0.01" value={form.monto_total}
              onChange={e => patchForm('monto_total', e.target.value)} style={INPUT} required />
          </div>
          <div>
            <label style={LABEL}>Retenciones aplicadas</label>
            <input type="number" min="0" step="0.01" value={form.retenciones_aplicadas}
              onChange={e => patchForm('retenciones_aplicadas', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, fontSize: 13, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
          <span style={{ color: '#666' }}>Suma aplicada a facturas</span>
          <span style={{ textAlign: 'right', fontWeight: 700 }}>${sumaAplicaciones.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          <span style={{ color: '#666' }}>Monto total del pago</span>
          <span style={{ textAlign: 'right', fontWeight: 700 }}>${(Number(form.monto_total) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          {sumaAplicaciones > 0 && Math.abs(sumaAplicaciones - (Number(form.monto_total) || 0)) > 0.01 && (
            <span style={{ gridColumn: '1 / -1', color: '#c6831a', fontSize: 12 }}>
              ⚠ La suma aplicada no coincide con el monto. Si dejás aplicaciones, deben sumar igual al monto total.
            </span>
          )}
        </div>
        <div>
          <label style={LABEL}>Observaciones</label>
          <textarea value={form.observaciones} onChange={e => patchForm('observaciones', e.target.value)} rows={2}
            style={{ ...INPUT, resize: 'vertical' }} />
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', padding: '12px 22px', fontSize: 14, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Creando…' : 'Crear orden de pago →'}
        </button>
      </div>
    </form>
  )
}
