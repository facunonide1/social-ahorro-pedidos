'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { CondicionIva } from '@/lib/types/admin'

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

const CATEGORIAS = [
  'Laboratorio', 'Droguería', 'Perfumería', 'Accesorios', 'Servicios', 'Otro',
]

export default function NuevoProveedorForm() {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({
    razon_social: '',
    nombre_comercial: '',
    cuit: '',
    condicion_iva: '' as CondicionIva | '',
    categoria: '',
    domicilio_fiscal: '',
    localidad: '',
    provincia: '',
    codigo_postal: '',
    email_general: '',
    telefono_general: '',
    sitio_web: '',
    plazo_pago_dias: '30',
    descuento_pronto_pago_pct: '0',
    minimo_compra: '0',
    frecuencia_visita_dias: '',
    calificacion_interna: '',
    notas: '',
  })

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)

    if (!form.razon_social.trim()) { setErr('Razón social es obligatoria.'); return }
    const cuit = form.cuit.replace(/\D/g, '')
    if (cuit.length !== 11) { setErr('CUIT debe tener 11 dígitos.'); return }

    setBusy(true)
    const payload = {
      razon_social: form.razon_social.trim(),
      nombre_comercial: form.nombre_comercial.trim() || null,
      cuit,
      condicion_iva: form.condicion_iva || null,
      categoria: form.categoria.trim() || null,
      domicilio_fiscal: form.domicilio_fiscal.trim() || null,
      localidad: form.localidad.trim() || null,
      provincia: form.provincia.trim() || null,
      codigo_postal: form.codigo_postal.trim() || null,
      email_general: form.email_general.trim().toLowerCase() || null,
      telefono_general: form.telefono_general.trim() || null,
      sitio_web: form.sitio_web.trim() || null,
      plazo_pago_dias: Number(form.plazo_pago_dias) || 30,
      descuento_pronto_pago_pct: Number(form.descuento_pronto_pago_pct) || 0,
      minimo_compra: Number(form.minimo_compra) || 0,
      frecuencia_visita_dias: form.frecuencia_visita_dias ? Number(form.frecuencia_visita_dias) : null,
      calificacion_interna: form.calificacion_interna ? Number(form.calificacion_interna) : null,
      notas: form.notas.trim() || null,
    }

    const { data, error } = await sb.from('proveedores').insert(payload).select('id').maybeSingle()
    setBusy(false)
    if (error) {
      // Conflicto típico: CUIT duplicado
      if (error.message.includes('duplicate') || (error as any).code === '23505') {
        setErr('Ya existe un proveedor con ese CUIT.')
      } else {
        setErr(error.message)
      }
      return
    }
    if (data?.id) {
      router.push(`/hub/proveedores/${data.id}`)
      router.refresh()
    } else {
      router.push('/hub/proveedores')
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, padding: 12, fontSize: 13, color: '#FF6D6E' }}>
          ⚠ {err}
        </div>
      )}

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DATOS FISCALES</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Razón social *</label>
            <input value={form.razon_social} onChange={e => patch('razon_social', e.target.value)}
              placeholder="Droguería Norte S.A." style={INPUT} required />
          </div>
          <div>
            <label style={LABEL}>CUIT *</label>
            <input value={form.cuit} onChange={e => patch('cuit', e.target.value)}
              placeholder="30123456789" style={INPUT} required />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Nombre comercial</label>
            <input value={form.nombre_comercial} onChange={e => patch('nombre_comercial', e.target.value)}
              placeholder="Droguería Norte" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Condición IVA</label>
            <select value={form.condicion_iva} onChange={e => patch('condicion_iva', e.target.value as any)} style={INPUT}>
              <option value="">—</option>
              {(['responsable_inscripto','monotributo','exento','consumidor_final'] as CondicionIva[]).map(c => (
                <option key={c} value={c}>{CONDICION_IVA_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={LABEL}>Categoría</label>
          <input list="sa-categorias" value={form.categoria} onChange={e => patch('categoria', e.target.value)}
            placeholder="Laboratorio, Droguería, etc." style={INPUT} />
          <datalist id="sa-categorias">
            {CATEGORIAS.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </section>

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CONTACTO Y DIRECCIÓN</div>
        <div>
          <label style={LABEL}>Domicilio fiscal</label>
          <input value={form.domicilio_fiscal} onChange={e => patch('domicilio_fiscal', e.target.value)} style={INPUT} />
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Localidad</label>
            <input value={form.localidad} onChange={e => patch('localidad', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Provincia</label>
            <input value={form.provincia} onChange={e => patch('provincia', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>CP</label>
            <input value={form.codigo_postal} onChange={e => patch('codigo_postal', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Email general</label>
            <input type="email" value={form.email_general} onChange={e => patch('email_general', e.target.value)}
              placeholder="ventas@proveedor.com" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Teléfono general</label>
            <input value={form.telefono_general} onChange={e => patch('telefono_general', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Sitio web</label>
          <input value={form.sitio_web} onChange={e => patch('sitio_web', e.target.value)}
            placeholder="https://…" style={INPUT} />
        </div>
      </section>

      <section style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CONDICIONES COMERCIALES</div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Plazo de pago (días)</label>
            <input type="number" min="0" step="1" value={form.plazo_pago_dias}
              onChange={e => patch('plazo_pago_dias', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Dto. pronto pago %</label>
            <input type="number" min="0" step="0.1" value={form.descuento_pronto_pago_pct}
              onChange={e => patch('descuento_pronto_pago_pct', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Mínimo compra</label>
            <input type="number" min="0" step="1" value={form.minimo_compra}
              onChange={e => patch('minimo_compra', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Visita cada (días)</label>
            <input type="number" min="0" step="1" value={form.frecuencia_visita_dias}
              onChange={e => patch('frecuencia_visita_dias', e.target.value)} style={INPUT} />
          </div>
        </div>
        <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 12 }}>
          <div>
            <label style={LABEL}>Calificación (1-5)</label>
            <input type="number" min="1" max="5" step="1" value={form.calificacion_interna}
              onChange={e => patch('calificacion_interna', e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Notas internas</label>
            <textarea value={form.notas} onChange={e => patch('notas', e.target.value)}
              rows={2} style={{ ...INPUT, resize: 'vertical' }} />
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="submit" disabled={busy}
          style={{ ...BTN, background: '#FF6D6E', color: '#fff', padding: '12px 22px', fontSize: 14, opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Creando…' : 'Crear proveedor →'}
        </button>
      </div>
    </form>
  )
}
