'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ContactoRol, ProveedorContacto } from '@/lib/types/admin'

const BTN: React.CSSProperties = {
  padding: '8px 12px', border: 'none', borderRadius: 10,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1.5px solid #f0ede8',
  borderRadius: 10, fontSize: 13, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const ROLES: { value: ContactoRol; label: string }[] = [
  { value: 'vendedor',   label: 'Vendedor' },
  { value: 'cobranzas',  label: 'Cobranzas' },
  { value: 'logistica',  label: 'Logística' },
  { value: 'gerencia',   label: 'Gerencia' },
  { value: 'otro',       label: 'Otro' },
]

type Draft = {
  nombre: string
  rol: ContactoRol | ''
  telefono: string
  email: string
  whatsapp: string
  es_principal: boolean
}

function empty(): Draft { return { nombre: '', rol: '', telefono: '', email: '', whatsapp: '', es_principal: false } }

export default function ContactosSection({
  proveedorId, initial, readOnly,
}: {
  proveedorId: string
  initial: ProveedorContacto[]
  readOnly: boolean
}) {
  const router = useRouter()
  const sb = createClient()
  const [rows, setRows] = useState(initial)
  const [adding, setAdding] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    if (!adding) return
    setBusy(true); setErr(null)
    const payload = {
      proveedor_id: proveedorId,
      nombre: adding.nombre.trim() || null,
      rol: adding.rol || null,
      telefono: adding.telefono.trim() || null,
      email: adding.email.trim().toLowerCase() || null,
      whatsapp: adding.whatsapp.trim() || null,
      es_principal: adding.es_principal,
    }
    const { data, error } = await sb.from('proveedor_contactos').insert(payload).select('*').maybeSingle<ProveedorContacto>()
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data) setRows(arr => [data, ...arr])
    setAdding(null); router.refresh()
  }

  async function remove(c: ProveedorContacto) {
    if (!confirm('¿Borrar este contacto?')) return
    const { error } = await sb.from('proveedor_contactos').delete().eq('id', c.id)
    if (error) { setErr(error.message); return }
    setRows(arr => arr.filter(x => x.id !== c.id))
    router.refresh()
  }

  async function togglePrincipal(c: ProveedorContacto) {
    const next = !c.es_principal
    const { error } = await sb.from('proveedor_contactos').update({ es_principal: next }).eq('id', c.id)
    if (error) { setErr(error.message); return }
    setRows(arr => arr.map(x => x.id === c.id ? { ...x, es_principal: next } : x))
    router.refresh()
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CONTACTOS ({rows.length})</div>
        {!readOnly && (
          <button onClick={() => setAdding(adding ? null : empty())}
            style={{ ...BTN, background: adding ? '#f0ede8' : '#726DFF', color: adding ? '#666' : '#fff' }}>
            {adding ? 'Cancelar' : '+ Agregar'}
          </button>
        )}
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}

      {adding && (
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input placeholder="Nombre" value={adding.nombre} onChange={e => setAdding({ ...adding, nombre: e.target.value })} style={INPUT} />
            <select value={adding.rol} onChange={e => setAdding({ ...adding, rol: e.target.value as any })} style={INPUT}>
              <option value="">Rol…</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <input placeholder="Teléfono" value={adding.telefono} onChange={e => setAdding({ ...adding, telefono: e.target.value })} style={INPUT} />
            <input placeholder="WhatsApp" value={adding.whatsapp} onChange={e => setAdding({ ...adding, whatsapp: e.target.value })} style={INPUT} />
            <input placeholder="Email" value={adding.email} onChange={e => setAdding({ ...adding, email: e.target.value })} style={INPUT} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
              <input type="checkbox" checked={adding.es_principal} onChange={e => setAdding({ ...adding, es_principal: e.target.checked })} />
              Contacto principal
            </label>
            <button onClick={add} disabled={busy}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff' }}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: '#aaa' }}>Sin contactos cargados.</div>
      )}

      {rows.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {c.nombre || '(sin nombre)'}
              {c.es_principal && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Principal</span>}
              {c.rol && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '0.5px solid #d9d6ff', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>{c.rol}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {[c.telefono, c.whatsapp && `WA ${c.whatsapp}`, c.email].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => togglePrincipal(c)}
                style={{ ...BTN, background: '#fff', color: '#555', border: '1.5px solid #f0ede8' }}>
                {c.es_principal ? 'Quitar principal' : 'Marcar principal'}
              </button>
              <button onClick={() => remove(c)}
                style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8' }}>
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
