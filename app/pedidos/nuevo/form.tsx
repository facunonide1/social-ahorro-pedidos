'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ORIGIN_LABELS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS } from '@/lib/types'
import type { Order, OrderOrigin, TipoEnvio, ZonaReparto } from '@/lib/types'
import CustomerSearch from './customer-search'
import ProductSearch from './product-search'
import type { CustomerSuggestion } from '@/app/api/customers/search/route'
import type { ProductSuggestion } from '@/app/api/products/search/route'

type ItemDraft = { name: string; qty: string; price: string; sku: string }

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 12,
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
}

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12, fontSize: 13,
  fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

function emptyItem(): ItemDraft {
  return { name: '', qty: '1', price: '', sku: '' }
}

const MANUAL_ORIGINS: Exclude<OrderOrigin, 'woo'>[] = ['whatsapp', 'telefono', 'instagram', 'otro']

export default function NuevoPedidoForm({
  zonas, source,
}: {
  zonas: Pick<ZonaReparto, 'id'|'nombre'|'color'|'activa'>[]
  source?: Order | null
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Datos derivados del pedido origen, si estamos "repitiendo"
  const srcOriginManual: Exclude<OrderOrigin, 'woo'> =
    (source && source.origin !== 'woo') ? source.origin : 'whatsapp'
  const srcAddr = (source?.shipping_address ?? source?.billing_address ?? {}) as any
  const srcItems: ItemDraft[] = (source?.items ?? []).map(it => ({
    name: it.name ?? '',
    qty:  String(it.qty ?? 1),
    price: String(it.price ?? 0),
    sku: it.sku ?? '',
  }))

  const [origin, setOrigin] = useState<Exclude<OrderOrigin, 'woo'>>(srcOriginManual)
  const [tipoEnvio, setTipoEnvio] = useState<TipoEnvio>(source?.tipo_envio ?? 'programado')
  const [customer, setCustomer] = useState({
    name:  source?.customer_name  ?? '',
    phone: source?.customer_phone ?? '',
    email: source?.customer_email ?? '',
    dni:   source?.customer_dni   ?? '',
  })
  const [address, setAddress] = useState({
    address_1: srcAddr.address_1 ?? '',
    address_2: srcAddr.address_2 ?? '',
    city:      srcAddr.city      ?? '',
    state:     srcAddr.state     ?? '',
    postcode:  srcAddr.postcode  ?? '',
  })
  const [zonaId, setZonaId] = useState<string>(source?.zona_id ?? '')
  const [paymentMethod, setPaymentMethod] = useState(source?.payment_method ?? '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [items, setItems] = useState<ItemDraft[]>(srcItems.length > 0 ? srcItems : [emptyItem()])

  const total = useMemo(() => items.reduce((acc, it) => {
    const q = Number(it.qty) || 0
    const p = Number(it.price) || 0
    return acc + q * p
  }, 0), [items])

  function pickCustomer(c: CustomerSuggestion) {
    setCustomer({
      name:  c.name  || '',
      phone: c.phone || '',
      email: c.email || '',
      dni:   c.dni   || '',
    })
    const a = c.address || {}
    setAddress({
      address_1: a.address_1 || '',
      address_2: a.address_2 || '',
      city:      a.city      || '',
      state:     a.state     || '',
      postcode:  a.postcode  || '',
    })
  }

  function patchItem(i: number, patch: Partial<ItemDraft>) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function addItem() { setItems(arr => [...arr, emptyItem()]) }
  function removeItem(i: number) {
    setItems(arr => arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i))
  }

  /**
   * Agrega un item desde el catálogo de Woo. Si ya existe un item con el
   * mismo SKU o nombre, en vez de duplicarlo le aumenta la cantidad.
   * Si la primera fila está vacía, la usa en vez de agregar una nueva.
   */
  function addProductItem(p: ProductSuggestion) {
    setItems(arr => {
      const match = arr.findIndex(it =>
        (p.sku && it.sku.trim() === p.sku) ||
        (!p.sku && it.name.trim().toLowerCase() === p.name.toLowerCase())
      )
      if (match !== -1) {
        return arr.map((it, idx) => idx === match
          ? { ...it, qty: String((Number(it.qty) || 0) + 1) }
          : it
        )
      }
      const draft: ItemDraft = {
        name: p.name,
        qty: '1',
        price: String(p.price || 0),
        sku: p.sku ?? '',
      }
      const firstEmpty = arr.findIndex(it => !it.name.trim() && !it.sku.trim())
      if (firstEmpty !== -1) {
        return arr.map((it, idx) => idx === firstEmpty ? draft : it)
      }
      return [...arr, draft]
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)

    const cleanItems = items
      .map(it => ({
        name: it.name.trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        sku: it.sku.trim() || undefined,
      }))
      .filter(it => it.name && it.qty > 0)

    if (cleanItems.length === 0) {
      setBusy(false); setErr('Agregá al menos un item con nombre y cantidad.'); return
    }
    if (!customer.name.trim() && !customer.phone.trim()) {
      setBusy(false); setErr('Poné al menos nombre o teléfono del cliente.'); return
    }

    const shipping = Object.values(address).some(v => v.trim()) ? {
      first_name: customer.name.trim().split(' ')[0] || '',
      last_name: customer.name.trim().split(' ').slice(1).join(' ') || '',
      address_1: address.address_1.trim() || undefined,
      address_2: address.address_2.trim() || undefined,
      city: address.city.trim() || undefined,
      state: address.state.trim() || undefined,
      postcode: address.postcode.trim() || undefined,
      phone: customer.phone.trim() || undefined,
      email: customer.email.trim() || undefined,
    } : null

    const { data, error } = await sb.rpc('create_manual_order', {
      p_origin: origin,
      p_tipo_envio: tipoEnvio,
      p_customer_name: customer.name,
      p_customer_phone: customer.phone,
      p_customer_email: customer.email,
      p_customer_dni: customer.dni,
      p_shipping_address: shipping,
      p_zona_id: zonaId || null,
      p_items: cleanItems,
      p_total: total,
      p_payment_method: paymentMethod,
      p_notes: notes,
    })

    setBusy(false)

    if (error) { setErr(error.message); return }
    const created = Array.isArray(data) ? data[0] : data
    if (created?.id) {
      router.push(`/pedidos/${created.id}`)
      router.refresh()
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, padding: 12, fontSize: 13, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {/* CANAL DE ORIGEN */}
      <section style={CARD}>
        <div>
          <label style={LABEL}>Canal de origen</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MANUAL_ORIGINS.map(o => {
              const selected = origin === o
              return (
                <button key={o} type="button" onClick={() => setOrigin(o)}
                  style={{
                    ...BTN,
                    background: selected ? '#FF6D6E' : '#fff',
                    color: selected ? '#fff' : '#666',
                    border: selected ? 'none' : '1.5px solid #f0ede8',
                  }}>
                  {ORIGIN_LABELS[o]}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            El número del pedido se genera automáticamente según el canal (WSP-001, TEL-001, etc.).
          </div>
        </div>

        <div>
          <label style={LABEL}>Tipo de envío</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(['express','programado','retiro'] as TipoEnvio[]).map(t => {
              const selected = tipoEnvio === t
              const c = TIPO_ENVIO_COLORS[t]
              return (
                <button key={t} type="button" onClick={() => setTipoEnvio(t)}
                  style={{
                    ...BTN,
                    background: selected ? c.fg : '#fff',
                    color: selected ? '#fff' : c.fg,
                    border: selected ? 'none' : `1.5px solid ${c.border}`,
                  }}>
                  {TIPO_ENVIO_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* CLIENTE */}
      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CLIENTE</div>
        <CustomerSearch onPick={pickCustomer} />
        <div>
          <label style={LABEL}>Nombre completo</label>
          <input value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })}
            placeholder="Juan Pérez" style={INPUT} />
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Teléfono</label>
            <input value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })}
              placeholder="+54 9 11 5555-5555" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>DNI</label>
            <input value={customer.dni} onChange={e => setCustomer({ ...customer, dni: e.target.value })}
              placeholder="12345678" style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input type="email" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })}
            placeholder="cliente@mail.com" style={INPUT} />
        </div>
      </section>

      {/* DIRECCIÓN */}
      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DIRECCIÓN DE ENVÍO</div>
        <div>
          <label style={LABEL}>Calle y número</label>
          <input value={address.address_1} onChange={e => setAddress({ ...address, address_1: e.target.value })}
            placeholder="Av. Siempre Viva 742" style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Piso / Depto / Referencias</label>
          <input value={address.address_2} onChange={e => setAddress({ ...address, address_2: e.target.value })}
            placeholder="3° B · timbre rojo" style={INPUT} />
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Ciudad</label>
            <input value={address.city} onChange={e => setAddress({ ...address, city: e.target.value })}
              style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Provincia</label>
            <input value={address.state} onChange={e => setAddress({ ...address, state: e.target.value })}
              style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>CP</label>
            <input value={address.postcode} onChange={e => setAddress({ ...address, postcode: e.target.value })}
              style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Zona de reparto</label>
          <select value={zonaId} onChange={e => setZonaId(e.target.value)} style={INPUT}>
            <option value="">— Sin zona —</option>
            {zonas.map(z => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
          {zonas.length === 0 && (
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              Todavía no hay zonas creadas. Un admin puede crearlas en ⚙ Config.
            </div>
          )}
        </div>
      </section>

      {/* ITEMS */}
      <section style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>ITEMS</div>
          <button type="button" onClick={addItem}
            style={{ ...BTN, background: '#f0ede8', color: '#666' }}>
            + Agregar manual
          </button>
        </div>

        <ProductSearch onPick={addProductItem} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it, i) => (
            <div key={i} className="sa-items-row" style={{ display: 'grid', gridTemplateColumns: '3fr 0.7fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={LABEL}>Producto</label>
                <input value={it.name} onChange={e => patchItem(i, { name: e.target.value })}
                  placeholder="Descripción" style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Cant.</label>
                <input type="number" min="0" step="1" value={it.qty}
                  onChange={e => patchItem(i, { qty: e.target.value })} style={INPUT} />
              </div>
              <div>
                <label style={LABEL}>Precio unit.</label>
                <input type="number" min="0" step="0.01" value={it.price}
                  onChange={e => patchItem(i, { price: e.target.value })} placeholder="0" style={INPUT} />
              </div>
              <div className="sa-items-sku">
                <label style={LABEL}>SKU</label>
                <input value={it.sku} onChange={e => patchItem(i, { sku: e.target.value })}
                  placeholder="—" style={INPUT} />
              </div>
              <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1}
                style={{
                  ...BTN, background: '#fff', color: '#a33',
                  border: '1.5px solid #f0ede8',
                  opacity: items.length === 1 ? 0.4 : 1,
                  cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                }}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '0.5px solid #f0ede8' }}>
          <div style={{ fontSize: 12, color: '#888' }}>Total calculado</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>${total.toLocaleString('es-AR')}</div>
        </div>
      </section>

      {/* PAGO + NOTAS */}
      <section style={CARD}>
        <div>
          <label style={LABEL}>Método de pago</label>
          <input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
            placeholder="Efectivo, transferencia, …" style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Notas</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Indicaciones del cliente, horarios, etc."
            style={{ ...INPUT, resize: 'vertical' }} />
        </div>
      </section>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="submit" disabled={busy}
          style={{
            ...BTN, background: '#FF6D6E', color: '#fff', padding: '12px 20px',
            fontSize: 14, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer',
          }}>
          {busy ? 'Creando…' : 'Crear pedido →'}
        </button>
      </div>
    </form>
  )
}
