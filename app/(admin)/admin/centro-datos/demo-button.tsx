'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export function DemoButton() {
  const router = useRouter()
  const [busy, setBusy] = useState<'cargar' | 'borrar' | null>(null)

  async function run(accion: 'cargar' | 'borrar') {
    if (accion === 'borrar' && !confirm('¿Borrar todos los datos demo del Centro de Datos?')) return
    setBusy(accion)
    try {
      const r = await fetch('/api/centro-datos/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(accion === 'cargar' ? `Demo cargado (${j.ventas} ventas, ${j.sin_match} sin match)` : 'Demo borrado')
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(null) }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run('cargar')}>
        {busy === 'cargar' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Cargar demo
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={!!busy} onClick={() => run('borrar')}>
        {busy === 'borrar' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Borrar demo
      </Button>
    </div>
  )
}
