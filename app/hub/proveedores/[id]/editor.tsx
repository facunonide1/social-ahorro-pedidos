'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { CondicionIva, Proveedor } from '@/lib/types/admin'

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
  razon_social: string
  nombre_comercial: string
  condicion_iva: CondicionIva | ''
  categoria: string
  domicilio_fiscal: string
  localidad: string
  provincia: string
  codigo_postal: string
  email_general: string
  telefono_general: string
  sitio_web: string
  plazo_pago_dias: string
  descuento_pronto_pago_pct: string
  minimo_compra: string
  frecuencia_visita_dias: string
  calificacion_interna: string
  notas: string
  activo: boolean
}

function fromProveedor(p: Proveedor): Draft {
  return {
    razon_social: p.razon_social,
    nombre_comercial: p.nombre_comercial ?? '',
    condicion_iva: p.condicion_iva ?? '',
    categoria: p.categoria ?? '',
    domicilio_fiscal: p.domicilio_fiscal ?? '',
    localidad: p.localidad ?? '',
    provincia: p.provincia ?? '',
    codigo_postal: p.codigo_postal ?? '',
    email_general: p.email_general ?? '',
    telefono_general: p.telefono_general ?? '',
    sitio_web: p.sitio_web ?? '',
    plazo_pago_dias: String(p.plazo_pago_dias ?? 30),
    descuento_pronto_pago_pct: String(p.descuento_pronto_pago_pct ?? 0),
    minimo_compra: String(p.minimo_compra ?? 0),
    frecuencia_visita_dias: p.frecuencia_visita_dias ? String(p.frecuencia_visita_dias) : '',
    calificacion_interna: p.calificacion_interna ? String(p.calificacion_interna) : '',
    notas: p.notas ?? '',
    activo: p.activo,
  }
}

export default function ProveedorEditor({ initial, readOnly }: { initial: Proveedor; readOnly: boolean }) {
  const router = useRouter()
  const sb = createClient()
  const [draft, setDraft] = useState<Draft>(fromProveedor(initial))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const original = fromProveedor(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v }))
  }

  async function save() {
    setBusy(true); setErr(null); setMsg(null)
    const payload = {
      razon_social: draft.razon_social.trim(),
      nombre_comercial: draft.nombre_comercial.trim() || null,
      condicion_iva: draft.condicion_iva || null,
      categoria: draft.categoria.trim() || null,
      domicilio_fiscal: draft.domicilio_fiscal.trim() || null,
      localidad: draft.localidad.trim() || null,
      provincia: draft.provincia.trim() || null,
      codigo_postal: draft.codigo_postal.trim() || null,
      email_general: draft.email_general.trim().toLowerCase() || null,
      telefono_general: draft.telefono_general.trim() || null,
      sitio_web: draft.sitio_web.trim() || null,
      plazo_pago_dias: Number(draft.plazo_pago_dias) || 30,
      descuento_pronto_pago_pct: Number(draft.descuento_pronto_pago_pct) || 0,
      minimo_compra: Number(draft.minimo_compra) || 0,
      frecuencia_visita_dias: draft.frecuencia_visita_dias ? Number(draft.frecuencia_visita_dias) : null,
      calificacion_interna: draft.calificacion_interna ? Number(draft.calificacion_interna) : null,
      notas: draft.notas.trim() || null,
      activo: draft.activo,
    }
    const { error } = await sb.from('proveedores').update(payload).eq('id', initial.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMsg('Cambios guardados.')
    router.refresh()
    setTimeout(() => setMsg(null), 2500)
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS DEL PROVEEDOR</div>
        {!readOnly && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.activo} onChange={e => patch('activo', e.target.checked)} />
            Activo
          </label>
        )}
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}
      {msg && (
        <div style={{ background: '#eaf7ef', border: '0.5px solid #8fd1a8', borderRadius: 10, padding: 10, fontSize: 12, color: '#1f8a4c' }}>{msg}</div>
      )}

      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Razón social</label>
            <input value={draft.razon_social} onChange={e => patch('razon_social', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Condición IVA</label>
            <select value={draft.condicion_iva} onChange={e => patch('condicion_iva', e.target.value as any)} style={INPUT}>
              <option value="">—</option>
              {(['responsable_inscripto','monotributo','exento','consumidor_final'] as CondicionIva[]).map(c => (
                <option key={c} value={c}>{CONDICION_IVA_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Nombre comercial</label>
            <input value={draft.nombre_comercial} onChange={e => patch('nombre_comercial', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Categoría</label>
            <input value={draft.categoria} onChange={e => patch('categoria', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Domicilio fiscal</label>
          <input value={draft.domicilio_fiscal} onChange={e => patch('domicilio_fiscal', e.target.value)} style={INPUT} />
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Localidad</label>
            <input value={draft.localidad} onChange={e => patch('localidad', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Provincia</label>
            <input value={draft.provincia} onChange={e => patch('provincia', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>CP</label>
            <input value={draft.codigo_postal} onChange={e => patch('codigo_postal', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Email</label>
            <input value={draft.email_general} onChange={e => patch('email_general', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Teléfono</label>
            <input value={draft.telefono_general} onChange={e => patch('telefono_general', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Sitio web</label>
            <input value={draft.sitio_web} onChange={e => patch('sitio_web', e.target.value)} style={INPUT} />
          </div>
        </div>

        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Plazo pago (d)</label>
            <input type="number" min="0" value={draft.plazo_pago_dias} onChange={e => patch('plazo_pago_dias', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Dto. pronto %</label>
            <input type="number" min="0" step="0.1" value={draft.descuento_pronto_pago_pct} onChange={e => patch('descuento_pronto_pago_pct', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Mínimo compra</label>
            <input type="number" min="0" value={draft.minimo_compra} onChange={e => patch('minimo_compra', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Visita cada (d)</label>
            <input type="number" min="0" value={draft.frecuencia_visita_dias} onChange={e => patch('frecuencia_visita_dias', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Calificación (1-5)</label>
            <input type="number" min="1" max="5" value={draft.calificacion_interna} onChange={e => patch('calificacion_interna', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notas internas</label>
          <textarea value={draft.notas} onChange={e => patch('notas', e.target.value)} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setDraft(fromProveedor(initial))}
              disabled={busy || !dirty}
              style={{ ...BTN, background: '#fff', color: '#666', border: '1.5px solid #f0ede8', opacity: busy || !dirty ? 0.5 : 1, cursor: busy || !dirty ? 'not-allowed' : 'pointer' }}>
              Descartar
            </button>
            <button type="button" onClick={save}
              disabled={busy || !dirty}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy || !dirty ? 0.5 : 1, cursor: busy ? 'wait' : (!dirty ? 'not-allowed' : 'pointer') }}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </fieldset>
    </section>
  )
}
