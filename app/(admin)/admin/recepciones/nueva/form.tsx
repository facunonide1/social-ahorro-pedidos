'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FacturaBadgeVariant } from '@/lib/admin-hub/factura'

const NONE = '__none__'

type Suc = { id: string; nombre: string }

type Item = {
  descripcion: string
  cantidad_pedida: string
  cantidad_recibida: string
  cantidad_danada: string
  fecha_vencimiento_producto: string
  observaciones: string
}

function emptyItem(): Item {
  return {
    descripcion: '',
    cantidad_pedida: '',
    cantidad_recibida: '',
    cantidad_danada: '0',
    fecha_vencimiento_producto: '',
    observaciones: '',
  }
}

type EstadoPreview = {
  label: string
  variant: FacturaBadgeVariant
}

export default function NuevaRecepcionForm({
  sucursales,
  forcedSucursalId,
}: {
  sucursales: Suc[]
  forcedSucursalId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const todayLocal = new Date()
  const todayIso = new Date(
    todayLocal.getTime() - todayLocal.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16)

  const [form, setForm] = useState({
    sucursal_id: forcedSucursalId ?? '',
    numero_remito: '',
    fecha_recepcion: todayIso,
    observaciones: '',
  })
  const [items, setItems] = useState<Item[]>([emptyItem()])

  function patchForm<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  function patchItem(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  }
  function addRow() {
    setItems((arr) => [...arr, emptyItem()])
  }
  function removeRow(i: number) {
    setItems((arr) =>
      arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i),
    )
  }

  const estadoPreview: EstadoPreview = useMemo(() => {
    const rows = items.filter((it) => it.descripcion.trim())
    if (rows.length === 0) return { label: 'Completa', variant: 'success' }
    let totalPedido = 0
    let totalRecibido = 0
    let totalDanado = 0
    let huboSobrante = false
    for (const it of rows) {
      const ped = Number(it.cantidad_pedida) || 0
      const rec = Number(it.cantidad_recibida) || 0
      const dan = Number(it.cantidad_danada) || 0
      totalPedido += ped
      totalRecibido += rec
      totalDanado += dan
      if (ped > 0 && rec > ped) huboSobrante = true
    }
    if (totalRecibido === 0 && totalPedido > 0)
      return { label: 'Rechazada', variant: 'outline' }
    if (totalDanado > 0 || huboSobrante)
      return { label: 'Con diferencias', variant: 'destructive' }
    if (totalPedido > 0 && totalRecibido < totalPedido)
      return { label: 'Parcial', variant: 'warning' }
    return { label: 'Completa', variant: 'success' }
  }, [items])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const rows = items.filter((it) => it.descripcion.trim())
    if (rows.length === 0) {
      setErr('Cargá al menos un item con descripción.')
      return
    }

    setBusy(true)
    const res = await fetch('/api/hub/recepciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sucursal_id: form.sucursal_id || null,
        numero_remito: form.numero_remito.trim() || null,
        fecha_recepcion: form.fecha_recepcion
          ? new Date(form.fecha_recepcion).toISOString()
          : null,
        observaciones: form.observaciones.trim() || null,
        items: rows.map((it) => ({
          descripcion: it.descripcion.trim(),
          cantidad_pedida:
            it.cantidad_pedida === '' ? null : Number(it.cantidad_pedida),
          cantidad_recibida:
            it.cantidad_recibida === '' ? null : Number(it.cantidad_recibida),
          cantidad_danada: Number(it.cantidad_danada) || 0,
          fecha_vencimiento_producto: it.fecha_vencimiento_producto || null,
          observaciones: it.observaciones.trim() || null,
        })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setErr(json.hint || json.error || 'No se pudo guardar la recepción.')
      return
    }
    router.push(`/admin/recepciones/${json.recepcionId}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Datos de la recepción
          </CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Estado calculado:
            <Badge variant={estadoPreview.variant}>{estadoPreview.label}</Badge>
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Sucursal">
              <Select
                value={form.sucursal_id || NONE}
                disabled={!!forcedSucursalId}
                onValueChange={(v) => patchForm('sucursal_id', v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Sin asignar —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Sin asignar —</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {forcedSucursalId && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Tu sucursal está fijada por tu rol.
                </div>
              )}
            </Field>
            <Field label="Número de remito">
              <Input
                value={form.numero_remito}
                onChange={(e) => patchForm('numero_remito', e.target.value)}
                placeholder="00012-00045678"
              />
            </Field>
            <Field label="Fecha y hora *">
              <Input
                type="datetime-local"
                value={form.fecha_recepcion}
                onChange={(e) => patchForm('fecha_recepcion', e.target.value)}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Items recibidos
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" />
            Agregar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((it, i) => {
            const ped = Number(it.cantidad_pedida) || 0
            const rec = Number(it.cantidad_recibida) || 0
            const dan = Number(it.cantidad_danada) || 0
            const dif = rec - ped
            const tieneDif = (ped > 0 && rec !== ped) || dan > 0
            return (
              <div
                key={i}
                className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[3fr_0.8fr_0.8fr_0.8fr_1fr_auto] sm:items-end">
                  <Field label="Descripción">
                    <Input
                      value={it.descripcion}
                      onChange={(e) => patchItem(i, { descripcion: e.target.value })}
                    />
                  </Field>
                  <Field label="Pedido">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={it.cantidad_pedida}
                      onChange={(e) =>
                        patchItem(i, { cantidad_pedida: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Recibido">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={it.cantidad_recibida}
                      onChange={(e) =>
                        patchItem(i, { cantidad_recibida: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Dañados">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={it.cantidad_danada}
                      onChange={(e) =>
                        patchItem(i, { cantidad_danada: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Vence">
                    <Input
                      type="date"
                      value={it.fecha_vencimiento_producto}
                      onChange={(e) =>
                        patchItem(i, { fecha_vencimiento_producto: e.target.value })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() => removeRow(i)}
                    aria-label="Quitar item"
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {tieneDif && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">
                      {dan > 0 && <>{dan} dañad{dan === 1 ? 'o' : 'os'}. </>}
                      {ped > 0 && rec !== ped && (
                        dif < 0 ? <>Faltan {Math.abs(dif)}.</> : <>Sobran {dif}.</>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                <Input
                  value={it.observaciones}
                  onChange={(e) => patchItem(i, { observaciones: e.target.value })}
                  placeholder="Observaciones del item (opcional)…"
                  className="text-xs"
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Observaciones generales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.observaciones}
            onChange={(e) => patchForm('observaciones', e.target.value)}
            rows={2}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              Guardar recepción
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
