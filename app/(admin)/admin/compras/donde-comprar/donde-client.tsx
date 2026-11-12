'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Oferta = {
  proveedor: string
  precio: number
  precioFinal: number
  esLaMasBarata: boolean
  fechaLista: string | null
  listaVieja: boolean
  dias: number | null
  condiciones: string | null
  bonificacion: string | null
  plazo: string | null
  formaPago: string | null
  origen: string | null
  matchVia: string | null
  matchScore: number | null
}

type Equiv = { productoId: string; nombre: string; relacion: string; motivo: string }

export function DondeComprarClient() {
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [producto, setProducto] = useState<{ nombre: string; sku: string | null } | null>(null)
  const [ofertas, setOfertas] = useState<Oferta[]>([])
  const [equivalentes, setEquivalentes] = useState<Equiv[]>([])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    try {
      const r = await fetch(`/api/compras/donde-comprar?q=${encodeURIComponent(q)}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No pude buscar')
      setProducto(j.producto)
      setOfertas(j.ofertas ?? [])
      setEquivalentes(j.equivalentes ?? [])
    } catch (err: any) {
      setError(err?.message ?? 'Error')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={buscar} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ibuprofeno 400, un EAN o un código" />
        <Button type="submit" disabled={cargando || q.trim().length < 2}>Buscar</Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {producto && <h2 className="text-lg font-medium">{producto.nombre}{producto.sku ? ` · ${producto.sku}` : ''}</h2>}
      {producto && ofertas.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay una lista vigente con este producto. Si el nombre no matcheó, queda en la bandeja de Drive para mapearlo a mano.</p>
      )}
      <ul className="space-y-2">
        {ofertas.map((o) => (
          <li key={o.proveedor + o.precio} className={`rounded-lg border px-4 py-3 text-sm ${o.esLaMasBarata ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{o.proveedor}{o.esLaMasBarata ? ' · más barato' : ''}</span>
              <span className="tabular-nums">${o.precioFinal.toLocaleString('es-AR')}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {o.fechaLista ? `Lista ${String(o.fechaLista).slice(0, 10)}` : 'Sin fecha'}
              {o.dias != null ? ` · hace ${o.dias} días` : ''}
              {o.listaVieja ? ' · lista vieja (más de 30 días)' : ''}
              {o.plazo ? ` · plazo ${o.plazo}` : ''}
              {o.formaPago ? ` · ${o.formaPago}` : ''}
              {o.bonificacion ? ` · bonif. ${o.bonificacion}` : ''}
              {o.condiciones ? ` · ${o.condiciones}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              Origen: {o.origen ?? '—'}
              {o.matchVia ? ` · match ${o.matchVia}${o.matchScore != null ? ` ${Math.round(o.matchScore * 100)}%` : ''}` : ''}
            </div>
          </li>
        ))}
      </ul>
      {equivalentes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Equivalentes</h3>
          <ul className="space-y-1 text-sm">
            {equivalentes.map((e) => (
              <li key={e.productoId}>
                <b>{e.relacion}</b> · {e.nombre} <span className="text-muted-foreground">({e.motivo})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
