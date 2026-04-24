'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProveedorDocumento, ProveedorDocumentoTipo } from '@/lib/types/admin'

const BTN: React.CSSProperties = {
  padding: '8px 12px', border: 'none', borderRadius: 10,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1.5px solid #f0ede8',
  borderRadius: 10, fontSize: 13, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const TIPOS: { value: ProveedorDocumentoTipo; label: string }[] = [
  { value: 'constancia_cuit',  label: 'Constancia CUIT' },
  { value: 'certificado_iibb', label: 'Certificado IIBB' },
  { value: 'convenio',         label: 'Convenio' },
  { value: 'lista_precios',    label: 'Lista de precios' },
  { value: 'otro',             label: 'Otro' },
]

export default function DocumentosSection({
  proveedorId, initial, readOnly,
}: {
  proveedorId: string
  initial: ProveedorDocumento[]
  readOnly: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState(initial)
  const [adding, setAdding] = useState<{
    tipo: ProveedorDocumentoTipo
    nombre: string
    fecha_vencimiento: string
    file: File | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload() {
    if (!adding?.file) return
    setBusy(true); setErr(null)
    const fd = new FormData()
    fd.append('file', adding.file)
    fd.append('tipo', adding.tipo)
    if (adding.nombre.trim()) fd.append('nombre', adding.nombre.trim())
    if (adding.fecha_vencimiento) fd.append('fecha_vencimiento', adding.fecha_vencimiento)
    try {
      const res = await fetch(`/api/hub/proveedores/${proveedorId}/documentos`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || 'error'); return }
      if (json.doc) setRows(arr => [json.doc, ...arr])
      setAdding(null)
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function remove(d: ProveedorDocumento) {
    if (!confirm(`¿Borrar "${d.nombre || 'documento'}"?`)) return
    const res = await fetch(`/api/hub/proveedores/${proveedorId}/documentos/${d.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j?.error || 'error')
      return
    }
    setRows(arr => arr.filter(x => x.id !== d.id))
    router.refresh()
  }

  function vencimientoBadge(d: ProveedorDocumento) {
    if (!d.fecha_vencimiento) return null
    const days = Math.floor((new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86400000)
    if (days < 0) return { text: `Vencido hace ${-days} días`, fg: '#a33', bg: '#fbeaea', border: '#e0a8a8' }
    if (days <= 30) return { text: `Vence en ${days} días`, fg: '#c6831a', bg: '#fff7ec', border: '#edc989' }
    return { text: `Vence ${new Date(d.fecha_vencimiento).toLocaleDateString('es-AR')}`, fg: '#1f8a4c', bg: '#eaf7ef', border: '#8fd1a8' }
  }

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>DOCUMENTOS ({rows.length})</div>
        {!readOnly && (
          <button onClick={() => setAdding(adding ? null : { tipo: 'constancia_cuit', nombre: '', fecha_vencimiento: '', file: null })}
            style={{ ...BTN, background: adding ? '#f0ede8' : '#726DFF', color: adding ? '#666' : '#fff' }}>
            {adding ? 'Cancelar' : '+ Subir documento'}
          </button>
        )}
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}

      {adding && (
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <select value={adding.tipo} onChange={e => setAdding({ ...adding, tipo: e.target.value as ProveedorDocumentoTipo })} style={INPUT}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input placeholder="Nombre visible (opcional)" value={adding.nombre} onChange={e => setAdding({ ...adding, nombre: e.target.value })} style={INPUT} />
          </div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>FECHA DE VENCIMIENTO (opcional)</div>
              <input type="date" value={adding.fecha_vencimiento}
                onChange={e => setAdding({ ...adding, fecha_vencimiento: e.target.value })}
                style={INPUT} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>ARCHIVO (PDF, imagen, etc.)</div>
              <input ref={fileRef} type="file"
                onChange={e => setAdding({ ...adding, file: e.target.files?.[0] ?? null })}
                style={{ ...INPUT, padding: '6px 10px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={upload} disabled={busy || !adding.file}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff', opacity: busy || !adding.file ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Subiendo…' : 'Subir'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: '#aaa' }}>Sin documentos cargados.</div>
      )}

      {rows.map(d => {
        const venc = vencimientoBadge(d)
        return (
          <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {d.nombre || 'documento'}
                <span style={{ fontSize: 9, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '0.5px solid #d9d6ff', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  {TIPOS.find(t => t.value === d.tipo)?.label || d.tipo}
                </span>
                {venc && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: venc.fg, background: venc.bg, border: `0.5px solid ${venc.border}`, padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px' }}>
                    {venc.text}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Subido el {new Date(d.created_at).toLocaleString('es-AR')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <a href={`/api/hub/proveedores/${proveedorId}/documentos/${d.id}`} target="_blank" rel="noreferrer"
                style={{ ...BTN, background: '#fff', color: '#726DFF', border: '1.5px solid #d9d6ff', textDecoration: 'none' }}>
                Abrir
              </a>
              {!readOnly && (
                <button onClick={() => remove(d)}
                  style={{ ...BTN, background: '#fff', color: '#a33', border: '1.5px solid #f0ede8' }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
