'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TipoFactura } from '@/lib/types/admin'

const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
const INPUT: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const BTN: React.CSSProperties = { padding: '10px 14px', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px' }

type Prov = { id: string; razon_social: string; plazo_pago_dias: number }
type Suc  = { id: string; nombre: string }
type Item = { descripcion: string; cantidad: string; precio_unitario: string; alicuota_iva: string }

function emptyItem(): Item { return { descripcion: '', cantidad: '1', precio_unitario: '', alicuota_iva: '21' } }

function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d }

export default function NuevaFacturaForm({ proveedores, sucursales }: { proveedores: Prov[]; sucursales: Suc[] }) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    proveedor_id: '',
    sucursal_id: '',
    tipo_factura: 'A' as TipoFactura,
    punto_venta: '',
    numero_factura: '',
    cae: '',
    cae_vencimiento: '',
    fecha_emision: today,
    fecha_vencimiento: '',
    percepciones: '0',
    retenciones: '0',
    observaciones: '',
  })
  const [items, setItems] = useState<Item[]>([emptyItem()])

  // Total automático
  const totales = useMemo(() => {
    let subtotal = 0, iva21 = 0, iva105 = 0, iva27 = 0
    for (const it of items) {
      const qty = Number(it.cantidad) || 0
      const price = Number(it.precio_unitario) || 0
      const ali = Number(it.alicuota_iva) || 0
      const sub = qty * price
      subtotal += sub
      const ivaImporte = sub * (ali / 100)
      if (ali === 21) iva21 += ivaImporte
      else if (ali === 10.5) iva105 += ivaImporte
      else if (ali === 27) iva27 += ivaImporte
    }
    const perc = Number(form.percepciones) || 0
    const ret  = Number(form.retenciones) || 0
    const total = subtotal + iva21 + iva105 + iva27 + perc - ret
    return { subtotal, iva21, iva105, iva27, perc, ret, total }
  }, [items, form.percepciones, form.retenciones])

  function patchForm<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(f => ({ ...f, [k]: v })) }
  function patchItem(i: number, p: Partial<Item>) { setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...p } : it)) }
  function addRow() { setItems(arr => [...arr, emptyItem()]) }
  function removeRow(i: number) { setItems(arr => arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)) }

  function onProveedorChange(pid: string) {
    patchForm('proveedor_id', pid)
    // Pre-cargar fecha_vencimiento usando plazo_pago_dias
    if (!form.fecha_vencimiento && form.fecha_emision) {
      const prov = proveedores.find(p => p.id === pid)
      if (prov?.plazo_pago_dias) {
        const venc = addDays(new Date(form.fecha_emision), prov.plazo_pago_dias)
        patchForm('fecha_vencimiento', venc.toISOString().slice(0, 10))
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (!form.proveedor_id) { setErr('Elegí un proveedor.'); return }
    if (!form.punto_venta || !form.numero_factura) { setErr('Punto de venta y número son obligatorios.'); return }
    if (!form.fecha_vencimiento) { setErr('Falta fecha de vencimiento.'); return }
    const cleanItems = items.filter(it => it.descripcion.trim() && Number(it.cantidad) > 0)

    setBusy(true)
    const { data: facData, error: facErr } = await sb.from('facturas_proveedor').insert({
      proveedor_id: form.proveedor_id,
      sucursal_id: form.sucursal_id || null,
      tipo_factura: form.tipo_factura,
      punto_venta: form.punto_venta.trim(),
      numero_factura: form.numero_factura.trim(),
      cae: form.cae.trim() || null,
      cae_vencimiento: form.cae_vencimiento || null,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento,
      subtotal: totales.subtotal,
      iva_21: totales.iva21,
      iva_105: totales.iva105,
      iva_27: totales.iva27,
      percepciones: totales.perc,
      retenciones: totales.ret,
      total: totales.total,
      estado: 'borrador',
      observaciones: form.observaciones.trim() || null,
    }).select('id').maybeSingle()

    if (facErr || !facData) {
      setBusy(false)
      if ((facErr as any)?.code === '23505') {
        setErr('Ya existe una factura con ese tipo + punto de venta + número para este proveedor.')
      } else {
        setErr(facErr?.message || 'Error al crear la factura.')
      }
      return
    }

    if (cleanItems.length > 0) {
      const itemsPayload = cleanItems.map(it => {
        const qty = Number(it.cantidad)
        const price = Number(it.precio_unitario) || 0
        return {
          factura_id: facData.id,
          descripcion: it.descripcion.trim(),
          cantidad: qty,
          precio_unitario: price,
          subtotal: qty * price,
          alicuota_iva: Number(it.alicuota_iva) || 0,
        }
      })
      await sb.from('factura_items').insert(itemsPayload)
    }

    setBusy(false)
    router.push(`/hub/facturas/${facData.id}`)
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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>PROVEEDOR Y SUCURSAL</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Proveedor *</label>
            <select value={form.proveedor_id} onChange={e => onProveedorChange(e.target.value)} style={INPUT} required>
              <option value="">— Elegí proveedor —</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Sucursal (opcional)</label>
            <select value={form.sucursal_id} onChange={e => patchForm('sucursal_id', e.target.value)} style={INPUT}>
              <option value="">—</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>COMPROBANTE</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '0.5fr 1fr 1.5fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Tipo *</label>
            <select value={form.tipo_factura} onChange={e => patchForm('tipo_factura', e.target.value as TipoFactura)} style={INPUT}>
              {(['A','B','C','M'] as TipoFactura[]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Punto de venta *</label>
            <input value={form.punto_venta} onChange={e => patchForm('punto_venta', e.target.value)} placeholder="00001" style={INPUT} required />
          </div>
          <div>
            <label style={LABEL}>Número *</label>
            <input value={form.numero_factura} onChange={e => patchForm('numero_factura', e.target.value)} placeholder="00012345" style={INPUT} required />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>CAE</label>
            <input value={form.cae} onChange={e => patchForm('cae', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Vencimiento CAE</label>
            <input type="date" value={form.cae_vencimiento} onChange={e => patchForm('cae_vencimiento', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Fecha emisión *</label>
            <input type="date" value={form.fecha_emision} onChange={e => patchForm('fecha_emision', e.target.value)} style={INPUT} required />
          </div>
          <div>
            <label style={LABEL}>Fecha vencimiento *</label>
            <input type="date" value={form.fecha_vencimiento} onChange={e => patchForm('fecha_vencimiento', e.target.value)} style={INPUT} required />
          </div>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>ITEMS</div>
          <button type="button" onClick={addRow}
            style={{ ...BTN, background: '#f0ede8', color: '#666', padding: '8px 12px', fontSize: 12 }}>
            + Agregar item
          </button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="sa-items-row" style={{ display: 'grid', gridTemplateColumns: '3fr 0.7fr 1fr 0.7fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              {i === 0 && <label style={LABEL}>Descripción</label>}
              <input value={it.descripcion} onChange={e => patchItem(i, { descripcion: e.target.value })} style={INPUT} />
            </div>
            <div>
              {i === 0 && <label style={LABEL}>Cant.</label>}
              <input type="number" min="0" step="0.01" value={it.cantidad} onChange={e => patchItem(i, { cantidad: e.target.value })} style={INPUT} />
            </div>
            <div>
              {i === 0 && <label style={LABEL}>Precio unit.</label>}
              <input type="number" min="0" step="0.01" value={it.precio_unitario} onChange={e => patchItem(i, { precio_unitario: e.target.value })} style={INPUT} />
            </div>
            <div>
              {i === 0 && <label style={LABEL}>IVA %</label>}
              <select value={it.alicuota_iva} onChange={e => patchItem(i, { alicuota_iva: e.target.value })} style={INPUT}>
                <option value="0">0</option>
                <option value="10.5">10.5</option>
                <option value="21">21</option>
                <option value="27">27</option>
              </select>
            </div>
            <button type="button" onClick={() => removeRow(i)} disabled={items.length === 1}
              style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8', opacity: items.length === 1 ? 0.4 : 1, cursor: items.length === 1 ? 'not-allowed' : 'pointer' }}>
              ✕
            </button>
          </div>
        ))}
      </section>

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>AJUSTES Y TOTALES</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Percepciones</label>
            <input type="number" min="0" step="0.01" value={form.percepciones} onChange={e => patchForm('percepciones', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Retenciones</label>
            <input type="number" min="0" step="0.01" value={form.retenciones} onChange={e => patchForm('retenciones', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#666' }}>Subtotal</span>
          <span style={{ textAlign: 'right' }}>${totales.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          {totales.iva21 > 0 && (<><span style={{ color: '#666' }}>IVA 21%</span><span style={{ textAlign: 'right' }}>${totales.iva21.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></>)}
          {totales.iva105 > 0 && (<><span style={{ color: '#666' }}>IVA 10,5%</span><span style={{ textAlign: 'right' }}>${totales.iva105.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></>)}
          {totales.iva27 > 0 && (<><span style={{ color: '#666' }}>IVA 27%</span><span style={{ textAlign: 'right' }}>${totales.iva27.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></>)}
          {totales.perc > 0 && (<><span style={{ color: '#666' }}>Percepciones</span><span style={{ textAlign: 'right' }}>+${totales.perc.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></>)}
          {totales.ret > 0 && (<><span style={{ color: '#666' }}>Retenciones</span><span style={{ textAlign: 'right', color: '#a33' }}>-${totales.ret.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></>)}
          <span style={{ fontWeight: 800, fontSize: 16, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid #ede9e4' }}>TOTAL</span>
          <span style={{ fontWeight: 800, fontSize: 16, marginTop: 6, paddingTop: 6, borderTop: '0.5px solid #ede9e4', textAlign: 'right' }}>${totales.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        <div>
          <label style={LABEL}>Observaciones</label>
          <textarea value={form.observaciones} onChange={e => patchForm('observaciones', e.target.value)} rows={2} style={{ ...INPUT, resize: 'vertical' }} />
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', padding: '12px 22px', fontSize: 14, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Guardando…' : 'Crear factura →'}
        </button>
      </div>
    </form>
  )
}
