'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

export function DemoSection() {
  const router = useRouter()
  const [busy, setBusy] = useState<'cargar' | 'borrar' | null>(null)

  async function run(accion: 'cargar' | 'borrar') {
    if (accion === 'borrar' && !confirm('¿Borrar TODOS los datos demo? No toca datos reales.')) return
    if (accion === 'cargar' && !confirm('¿Cargar datos demo de tareas y métricas (30 días + agenda de hoy)?')) return
    setBusy(accion)
    try {
      const r = await fetch('/api/admin/demo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success(accion === 'cargar' ? `Demo cargado: ${j.tareas} tareas, ${j.metricas} métricas.` : 'Datos demo eliminados.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Database className="size-5 text-nora" />
        <h2 className="font-medium">Datos de demostración</h2>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Cargá datos demo de tareas y métricas (30 días de cumplimiento por sucursal +
        agenda de hoy con pool, verificaciones y vencidas) para ver el sistema vivo.
        Todo queda marcado como demo y se borra con un click, sin tocar datos reales.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={busy !== null} onClick={() => run('cargar')}>
          {busy === 'cargar' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
          Cargar datos demo
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => run('borrar')}>
          {busy === 'borrar' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Eliminar datos demo
        </Button>
      </div>
    </section>
  )
}
