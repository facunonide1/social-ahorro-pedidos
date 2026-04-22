'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { STATUS_LABELS, STATUS_ORDER, STATUS_COLORS, TIPO_ENVIO_LABELS, TIPO_ENVIO_COLORS, TIPO_ENVIO_FLOW } from '@/lib/types'
import type { Order, OrderStatus, TipoEnvio, UserRole, UserPedidos, ZonaReparto } from '@/lib/types'
import { messageForStatus, whatsappLink } from '@/lib/whatsapp/messages'
import { formatOrderNumber } from '@/lib/orders/format'

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '-0.2px',
}

export default function OrderActions({
  order, role, repartidores, zonas,
}: {
  order: Order
  role: UserRole
  repartidores: Pick<UserPedidos,'id'|'name'|'email'|'role'|'active'>[]
  zonas: Pick<ZonaReparto,'id'|'nombre'|'color'|'activa'>[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignTo, setAssignTo] = useState<string>(order.assigned_to ?? '')
  const [zonaSaving, setZonaSaving] = useState(false)
  const [zonaId, setZonaId] = useState<string>(order.zona_id ?? '')
  const [tipoSaving, setTipoSaving] = useState(false)
  const [tipoEnvio, setTipoEnvio] = useState<TipoEnvio>(order.tipo_envio)

  // Filtramos los estados permitidos según el flujo del tipo de envío.
  const flow = TIPO_ENVIO_FLOW[order.tipo_envio]
  const allowedStatuses: OrderStatus[] = role === 'repartidor'
    ? (['en_camino', 'entregado'] as OrderStatus[]).filter(s => flow.includes(s))
    : flow.filter(s => s !== order.status)

  async function changeStatus(next: OrderStatus) {
    setBusy(true); setErr(null)
    const note = noteDraft.trim() || null
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, note }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error_cambio_estado'); return }
      setNoteDraft('')
      const warnings: string[] = []
      if (json?.woo && json.woo.ok === false) {
        warnings.push(`No se sincronizó con Woo: ${json.woo.error}`)
      }
      if (json?.whatsappMsg && json.whatsappMsg.ok === false) {
        warnings.push(`No se generó mensaje WhatsApp: ${json.whatsappMsg.error}`)
      }
      if (warnings.length) {
        setErr(`Estado guardado. ${warnings.join(' · ')}`)
      }
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function addNote() {
    const note = noteDraft.trim()
    if (!note) return
    setBusy(true); setErr(null)
    const { error } = await sb.rpc('add_order_note', {
      p_order_id: order.id,
      p_note: note,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNoteDraft('')
    router.refresh()
  }

  async function assign() {
    setAssigning(true); setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ assigned_to: assignTo || null })
      .eq('id', order.id)
    setAssigning(false)
    if (error) { setErr(error.message); return }
    router.refresh()
  }

  async function saveZona() {
    setZonaSaving(true); setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ zona_id: zonaId || null })
      .eq('id', order.id)
    setZonaSaving(false)
    if (error) { setErr(error.message); return }
    router.refresh()
  }

  async function saveTipo() {
    setTipoSaving(true); setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ tipo_envio: tipoEnvio })
      .eq('id', order.id)
    setTipoSaving(false)
    if (error) { setErr(error.message); return }
    router.refresh()
  }

  const waText = messageForStatus(order.status, {
    customerName: order.customer_name,
    orderNumber: formatOrderNumber(order),
  })
  const waLink = whatsappLink(order.customer_phone, waText)

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>ACCIONES</div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {/* NOTA */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', display: 'block', marginBottom: 6 }}>
          NOTA / OBSERVACIÓN (opcional)
        </label>
        <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={2}
          placeholder="Ej: dejado con el portero, cliente no atendió, etc."
          style={{ width: '100%', padding: 10, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 13, background: '#faf8f5', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: '#2a2a2a', boxSizing: 'border-box' }} />
        <button onClick={addNote} disabled={busy || !noteDraft.trim()}
          style={{ ...BTN, marginTop: 8, background: '#f0ede8', color: '#666', opacity: !noteDraft.trim() ? 0.5 : 1 }}>
          Guardar solo nota
        </button>
      </div>

      {/* CAMBIO DE ESTADO */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', marginBottom: 8 }}>CAMBIAR ESTADO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {allowedStatuses.map(s => {
            const c = STATUS_COLORS[s]
            return (
              <button key={s} onClick={() => changeStatus(s)} disabled={busy}
                style={{ ...BTN, background: c.bg, color: c.fg, border: `0.5px solid ${c.border}` }}>
                → {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
        {noteDraft.trim() && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
            La nota se va a adjuntar al cambio de estado.
          </div>
        )}
      </div>

      {/* WHATSAPP */}
      {waLink ? (
        <a href={waLink} target="_blank" rel="noreferrer"
          style={{ ...BTN, background: '#25D366', color: '#fff', textAlign: 'center', textDecoration: 'none' }}>
          Enviar WhatsApp ({STATUS_LABELS[order.status]})
        </a>
      ) : (
        <div style={{ fontSize: 12, color: '#aaa' }}>Sin teléfono válido para WhatsApp</div>
      )}

      {/* TIPO DE ENVÍO (solo admin/operador) */}
      {(role === 'admin' || role === 'operador') && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', marginBottom: 6 }}>TIPO DE ENVÍO</div>
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
            <button onClick={saveTipo} disabled={tipoSaving || tipoEnvio === order.tipo_envio}
              style={{ ...BTN, background: '#726DFF', color: '#fff', opacity: tipoSaving || tipoEnvio === order.tipo_envio ? 0.5 : 1 }}>
              Guardar tipo
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            El tipo determina qué estados se pueden elegir abajo (retiro no pasa por "en_camino", express no pasa por "listo").
          </div>
        </div>
      )}

      {/* ZONA (solo admin/operador) */}
      {(role === 'admin' || role === 'operador') && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', marginBottom: 6 }}>ZONA DE REPARTO</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={zonaId} onChange={e => setZonaId(e.target.value)}
              style={{ flex: 1, padding: 10, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 13, background: '#faf8f5', outline: 'none', color: '#2a2a2a' }}>
              <option value="">— Sin zona —</option>
              {zonas.filter(z => z.activa || z.id === order.zona_id).map(z => (
                <option key={z.id} value={z.id}>{z.nombre}{!z.activa ? ' (inactiva)' : ''}</option>
              ))}
            </select>
            <button onClick={saveZona} disabled={zonaSaving || zonaId === (order.zona_id ?? '')}
              style={{ ...BTN, background: '#726DFF', color: '#fff', opacity: zonaSaving || zonaId === (order.zona_id ?? '') ? 0.5 : 1 }}>
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* ASIGNAR REPARTIDOR (solo admin/operador) */}
      {(role === 'admin' || role === 'operador') && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', marginBottom: 6 }}>REPARTIDOR</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
              style={{ flex: 1, padding: 10, border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 13, background: '#faf8f5', outline: 'none', color: '#2a2a2a' }}>
              <option value="">— Sin asignar —</option>
              {repartidores.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.email}</option>
              ))}
            </select>
            <button onClick={assign} disabled={assigning || assignTo === (order.assigned_to ?? '')}
              style={{ ...BTN, background: '#726DFF', color: '#fff', opacity: assigning || assignTo === (order.assigned_to ?? '') ? 0.5 : 1 }}>
              Asignar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
