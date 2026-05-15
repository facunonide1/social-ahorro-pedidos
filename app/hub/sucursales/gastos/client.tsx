'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  CATEGORIA_GASTO_LABELS,
  type CategoriaGasto,
  type GastoOperativo,
} from '@/lib/types/admin'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'
const CATEGORIAS: CategoriaGasto[] = [
  'alquiler',
  'servicios',
  'sueldos',
  'mantenimiento',
  'limpieza',
  'insumos',
  'otros',
]

function fmt(n: number): string {
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}
function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 7)
}

export function GastosClient({
  initial,
  sucursales,
  canWrite,
  userId,
}: {
  initial: GastoOperativo[]
  sucursales: { id: string; nombre: string }[]
  canWrite: boolean
  userId: string
}) {
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [gastos, setGastos] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    categoria: 'servicios' as CategoriaGasto,
    descripcion: '',
    monto: '',
    fecha: today,
    sucursal_id: '',
    proveedor: '',
  })

  const sucById = useMemo(
    () => new Map(sucursales.map((s) => [s.id, s.nombre])),
    [sucursales],
  )

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    const monto = Number(form.monto)
    if (!form.descripcion.trim()) {
      toast.error('Poné una descripción.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido.')
      return
    }
    setBusy(true)
    const { data, error } = await sb
      .from('gastos_operativos')
      .insert({
        categoria: form.categoria,
        descripcion: form.descripcion.trim(),
        monto,
        fecha: form.fecha,
        sucursal_id: form.sucursal_id || null,
        proveedor: form.proveedor.trim() || null,
        periodo: periodoDeFecha(form.fecha),
        pagado: false,
        created_by: userId,
      })
      .select('*')
      .maybeSingle<GastoOperativo>()
    setBusy(false)
    if (error || !data) {
      toast.error(error?.message || 'No se pudo registrar el gasto.')
      return
    }
    setGastos((arr) => [data, ...arr])
    setForm({
      categoria: 'servicios',
      descripcion: '',
      monto: '',
      fecha: today,
      sucursal_id: form.sucursal_id,
      proveedor: '',
    })
    toast.success('Gasto registrado.')
  }

  async function togglePagado(g: GastoOperativo) {
    setTogglingId(g.id)
    const nuevo = !g.pagado
    const { error } = await sb
      .from('gastos_operativos')
      .update({ pagado: nuevo })
      .eq('id', g.id)
    setTogglingId(null)
    if (error) {
      toast.error(error.message)
      return
    }
    setGastos((arr) =>
      arr.map((x) => (x.id === g.id ? { ...x, pagado: nuevo } : x)),
    )
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Registrar gasto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={agregar} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Categoría
                  </Label>
                  <Select
                    value={form.categoria}
                    onValueChange={(v) =>
                      patch('categoria', v as CategoriaGasto)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORIA_GASTO_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Descripción
                  </Label>
                  <Input
                    value={form.descripcion}
                    onChange={(e) => patch('descripcion', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Monto
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => patch('monto', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Fecha
                  </Label>
                  <Input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => patch('fecha', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sucursal
                  </Label>
                  <Select
                    value={form.sucursal_id || NONE}
                    onValueChange={(v) =>
                      patch('sucursal_id', v === NONE ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— General —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— General —</SelectItem>
                      {sucursales.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Proveedor (opcional)
                  </Label>
                  <Input
                    value={form.proveedor}
                    onChange={(e) => patch('proveedor', e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Registrar gasto
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Gastos registrados ({gastos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {gastos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay gastos cargados.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {gastos.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {g.descripcion}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {CATEGORIA_GASTO_LABELS[g.categoria]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(g.fecha).toLocaleDateString('es-AR')}
                      {g.sucursal_id
                        ? ` · ${sucById.get(g.sucursal_id) || 'Sucursal'}`
                        : ' · General'}
                      {g.proveedor ? ` · ${g.proveedor}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {fmt(g.monto)}
                    </span>
                    <Button
                      variant={g.pagado ? 'outline' : 'ghost'}
                      size="sm"
                      disabled={!canWrite || togglingId === g.id}
                      onClick={() => togglePagado(g)}
                      className={cn(
                        'h-7 gap-1 text-xs',
                        g.pagado && 'text-success hover:text-success',
                      )}
                    >
                      {togglingId === g.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      {g.pagado ? 'Pagado' : 'Marcar pagado'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
