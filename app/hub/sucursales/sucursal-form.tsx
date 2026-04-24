'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Sucursal } from '@/lib/types/admin'

const CARD: React.CSSProperties = {
  background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16,
  padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
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
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

type Draft = {
  nombre: string
  codigo: string
  direccion: string
  localidad: string
  provincia: string
  telefono: string
  email: string
  latitud: string
  longitud: string
  activa: boolean
}

function fromSucursal(s?: Sucursal): Draft {
  return {
    nombre:    s?.nombre    ?? '',
    codigo:    s?.codigo    ?? '',
    direccion: s?.direccion ?? '',
    localidad: s?.localidad ?? '',
    provincia: s?.provincia ?? '',
    telefono:  s?.telefono  ?? '',
    email:     s?.email     ?? '',
    latitud:   s?.latitud != null ? String(s.latitud) : '',
    longitud:  s?.longitud != null ? String(s.longitud) : '',
    activa:    s?.activa ?? true,
  }
}

export default function SucursalForm({ mode, initial }: { mode: 'create' | 'edit'; initial?: Sucursal }) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromSucursal(initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v }))
  }

  async function save() {
    setErr(null); setMsg(null)
    if (!draft.nombre.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true)

    const payload = {
      nombre:    draft.nombre.trim(),
      codigo:    draft.codigo.trim() || null,
      direccion: draft.direccion.trim() || null,
      localidad: draft.localidad.trim() || null,
      provincia: draft.provincia.trim() || null,
      telefono:  draft.telefono.trim() || null,
      email:     draft.email.trim().toLowerCase() || null,
      latitud:   draft.latitud  ? Number(draft.latitud)  : null,
      longitud:  draft.longitud ? Number(draft.longitud) : null,
      activa:    draft.activa,
    }

    if (mode === 'create') {
      const { data, error } = await sb.from('sucursales').insert(payload).select('id').maybeSingle()
      setBusy(false)
      if (error) {
        if ((error as any).code === '23505') setErr('Ya existe una sucursal con ese código.')
        else setErr(error.message)
        return
      }
      if (data?.id) router.push(`/hub/sucursales/${data.id}`)
      else router.push('/hub/sucursales')
    } else if (initial) {
      const { error } = await sb.from('sucursales').update(payload).eq('id', initial.id)
      setBusy(false)
      if (error) {
        if ((error as any).code === '23505') setErr('Ya existe una sucursal con ese código.')
        else setErr(error.message)
        return
      }
      setMsg('Cambios guardados.')
      router.refresh()
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <section style={CARD}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>{msg}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS DE LA SUCURSAL</div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.activa} onChange={e => patch('activa', e.target.checked)} />
          Activa
        </label>
      </div>

      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Nombre *</label>
          <input value={draft.nombre} onChange={e => patch('nombre', e.target.value)} placeholder="Ituzaingó Centro" style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Código interno</label>
          <input value={draft.codigo} onChange={e => patch('codigo', e.target.value)} placeholder="SA-01" style={INPUT} />
        </div>
      </div>

      <div>
        <label style={LABEL}>Dirección</label>
        <input value={draft.direccion} onChange={e => patch('direccion', e.target.value)} placeholder="Av. Rivadavia 1234" style={INPUT} />
      </div>

      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Localidad</label>
          <input value={draft.localidad} onChange={e => patch('localidad', e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Provincia</label>
          <input value={draft.provincia} onChange={e => patch('provincia', e.target.value)} style={INPUT} />
        </div>
      </div>

      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Teléfono</label>
          <input value={draft.telefono} onChange={e => patch('telefono', e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input value={draft.email} onChange={e => patch('email', e.target.value)} style={INPUT} />
        </div>
      </div>

      <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={LABEL}>Latitud (opcional)</label>
          <input type="number" step="any" value={draft.latitud} onChange={e => patch('latitud', e.target.value)} placeholder="-34.6536" style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Longitud (opcional)</label>
          <input type="number" step="any" value={draft.longitud} onChange={e => patch('longitud', e.target.value)} placeholder="-58.6783" style={INPUT} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={save} disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Guardando…' : (mode === 'create' ? 'Crear sucursal' : 'Guardar cambios')}
        </button>
      </div>
    </section>
  )
}
