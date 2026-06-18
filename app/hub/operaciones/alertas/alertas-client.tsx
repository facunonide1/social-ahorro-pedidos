'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Ban, TrendingDown, Ghost, CalendarClock, PackageX, Check, X, RefreshCw, ShoppingCart, ArrowRightLeft, Tag, ClipboardList, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type AlertaRow = {
  id: string; tipo: string; severidad: 'info' | 'warning' | 'critica'
  datos: any; producto_id: string | null; sucursal_id: string | null; created_at: string
}
type Suc = { id: string; nombre: string }

const META: Record<string, { label: string; icon: React.ReactNode }> = {
  stock_critico: { label: 'Stock crítico', icon: <PackageX className="size-4" /> },
  quiebre_proyectado: { label: 'Quiebre proyectado', icon: <TrendingDown className="size-4" /> },
  sobrestock: { label: 'Sobrestock', icon: <Ban className="size-4" /> },
  sin_rotacion: { label: 'Sin rotación', icon: <TrendingDown className="size-4" /> },
  stock_fantasma: { label: 'Stock fantasma', icon: <Ghost className="size-4" /> },
  vencimiento_15: { label: 'Vence ≤15 días', icon: <CalendarClock className="size-4" /> },
  vencimiento_30: { label: 'Vence ≤30 días', icon: <CalendarClock className="size-4" /> },
  vencimiento_60: { label: 'Vence ≤60 días', icon: <CalendarClock className="size-4" /> },
  vencimiento_90: { label: 'Vence ≤90 días', icon: <CalendarClock className="size-4" /> },
}
const SEV = {
  critica: { bar: 'border-l-rose-500', txt: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/5' },
  warning: { bar: 'border-l-amber-500', txt: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5' },
  info: { bar: 'border-l-sky-500', txt: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/5' },
}

export function AlertasClient({ alertas, sucursales, puedeRegenerar }: { alertas: AlertaRow[]; sucursales: Suc[]; puedeRegenerar: boolean }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<'todas' | 'criticas'>('todas')
  const [suc, setSuc] = useState('__all__')
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => alertas.filter((a) => {
    if (filtro === 'criticas' && a.severidad !== 'critica') return false
    if (suc !== '__all__' && a.sucursal_id !== suc) return false
    return true
  }), [alertas, filtro, suc])

  const criticas = alertas.filter((a) => a.severidad === 'critica').length

  async function accion(id: string, accion: 'atender' | 'descartar') {
    const r = await fetch('/api/inventario/alertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, accion }) })
    if (!r.ok) { toast.error('No se pudo actualizar.'); return }
    toast.success(accion === 'atender' ? 'Alerta atendida.' : 'Alerta descartada.')
    router.refresh()
  }
  async function regenerar() {
    setBusy(true)
    try {
      const r = await fetch('/api/cron/alertas-stock', { method: 'POST' })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Alertas regeneradas: ${j.alertas}.`); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([['todas', `Todas (${alertas.length})`], ['criticas', `Críticas (${criticas})`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className={cn('rounded-full border px-3 py-1 text-xs', filtro === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent')}>{l}</button>
            ))}
          </div>
          <Select value={suc} onValueChange={setSuc}><SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Todas las sucursales</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent></Select>
        </div>
        {puedeRegenerar && <Button variant="outline" size="sm" disabled={busy} onClick={regenerar}><RefreshCw className={cn('size-4', busy && 'animate-spin')} /> Regenerar</Button>}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <div><div className="font-medium">Sin alertas activas</div><div className="mt-0.5 text-sm text-muted-foreground">Todo en orden por ahora.</div></div>
        </div>
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {rows.map((a) => {
            const sev = SEV[a.severidad]; const meta = META[a.tipo] ?? { label: a.tipo, icon: <AlertTriangle className="size-4" /> }
            return (
              <div key={a.id} className={cn('rounded-lg border border-l-[3px] p-3', sev.bar, sev.bg)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn('flex items-center gap-1.5 text-xs font-semibold', sev.txt)}>{meta.icon} {meta.label}</div>
                    <div className="mt-0.5 truncate text-sm font-medium">{a.datos?.nombre ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{descripcion(a)}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => accion(a.id, 'atender')} aria-label="Atender"><Check className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => accion(a.id, 'descartar')} aria-label="Descartar"><X className="size-4" /></Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">{acciones(a)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function descripcion(a: AlertaRow): string {
  const d = a.datos ?? {}
  const suc = d.sucursal ? ` · ${d.sucursal}` : ''
  switch (a.tipo) {
    case 'stock_critico': return `Stock ${d.stock} (mín ${d.min})${suc}`
    case 'quiebre_proyectado': return `Quiebre en ~${d.dias} días${suc}`
    case 'sobrestock': return `Stock ${d.stock} > máximo ${d.max}${suc}`
    case 'sin_rotacion': return `Stock ${d.stock}, sin ventas${suc}`
    case 'stock_fantasma': return `Stock ${d.stock}, sin vender desde ${d.ultima_venta}${suc}`
    default: return `Lote ${d.lote ?? 's/n'}: ${d.cantidad} u vencen ${d.vence}${suc}`
  }
}

function acciones(a: AlertaRow) {
  const btn = (href: string, label: string, icon: React.ReactNode) => (
    <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href={href}>{icon} {label}</Link></Button>
  )
  if (a.tipo === 'stock_fantasma') return btn('/admin/tareas', 'Tarea: revisar físico', <ClipboardList className="size-3.5" />)
  if (a.tipo === 'quiebre_proyectado' || a.tipo === 'stock_critico') return <>{btn('/hub/operaciones/reposicion', 'Reponer', <ShoppingCart className="size-3.5" />)}{btn('/hub/operaciones/transferencias/nueva', 'Pedir a sucursal', <ArrowRightLeft className="size-3.5" />)}</>
  if (a.tipo === 'sobrestock') return <>{btn('/hub/operaciones/transferencias', 'Redistribuir', <ArrowRightLeft className="size-3.5" />)}</>
  if (a.tipo === 'sin_rotacion') return btn('/hub/operaciones/analisis', 'Ver análisis', <TrendingDown className="size-3.5" />)
  if (a.tipo.startsWith('vencimiento')) return <>{btn('/hub/operaciones/vencimientos', 'Ver en vencimientos', <CalendarClock className="size-3.5" />)}</>
  return null
}
