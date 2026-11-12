'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

/** Elegir de qué sucursal despacha un canal. Sólo lo ve quien puede cambiarlo. */
export function SucursalDespacho({ canalId, actual, sucursales }: {
  canalId: string
  actual: string | null
  sucursales: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [valor, setValor] = useState(actual ?? '')
  const [guardando, setGuardando] = useState(false)

  async function guardar(nuevo: string) {
    setValor(nuevo)
    setGuardando(true)
    try {
      const r = await fetch(`/api/canales/${encodeURIComponent(canalId)}/sucursal-despacho`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sucursal_id: nuevo || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? 'no se pudo guardar')
      toast.success(nuevo ? 'Sucursal de despacho guardada. Los pedidos nuevos de este canal salen de ahí.' : 'Sucursal de despacho borrada.')
      router.refresh()
    } catch (e: any) {
      setValor(actual ?? '')
      toast.error(e?.message ?? 'Error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Despacha desde</span>
      <select
        value={valor}
        disabled={guardando}
        onChange={(e) => guardar(e.target.value)}
        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
      >
        <option value="">— sin definir —</option>
        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
    </label>
  )
}
