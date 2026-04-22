'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderItem } from '@/lib/types'

type Draft = { name: string; qty: string; price: string; sku: string }

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 10, fontSize: 13, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
}
const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

function itemToDraft(it: OrderItem): Draft {
  return {
    name: it.name ?? '',
    qty: String(it.qty ?? 1),
    price: String(it.price ?? 0),
    sku: it.sku ?? '',
  }
}

export default function ItemsEditor({ order }: { order: Order }) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState<Draft[]>((order.items ?? []).map(itemToDraft))
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState<string | null>(null)
  const [msg, setMsg]     = useState<string | null>(null)

  const total = useMemo(() => items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.price) || 0), 0), [items])
  const originalTotal = Number(order.total) || 0

  function patch(i: number, p: Partial<Draft>) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...p } : it))
  }
  function addRow() { setItems(arr => [...arr, { name: '', qty: '1', price: '', sku: '' }]) }
  function removeRow(i: number) { setItems(arr => arr.filter((_, idx) => idx !== i)) }

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    const cleaned = items
      .map(it => ({
        name: it.name.trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        sku: it.sku.trim() || undefined,
      }))
      .filter(it => it.name && it.qty > 0)

    if (cleaned.length === 0) { setErr('Tiene que haber al menos un item.'); setBusy(false); return }

    const newTotal = cleaned.reduce((a, it) => a + it.qty * it.price, 0)

    const { error } = await sb
      .from('orders')
      .update({ items: cleaned, total: newTotal })
      .eq('id', order.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg(`Items actualizados. Nuevo total: $${newTotal.toLocaleString('es-AR')}`)
    router.refresh()
    setTimeout(() => { setMsg(null); setOpen(false) }, 2000)
  }

  function cancel() {
    setItems((order.items ?? []).map(itemToDraft))
    setOpen(false); setErr(null); setMsg(null)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', alignSelf: 'flex-start' }}>
        ✎ Editar items
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, padding: 12, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>{msg}</div>
      )}

      {order.origin === 'woo' && (
        <div style={{ background: '#fff7ec', border: '0.5px solid #edc989', borderRadius: 10, padding: 10, fontSize: 12, color: '#c6831a' }}>
          Este pedido vino de WooCommerce. Al editar acá los items no se sincronizan con la web; solo actualiza tu registro interno.
        </div>
      )}

      {items.map((it, i) => (
        <div key={i} className="sa-items-row" style={{ display: 'grid', gridTemplateColumns: '3fr 0.7fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            {i === 0 && <label style={LABEL}>Producto</label>}
            <input value={it.name} onChange={e => patch(i, { name: e.target.value })} style={INPUT} />
          </div>
          <div>
            {i === 0 && <label style={LABEL}>Cant.</label>}
            <input type="number" min="0" step="1" value={it.qty}
              onChange={e => patch(i, { qty: e.target.value })} style={INPUT} />
          </div>
          <div>
            {i === 0 && <label style={LABEL}>Precio unit.</label>}
            <input type="number" min="0" step="0.01" value={it.price}
              onChange={e => patch(i, { price: e.target.value })} style={INPUT} />
          </div>
          <div className="sa-items-sku">
            {i === 0 && <label style={LABEL}>SKU</label>}
            <input value={it.sku} onChange={e => patch(i, { sku: e.target.value })} style={INPUT} />
          </div>
          <button type="button" onClick={() => removeRow(i)}
            style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8' }}>
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={addRow}
          style={{ ...BTN, background: '#f0ede8', color: '#666' }}>
          + Agregar fila
        </button>
        <div style={{ fontSize: 13, color: '#666' }}>
          Nuevo total: <b style={{ color: '#2a2a2a' }}>${total.toLocaleString('es-AR')}</b>
          {total !== originalTotal && (
            <span style={{ marginLeft: 8, fontSize: 11, color: total > originalTotal ? '#1f8a4c' : '#a33' }}>
              ({total > originalTotal ? '+' : ''}${(total - originalTotal).toLocaleString('es-AR')} vs ${originalTotal.toLocaleString('es-AR')})
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={cancel} disabled={busy}
          style={{ ...BTN, background: '#fff', color: '#666', border: '1.5px solid #f0ede8' }}>
          Cancelar
        </button>
        <button onClick={save} disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Guardando…' : 'Guardar items'}
        </button>
      </div>
    </div>
  )
}
