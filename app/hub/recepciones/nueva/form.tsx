'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
const INPUT: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8', borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const BTN: React.CSSProperties = { padding: '10px 14px', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px' }

type Suc = { id: string; nombre: string }

type Item = {
  descripcion: string
  cantidad_pedida: string
  cantidad_recibida: string
  cantidad_danada: string
  fecha_vencimiento_producto: string
  observaciones: string
}

function emptyItem(): Item {
  return { descripcion: '', cantidad_pedida: '', cantidad_recibida: '', cantidad_danada: '0', fecha_vencimiento_producto: '', observaciones: '' }
}

export default function NuevaRecepcionForm({
  sucursales, forcedSucursalId,
}: {
  sucursales: Suc[]
  forcedSucursalId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const todayLocal = new Date()
  const todayIso = new Date(todayLocal.getTime() - todayLocal.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [form, setForm] = useState({
    sucursal_id: forcedSucursalId ?? '',
    numero_remito: '',
    fecha_recepcion: todayIso,
    observaciones: '',
  })
  const [items, setItems] = useState<Item[]>([emptyItem()])

  function patchForm<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(f => ({ ...f, [k]: v })) }
  function patchItem(i: number, p: Partial<Item>) { setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...p } : it)) }
  function addRow() { setItems(arr => [...arr, emptyItem()]) }
  function removeRow(i: number) { setItems(arr => arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)) }

  // Estado preview (igual que el server)
  const estadoPreview = useMemo(() => {
    const rows = items.filter(it => it.descripcion.trim())
    if (rows.length === 0) return { label: 'Completa', fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' }
    let totalPedido = 0, totalRecibido = 0, totalDanado = 0
    let huboSobrante = false
    for (const it of rows) {
      const ped = Number(it.cantidad_pedida) || 0
      const rec = Number(it.cantidad_recibida) || 0
      const dan = Number(it.cantidad_danada) || 0
      totalPedido += ped; totalRecibido += rec; totalDanado += dan
      if (ped > 0 && rec > ped) huboSobrante = true
    }
    if (totalRecibido === 0 && totalPedido > 0) return { label: 'Rechazada', fg: '#888', bg: '#f5f5f5', border: '#e2e2e2' }
    if (totalDanado > 0 || huboSobrante) return { label: 'Con diferencias', fg: '#a33', bg: '#fbeaea', border: '#e0a8a8' }
    if (totalPedido > 0 && totalRecibido < totalPedido) return { label: 'Parcial', fg: '#c6831a', bg: '#fff7ec', border: '#edc989' }
    return { label: 'Completa', fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' }
  }, [items])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    const rows = items.filter(it => it.descripcion.trim())
    if (rows.length === 0) { setErr('Cargá al menos un item con descripción.'); return }

    setBusy(true)
    const res = await fetch('/api/hub/recepciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sucursal_id:     form.sucursal_id || null,
        numero_remito:   form.numero_remito.trim() || null,
        fecha_recepcion: form.fecha_recepcion ? new Date(form.fecha_recepcion).toISOString() : null,
        observaciones:   form.observaciones.trim() || null,
        items: rows.map(it => ({
          descripcion: it.descripcion.trim(),
          cantidad_pedida:   it.cantidad_pedida   === '' ? null : Number(it.cantidad_pedida),
          cantidad_recibida: it.cantidad_recibida === '' ? null : Number(it.cantidad_recibida),
          cantidad_danada:   Number(it.cantidad_danada) || 0,
          fecha_vencimiento_producto: it.fecha_vencimiento_producto || null,
          observaciones: it.observaciones.trim() || null,
        })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(json.hint || json.error || 'No se pudo guardar la recepción.'); return }
    router.push(`/hub/recepciones/${json.recepcionId}`)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS DE LA RECEPCIÓN</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: estadoPreview.fg, background: estadoPreview.bg, border: `0.5px solid ${estadoPreview.border}`, padding: '4px 10px', borderRadius: 999 }}>
            Estado calculado: {estadoPreview.label}
          </span>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Sucursal</label>
            <select value={form.sucursal_id} onChange={e => patchForm('sucursal_id', e.target.value)} style={INPUT}
              disabled={!!forcedSucursalId}>
              <option value="">— Sin asignar —</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            {forcedSucursalId && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Tu sucursal está fijada por tu rol.</div>
            )}
          </div>
          <div>
            <label style={LABEL}>Número de remito</label>
            <input value={form.numero_remito} onChange={e => patchForm('numero_remito', e.target.value)}
              placeholder="00012-00045678" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Fecha y hora *</label>
            <input type="datetime-local" value={form.fecha_recepcion}
              onChange={e => patchForm('fecha_recepcion', e.target.value)} style={INPUT} required />
          </div>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>ITEMS RECIBIDOS</div>
          <button type="button" onClick={addRow}
            style={{ ...BTN, background: '#f0ede8', color: '#666', padding: '8px 12px', fontSize: 12 }}>
            + Agregar item
          </button>
        </div>
        {items.map((it, i) => {
          const ped = Number(it.cantidad_pedida) || 0
          const rec = Number(it.cantidad_recibida) || 0
          const dan = Number(it.cantidad_danada) || 0
          const dif = rec - ped
          const tieneDif = (ped > 0 && rec !== ped) || dan > 0
          return (
            <div key={i} style={{ border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="sa-items-row" style={{ display: 'grid', gridTemplateColumns: '3fr 0.8fr 0.8fr 0.8fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={LABEL}>Descripción</label>
                  <input value={it.descripcion} onChange={e => patchItem(i, { descripcion: e.target.value })} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Pedido</label>
                  <input type="number" min="0" step="0.01" value={it.cantidad_pedida}
                    onChange={e => patchItem(i, { cantidad_pedida: e.target.value })} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Recibido</label>
                  <input type="number" min="0" step="0.01" value={it.cantidad_recibida}
                    onChange={e => patchItem(i, { cantidad_recibida: e.target.value })} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Dañados</label>
                  <input type="number" min="0" step="0.01" value={it.cantidad_danada}
                    onChange={e => patchItem(i, { cantidad_danada: e.target.value })} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL}>Vence</label>
                  <input type="date" value={it.fecha_vencimiento_producto}
                    onChange={e => patchItem(i, { fecha_vencimiento_producto: e.target.value })} style={INPUT} />
                </div>
                <button type="button" onClick={() => removeRow(i)} disabled={items.length === 1}
                  style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8', opacity: items.length === 1 ? 0.4 : 1, cursor: items.length === 1 ? 'not-allowed' : 'pointer' }}>
                  ✕
                </button>
              </div>
              {tieneDif && (
                <div style={{ fontSize: 12, color: '#a33', background: '#fbeaea', border: '0.5px solid #e0a8a8', borderRadius: 8, padding: '6px 10px' }}>
                  ⚠ {dan > 0 && <>{dan} dañad{dan === 1 ? 'o' : 'os'}. </>}
                  {ped > 0 && rec !== ped && (dif < 0 ? <>Faltan {Math.abs(dif)}.</> : <>Sobran {dif}.</>)}
                </div>
              )}
              <input value={it.observaciones} onChange={e => patchItem(i, { observaciones: e.target.value })}
                placeholder="Observaciones del item (opcional)…" style={{ ...INPUT, fontSize: 12, padding: '8px 10px' }} />
            </div>
          )
        })}
      </section>

      <section style={CARD}>
        <label style={LABEL}>Observaciones generales</label>
        <textarea value={form.observaciones} onChange={e => patchForm('observaciones', e.target.value)} rows={2}
          style={{ ...INPUT, resize: 'vertical' }} />
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', padding: '12px 22px', fontSize: 14, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Guardando…' : 'Guardar recepción →'}
        </button>
      </div>
    </form>
  )
}
