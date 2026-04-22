'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ZonaReparto } from '@/lib/types'

const COLOR_PRESETS = ['#FF6D6E', '#726DFF', '#6FEF6C', '#0066cc', '#c6831a', '#a33', '#555']

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
  id?: string
  nombre: string
  descripcion: string
  barriosRaw: string  // coma-separados en el form
  color: string
  activa: boolean
}

function emptyDraft(): Draft {
  return { nombre: '', descripcion: '', barriosRaw: '', color: COLOR_PRESETS[0], activa: true }
}

function draftFromZona(z: ZonaReparto): Draft {
  return {
    id: z.id,
    nombre: z.nombre,
    descripcion: z.descripcion ?? '',
    barriosRaw: z.barrios.join(', '),
    color: z.color,
    activa: z.activa,
  }
}

export default function ZonasEditor({ initialZonas }: { initialZonas: ZonaReparto[] }) {
  const router = useRouter()
  const sb = createClient()
  const [zonas, setZonas] = useState(initialZonas)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const editing = !!draft.id

  function resetDraft() {
    setDraft(emptyDraft()); setErr(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!draft.nombre.trim()) { setErr('El nombre es obligatorio.'); return }
    setBusy(true)

    const payload = {
      nombre: draft.nombre.trim(),
      descripcion: draft.descripcion.trim() || null,
      barrios: draft.barriosRaw.split(',').map(s => s.trim()).filter(Boolean),
      color: draft.color,
      activa: draft.activa,
    }

    if (editing && draft.id) {
      const { error, data } = await sb.from('zonas_reparto').update(payload).eq('id', draft.id).select().maybeSingle<ZonaReparto>()
      if (error) { setErr(error.message); setBusy(false); return }
      if (data) setZonas(arr => arr.map(z => z.id === data.id ? data : z))
    } else {
      const { error, data } = await sb.from('zonas_reparto').insert(payload).select().maybeSingle<ZonaReparto>()
      if (error) { setErr(error.message); setBusy(false); return }
      if (data) setZonas(arr => [data, ...arr])
    }
    setBusy(false)
    resetDraft()
    router.refresh()
  }

  async function toggleActiva(z: ZonaReparto) {
    const { error, data } = await sb.from('zonas_reparto').update({ activa: !z.activa }).eq('id', z.id).select().maybeSingle<ZonaReparto>()
    if (error) { setErr(error.message); return }
    if (data) setZonas(arr => arr.map(x => x.id === data.id ? data : x))
    router.refresh()
  }

  async function remove(z: ZonaReparto) {
    if (!confirm(`¿Eliminar la zona "${z.nombre}"? Los pedidos con esta zona quedan sin asignar pero no se borran.`)) return
    const { error } = await sb.from('zonas_reparto').delete().eq('id', z.id)
    if (error) { setErr(error.message); return }
    setZonas(arr => arr.filter(x => x.id !== z.id))
    if (draft.id === z.id) resetDraft()
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>
          {err}
        </div>
      )}

      {/* FORM */}
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2a2a2a' }}>
          {editing ? 'Editar zona' : 'Nueva zona'}
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Nombre</label>
            <input value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
              placeholder="Ituzaingó Centro" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Descripción</label>
            <input value={draft.descripcion} onChange={e => setDraft({ ...draft, descripcion: e.target.value })}
              placeholder="Microcentro y alrededores" style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Barrios (separados por coma)</label>
          <input value={draft.barriosRaw} onChange={e => setDraft({ ...draft, barriosRaw: e.target.value })}
            placeholder="Centro, Villa Udaondo, Parque Leloir" style={INPUT} />
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
            Te sirve para que operadores sepan a qué zona pertenece una dirección.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={LABEL}>Color</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map(c => {
                const selected = c === draft.color
                return (
                  <button key={c} type="button" onClick={() => setDraft({ ...draft, color: c })}
                    style={{
                      width: 28, height: 28, borderRadius: 999, background: c,
                      border: selected ? '3px solid #2a2a2a' : '1px solid #f0ede8',
                      cursor: 'pointer', padding: 0,
                    }}
                    aria-label={c} />
                )
              })}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2a2a2a', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.activa} onChange={e => setDraft({ ...draft, activa: e.target.checked })} />
            Activa
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {editing && (
            <button type="button" onClick={resetDraft}
              style={{ ...BTN, background: '#fff', color: '#666', border: '1.5px solid #f0ede8' }}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={busy}
            style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear zona'}
          </button>
        </div>
      </form>

      {/* LISTA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {zonas.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: '#aaa', textAlign: 'center' }}>
            Todavía no hay zonas. Creá la primera arriba.
          </div>
        )}
        {zonas.map(z => (
          <div key={z.id} style={{
            display: 'flex', gap: 12, alignItems: 'center',
            background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 12, padding: '10px 12px',
            opacity: z.activa ? 1 : 0.5,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: z.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {z.nombre} {!z.activa && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>(inactiva)</span>}
              </div>
              {z.descripcion && (
                <div style={{ fontSize: 12, color: '#888' }}>{z.descripcion}</div>
              )}
              {z.barrios.length > 0 && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                  {z.barrios.join(' · ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setDraft(draftFromZona(z))}
                style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', padding: '8px 12px' }}>
                Editar
              </button>
              <button onClick={() => toggleActiva(z)}
                style={{ ...BTN, background: '#f0ede8', color: '#666', padding: '8px 12px' }}>
                {z.activa ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => remove(z)}
                style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8', padding: '8px 12px' }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
