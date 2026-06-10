'use client'

import { useEffect, useState } from 'react'
import { Building2, Users, AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatARS } from '@/lib/utils/format'

type SucursalLive = {
  sucursal_id: string
  nombre: string
  codigo: string | null
  health: 'verde' | 'amarillo' | 'rojo'
  facturado_dia: number
  empleados_activos: number
  tickets_dia: number
  alerta: string | null
}

const HEALTH: Record<SucursalLive['health'], string> = {
  verde: 'border-l-emerald-500',
  amarillo: 'border-l-amber-500',
  rojo: 'border-l-rose-500',
}
const DOT: Record<SucursalLive['health'], string> = {
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-rose-500',
}

/** Grid de sucursales en vivo (F6.5.T4). Tolera respuesta vacía. */
export function SucursalesLive() {
  const [data, setData] = useState<SucursalLive[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/sucursales/live-status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (alive) setData(Array.isArray(j?.sucursales) ? j.sucursales : [])
      })
      .catch(() => alive && setData([]))
    return () => {
      alive = false
    }
  }, [])

  if (!data) {
    return (
      <section aria-label="Sucursales en vivo">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Sucursales en vivo
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      </section>
    )
  }

  if (data.length === 0) return null

  return (
    <section aria-label="Sucursales en vivo">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Sucursales en vivo
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.map((s) => (
          <div
            key={s.sucursal_id}
            className={cn(
              'flex flex-col gap-2 rounded-xl border border-l-[3px] bg-card p-4',
              HEALTH[s.health],
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{s.nombre}</span>
              </div>
              <span className={cn('size-2 shrink-0 rounded-full', DOT[s.health])} aria-hidden />
            </div>

            <div
              className={cn(
                'font-mono text-lg font-semibold tabular-nums',
                s.facturado_dia > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {formatARS(s.facturado_dia)}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {s.empleados_activos} activos
              </span>
              <span className="tabular-nums">{s.tickets_dia} tickets</span>
            </div>

            {s.alerta && (
              <div className="flex items-center gap-1 text-xs text-rose-500">
                <AlertTriangle className="size-3" />
                {s.alerta}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
