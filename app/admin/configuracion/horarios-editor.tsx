'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AppSettings } from '@/lib/types'

function fmtHour(h: number) { return `${String(h).padStart(2,'0')}:00` }

const BTN: React.CSSProperties = {
  padding: '10px 14px', border: 'none', borderRadius: 12,
  fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
}

const SELECT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #f0ede8',
  borderRadius: 12, fontSize: 14, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

export default function HorariosEditor({ initial }: { initial: AppSettings }) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen]   = useState<number>(initial.hora_apertura)
  const [close, setClose] = useState<number>(initial.hora_cierre)
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState<string | null>(null)
  const [msg, setMsg]     = useState<string | null>(null)

  const dirty = open !== initial.hora_apertura || close !== initial.hora_cierre
  const invalid = open >= close

  async function save() {
    setErr(null); setMsg(null)
    if (invalid) { setErr('La apertura tiene que ser antes del cierre.'); return }
    setBusy(true)
    const { error, data } = await sb
      .from('app_settings')
      .update({ hora_apertura: open, hora_cierre: close })
      .eq('id', 1)
      .select('*')
      .maybeSingle<AppSettings>()
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data) {
      setMsg(`Guardado. Los pedidos fuera de ${fmtHour(data.hora_apertura)} a ${fmtHour(data.hora_cierre)} quedarán marcados como "fuera de horario".`)
      router.refresh()
      setTimeout(() => setMsg(null), 5000)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={LABEL}>Hora de apertura</label>
          <select value={open} onChange={e => setOpen(Number(e.target.value))} style={SELECT}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{fmtHour(h)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={LABEL}>Hora de cierre</label>
          <select value={close} onChange={e => setClose(Number(e.target.value))} style={SELECT}>
            {Array.from({ length: 24 }, (_, h) => h + 1).map(h => (
              <option key={h} value={h}>{h === 24 ? '24:00' : fmtHour(h)}</option>
            ))}
          </select>
        </div>
        <button onClick={save} disabled={busy || !dirty || invalid}
          style={{
            ...BTN, background: '#FF6D6E', color: '#fff',
            opacity: busy || !dirty || invalid ? 0.5 : 1,
            cursor: busy ? 'wait' : (!dirty || invalid ? 'not-allowed' : 'pointer'),
          }}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
        Hora local Argentina. Los pedidos que entran fuera de esta franja —sea por Woo o manualmente— se marcan con
        la etiqueta "Fuera de horario" en el dashboard, para que sean fáciles de identificar al abrir la farmacia.
      </div>
    </div>
  )
}
