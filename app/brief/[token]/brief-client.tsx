'use client'

import { useState } from 'react'
import { Copy, Check, Megaphone } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type Producto = { nombre: string; precioBase: number | null; precioOferta: number | null }
type Oferta = { id: string; nombre: string; tipo: string; valor: number | null; nx: number | null; ny: number | null; fecha_inicio: string | null; fecha_fin: string | null }

function condicion(o: Oferta): string {
  if (o.tipo === 'porcentaje_descuento') return `${o.valor ?? 0}% OFF`
  if (o.tipo === 'precio_fijo') return `Precio especial`
  if (o.tipo === '2x1') return '2x1'
  if (o.tipo === 'nxm') return `${o.nx ?? 0}x${o.ny ?? 0}`
  if (o.tipo === 'segunda_unidad_pct') return `2ª unidad al ${o.valor ?? 0}%`
  return 'Promo especial'
}

export function BriefPublico({ token, estado, copy, oferta, productos, sucursales }: { token: string; estado: string; copy: string; oferta: Oferta; productos: Producto[]; sucursales: string[] }) {
  const [pub, setPub] = useState(estado === 'publicado')
  const [busy, setBusy] = useState(false)

  async function copiar() { try { await navigator.clipboard.writeText(copy); toast.success('Copy copiado.') } catch { toast.error('No se pudo copiar.') } }
  async function marcarPublicado() {
    setBusy(true)
    try {
      const r = await fetch('/api/ofertas/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, accion: 'publicado' }) })
      if (!r.ok) throw new Error()
      setPub(true); toast.success('¡Marcado como publicado!')
    } catch { toast.error('No se pudo marcar.') } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 p-5">
      <div className="flex items-center gap-2 text-primary"><Megaphone className="size-5" /><span className="text-sm font-semibold">Brief de oferta · Social Ahorro</span></div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h1 className="text-xl font-bold">{oferta.nombre}</h1>
        <div className="mt-1 text-2xl font-black text-primary">{condicion(oferta)}</div>
        {(oferta.fecha_inicio || oferta.fecha_fin) && <div className="mt-1 text-sm text-muted-foreground">Vigencia: {oferta.fecha_inicio ?? '?'} → {oferta.fecha_fin ?? 'sin fin'}</div>}
        {sucursales.length > 0 && <div className="mt-1 text-xs text-muted-foreground">Sucursales: {sucursales.join(', ')}</div>}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Productos</h2>
        <div className="space-y-1">
          {productos.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between rounded-md border border-border px-3 py-1.5 text-sm">
              <span>{p.nombre}</span>
              <span className="text-right">{p.precioOferta != null ? <b>${p.precioOferta.toLocaleString('es-AR')}</b> : condicion(oferta)}{p.precioBase != null && p.precioOferta != null && <span className="ml-1 text-xs text-muted-foreground line-through">${p.precioBase.toLocaleString('es-AR')}</span>}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="mb-1 flex items-center justify-between"><h2 className="text-sm font-semibold">Copy sugerido</h2><Button size="sm" variant="outline" onClick={copiar}><Copy className="size-3.5" /> Copiar</Button></div>
        <pre className="whitespace-pre-wrap font-sans text-sm">{copy}</pre>
      </div>

      {pub ? (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-4" /> Publicado</div>
      ) : (
        <Button size="lg" className="w-full" disabled={busy} onClick={marcarPublicado}><Check className="size-4" /> {busy ? '…' : 'Marcar como publicado'}</Button>
      )}
    </div>
  )
}
