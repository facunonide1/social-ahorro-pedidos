'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ProveedorCuentaBancaria, TipoCuentaBancaria } from '@/lib/types/admin'

const BTN: React.CSSProperties = {
  padding: '8px 12px', border: 'none', borderRadius: 10,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1.5px solid #f0ede8',
  borderRadius: 10, fontSize: 13, background: '#faf8f5', color: '#2a2a2a',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

type Draft = {
  banco: string
  tipo_cuenta: TipoCuentaBancaria | ''
  cbu: string
  alias: string
  titular: string
  cuit_titular: string
  es_principal: boolean
}

function empty(): Draft { return { banco: '', tipo_cuenta: '', cbu: '', alias: '', titular: '', cuit_titular: '', es_principal: false } }

export default function CuentasSection({
  proveedorId, initial, readOnly,
}: {
  proveedorId: string
  initial: ProveedorCuentaBancaria[]
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
      banco: adding.banco.trim() || null,
      tipo_cuenta: adding.tipo_cuenta || null,
      cbu: adding.cbu.trim() || null,
      alias: adding.alias.trim() || null,
      titular: adding.titular.trim() || null,
      cuit_titular: adding.cuit_titular.replace(/\D/g, '') || null,
      es_principal: adding.es_principal,
    }
    const { data, error } = await sb.from('proveedor_cuentas_bancarias').insert(payload).select('*').maybeSingle<ProveedorCuentaBancaria>()
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (data) setRows(arr => [data, ...arr])
    setAdding(null); router.refresh()
  }

  async function remove(c: ProveedorCuentaBancaria) {
    if (!confirm('¿Borrar esta cuenta bancaria?')) return
    const { error } = await sb.from('proveedor_cuentas_bancarias').delete().eq('id', c.id)
    if (error) { setErr(error.message); return }
    setRows(arr => arr.filter(x => x.id !== c.id))
    router.refresh()
  }

  async function togglePrincipal(c: ProveedorCuentaBancaria) {
    const next = !c.es_principal
    const { error } = await sb.from('proveedor_cuentas_bancarias').update({ es_principal: next }).eq('id', c.id)
    if (error) { setErr(error.message); return }
    setRows(arr => arr.map(x => x.id === c.id ? { ...x, es_principal: next } : x))
    router.refresh()
  }

  if (readOnly && rows.length === 0) return null

  return (
    <section style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.4px' }}>CUENTAS BANCARIAS ({rows.length})</div>
        {!readOnly && (
          <button onClick={() => setAdding(adding ? null : empty())}
            style={{ ...BTN, background: adding ? '#f0ede8' : '#726DFF', color: adding ? '#666' : '#fff' }}>
            {adding ? 'Cancelar' : '+ Agregar cuenta'}
          </button>
        )}
      </div>

      {err && (
        <div style={{ background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 10, padding: 10, fontSize: 12, color: '#FF6D6E' }}>{err}</div>
      )}

      {adding && (
        <div style={{ background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input placeholder="Banco" value={adding.banco} onChange={e => setAdding({ ...adding, banco: e.target.value })} style={INPUT} />
            <select value={adding.tipo_cuenta} onChange={e => setAdding({ ...adding, tipo_cuenta: e.target.value as any })} style={INPUT}>
              <option value="">Tipo de cuenta…</option>
              <option value="cuenta_corriente">Cuenta corriente</option>
              <option value="caja_ahorro">Caja de ahorro</option>
            </select>
          </div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input placeholder="CBU (22 dígitos)" value={adding.cbu} onChange={e => setAdding({ ...adding, cbu: e.target.value })} style={INPUT} />
            <input placeholder="Alias" value={adding.alias} onChange={e => setAdding({ ...adding, alias: e.target.value })} style={INPUT} />
          </div>
          <div className="sa-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input placeholder="Titular" value={adding.titular} onChange={e => setAdding({ ...adding, titular: e.target.value })} style={INPUT} />
            <input placeholder="CUIT titular" value={adding.cuit_titular} onChange={e => setAdding({ ...adding, cuit_titular: e.target.value })} style={INPUT} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
              <input type="checkbox" checked={adding.es_principal} onChange={e => setAdding({ ...adding, es_principal: e.target.checked })} />
              Cuenta principal (la usada por defecto para pagos)
            </label>
            <button onClick={add} disabled={busy}
              style={{ ...BTN, background: '#FF6D6E', color: '#fff' }}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: '#aaa' }}>Sin cuentas bancarias cargadas.</div>
      )}

      {rows.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#faf8f5', border: '0.5px solid #f0ede8', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {c.banco || '(sin banco)'}
              {c.es_principal && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Principal</span>}
              {c.tipo_cuenta && <span style={{ marginLeft: 6, fontSize: 10, color: '#666' }}>· {c.tipo_cuenta === 'cuenta_corriente' ? 'CC' : 'CA'}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2, fontFamily: c.cbu ? 'ui-monospace, monospace' : 'inherit' }}>
              {c.cbu ? `CBU ${c.cbu}` : null}
              {c.cbu && c.alias ? ' · ' : null}
              {c.alias || null}
            </div>
            {(c.titular || c.cuit_titular) && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                {c.titular || '—'}{c.cuit_titular ? ` · CUIT ${c.cuit_titular}` : ''}
              </div>
            )}
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
