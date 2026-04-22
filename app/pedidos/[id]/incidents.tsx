'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { INCIDENT_LABELS } from '@/lib/types'
import type { IncidentType, OrderIncident, UserPedidos } from '@/lib/types'

const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
}

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

export default function IncidentsSection({
  orderId, initialIncidents, users,
}: {
  orderId: string
  initialIncidents: OrderIncident[]
  users: Pick<UserPedidos,'id'|'name'|'email'>[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [rows, setRows]       = useState(initialIncidents)
  const [open, setOpen]       = useState(false)
  const [tipo, setTipo]       = useState<IncidentType>('cliente_ausente')
  const [descripcion, setDescripcion] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const userMap = new Map(users.map(u => [u.id, u.name || u.email]))

  async function save() {
    setBusy(true); setErr(null)
    const { data, error } = await sb.from('order_incidents').insert({
      order_id: orderId, tipo,
      descripcion: descripcion.trim() || null,
    }).select('*').maybeSingle<OrderIncident>()
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data) setRows(arr => [data, ...arr])
    setTipo('cliente_ausente'); setDescripcion(''); setOpen(false)
    router.refresh()
  }

  async function remove(inc: OrderIncident) {
    if (!confirm('¿Borrar esta incidencia?')) return
    const { error } = await sb.from('order_incidents').delete().eq('id', inc.id)
    if (error) { setErr(error.message); return }
    setRows(arr => arr.filter(x => x.id !== inc.id))
    router.refresh()
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>
          INCIDENCIAS {rows.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, color: '#a33', background: '#fbeaea', border: '0.5px solid #e0a8a8', padding: '1px 6px', borderRadius: 999 }}>
              {rows.length}
            </span>
          )}
        </div>
        <button onClick={() => setOpen(v => !v)}
          style={{ ...BTN, background: open ? '#f0ede8' : '#a33', color: open ? '#666' : '#fff', padding: '8px 12px' }}>
          {open ? 'Cancelar' : '+ Registrar'}
        </button>
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {open && (
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={LABEL}>Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as IncidentType)} style={INPUT}>
              {(['cliente_ausente','direccion_incorrecta','sin_stock','dano_entrega','otro'] as IncidentType[]).map(t => (
                <option key={t} value={t}>{INCIDENT_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Descripción (opcional)</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              placeholder="Contexto adicional: qué pasó, qué producto faltaba, etc."
              style={{ ...INPUT, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={save} disabled={busy}
              style={{ ...BTN, background: '#a33', color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Guardando…' : 'Registrar incidencia'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: '#bbb' }}>Sin incidencias registradas.</div>
      ) : rows.map(inc => (
        <div key={inc.id} style={{ background: '#fbeaea', border: '0.5px solid #e0a8a8', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a33', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
              {INCIDENT_LABELS[inc.tipo]}
            </span>
            <span style={{ fontSize: 11, color: '#888' }}>
              {new Date(inc.created_at).toLocaleString('es-AR')}
              {inc.registrado_by && userMap.has(inc.registrado_by) && ` · ${userMap.get(inc.registrado_by)}`}
            </span>
          </div>
          {inc.descripcion && (
            <div style={{ fontSize: 13, color: '#2a2a2a', marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {inc.descripcion}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={() => remove(inc)}
              style={{ fontSize: 11, color: '#a33', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
              Borrar
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}
