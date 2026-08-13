'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AMBITO_TEXTO, type Ambito } from '@/lib/conteo/ambito'
import { exportExcel } from '@/lib/utils/export-excel'

type Lista = {
  id: string
  zona: string
  descripcion: string | null
  punto: string | null
  ambito: Ambito
  items: number
}

/**
 * Las zonas que se pueden contar.
 *
 * Dos acciones y nada más: empezar a contar, y bajarse la lista en Excel con el
 * SKU (regla de oro 6). El resto de lo que se podría hacer con una lista —
 * editarla a mano, reordenarla ítem por ítem— se hace reimportando la planilla,
 * que es donde la arma quien conoce el estante.
 */
export default function ListasClient({ listas }: { listas: Lista[] }) {
  const router = useRouter()
  const [cargando, setCargando] = useState<string | null>(null)

  async function empezar(listaId: string) {
    setCargando(listaId)
    try {
      const res = await fetch('/api/conteo/conteos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listaId }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error ?? 'No se pudo empezar el conteo')
        return
      }
      router.push(`/admin/operaciones/conteos/${j.conteoId}/contar`)
    } catch {
      toast.error('No se pudo empezar el conteo.')
    } finally {
      setCargando(null)
    }
  }

  async function bajar(lista: Lista) {
    const res = await fetch(`/api/conteo/listas/${lista.id}/items`)
    if (!res.ok) {
      toast.error('No se pudo bajar la lista')
      return
    }
    const j = (await res.json()) as {
      items: { orden: number; sku: string | null; descripcion: string; unidad: string | null }[]
    }
    exportExcel(
      `lista-${lista.zona.toLowerCase().replace(/\s+/g, '-')}`,
      j.items.map((i) => ({
        Orden: i.orden,
        SKU: i.sku ?? '',
        Descripción: i.descripcion,
        Unidad: i.unidad ?? '',
      })),
      { sheet: 'Lista' },
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {listas.map((l) => (
        <Card key={l.id} className="flex flex-col gap-3 p-4">
          <div>
            <p className="font-medium">{l.zona}</p>
            <p className="text-xs text-muted-foreground">
              {l.items} item(s){l.punto ? ` · ${l.punto}` : ' · todos los puntos'}
            </p>
            {/* Contra qué se compara. Va en la tarjeta y no escondido en la
                ficha: es lo que decide si un faltante es real. */}
            <p className="mt-1 text-xs">
              <span className="text-muted-foreground">se compara contra:</span>{' '}
              {AMBITO_TEXTO[l.ambito].corto}
            </p>
            {l.descripcion ? (
              <p className="mt-1 text-xs text-muted-foreground">{l.descripcion}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => empezar(l.id)} disabled={cargando === l.id || l.items === 0}>
              {cargando === l.id ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              Contar
            </Button>
            <Button size="sm" variant="outline" onClick={() => bajar(l)}>
              <Download className="mr-2 size-4" />
              Excel
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
