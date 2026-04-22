'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatAddress } from '@/lib/address'
import type { Customer } from '@/lib/types'

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

type Draft = {
  name: string
  phone: string
  email: string
  dni: string
  tagsRaw: string
  notes: string
}

function draftFrom(c: Customer): Draft {
  return {
    name:  c.name  ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    dni:   c.dni   ?? '',
    tagsRaw: (c.tags ?? []).join(', '),
    notes: c.notes ?? '',
  }
}

export default function CustomerEditor({ customer }: { customer: Customer }) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(draftFrom(customer))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const original = draftFrom(customer)
  const dirty =
    draft.name  !== original.name  ||
    draft.phone !== original.phone ||
    draft.email !== original.email ||
    draft.dni   !== original.dni   ||
    draft.tagsRaw !== original.tagsRaw ||
    draft.notes !== original.notes

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    const tags = draft.tagsRaw.split(',').map(s => s.trim()).filter(Boolean)
    const { error } = await sb
      .from('customers')
      .update({
        name:  draft.name.trim()  || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim().toLowerCase() || null,
        dni:   draft.dni.trim()   || null,
        tags,
        notes: draft.notes.trim() || null,
      })
      .eq('id', customer.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg('Guardado.')
    router.refresh()
    setTimeout(() => setMsg(null), 3500)
  }

  const addrText = formatAddress(customer.address as any)

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS DEL CLIENTE</div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>
          {msg}
        </div>
      )}

      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Nombre</label>
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>DNI</label>
          <input value={draft.dni} onChange={e => setDraft({ ...draft, dni: e.target.value })} style={INPUT} />
        </div>
      </div>
      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Teléfono</label>
          <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} style={INPUT} />
        </div>
      </div>

      <div>
        <label style={LABEL}>Tags (separados por coma)</label>
        <input value={draft.tagsRaw} onChange={e => setDraft({ ...draft, tagsRaw: e.target.value })}
          placeholder="vip, pami, tercera edad" style={INPUT} />
      </div>

      <div>
        <label style={LABEL}>Notas internas</label>
        <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}
          rows={3} placeholder="Observaciones visibles solo para el equipo del CRM"
          style={{ ...INPUT, resize: 'vertical' }} />
      </div>

      {addrText && (
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 10, padding: '10px 12px' }}>
          <div style={LABEL}>Última dirección registrada</div>
          <div style={{ fontSize: 13, color: '#2a2a2a' }}>{addrText}</div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} disabled={busy || !dirty}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy || !dirty ? 0.5 : 1, cursor: busy ? 'wait' : (!dirty ? 'not-allowed' : 'pointer') }}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </section>
  )
}
