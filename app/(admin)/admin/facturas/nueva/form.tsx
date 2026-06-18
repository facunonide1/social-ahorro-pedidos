'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { TipoFactura } from '@/lib/types/admin'

import { Alert, AlertDescription } from '@/components/ui/alert'
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

const NONE = '__none__'
const TIPOS: TipoFactura[] = ['A', 'B', 'C', 'M']
const ALICUOTAS: { value: string; label: string }[] = [
  { value: '0', label: '0%' },
  { value: '10.5', label: '10,5%' },
  { value: '21', label: '21%' },
  { value: '27', label: '27%' },
]

type Prov = { id: string; razon_social: string; plazo_pago_dias: number }
type Suc = { id: string; nombre: string }
type Item = {
  descripcion: string
  cantidad: string
  precio_unitario: string
  alicuota_iva: string
}

function emptyItem(): Item {
  return { descripcion: '', cantidad: '1', precio_unitario: '', alicuota_iva: '21' }
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export default function NuevaFacturaForm({
  proveedores,
  sucursales,
}: {
  proveedores: Prov[]
  sucursales: Suc[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    proveedor_id: '',
    sucursal_id: '',
    tipo_factura: 'A' as TipoFactura,
    punto_venta: '',
    numero_factura: '',
    cae: '',
    cae_vencimiento: '',
    fecha_emision: today,
    fecha_vencimiento: '',
    percepciones: '0',
    retenciones: '0',
    observaciones: '',
  })
  const [items, setItems] = useState<Item[]>([emptyItem()])

  const totales = useMemo(() => {
    let subtotal = 0
    let iva21 = 0
    let iva105 = 0
    let iva27 = 0
    for (const it of items) {
      const qty = Number(it.cantidad) || 0
      const price = Number(it.precio_unitario) || 0
      const ali = Number(it.alicuota_iva) || 0
      const sub = qty * price
      subtotal += sub
      const ivaImporte = sub * (ali / 100)
      if (ali === 21) iva21 += ivaImporte
      else if (ali === 10.5) iva105 += ivaImporte
      else if (ali === 27) iva27 += ivaImporte
    }
    const perc = Number(form.percepciones) || 0
    const ret = Number(form.retenciones) || 0
    const total = subtotal + iva21 + iva105 + iva27 + perc - ret
    return { subtotal, iva21, iva105, iva27, perc, ret, total }
  }, [items, form.percepciones, form.retenciones])

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
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)))
  }

  function onProveedorChange(pid: string) {
    patchForm('proveedor_id', pid)
    if (!form.fecha_vencimiento && form.fecha_emision) {
      const prov = proveedores.find((p) => p.id === pid)
      if (prov?.plazo_pago_dias) {
        const venc = addDays(new Date(form.fecha_emision), prov.plazo_pago_dias)
        patchForm('fecha_vencimiento', venc.toISOString().slice(0, 10))
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.proveedor_id) {
      setErr('Elegí un proveedor.')
      return
    }
    if (!form.punto_venta || !form.numero_factura) {
      setErr('Punto de venta y número son obligatorios.')
      return
    }
    if (!form.fecha_vencimiento) {
      setErr('Falta fecha de vencimiento.')
      return
    }
    const cleanItems = items.filter(
      (it) => it.descripcion.trim() && Number(it.cantidad) > 0,
    )

    setBusy(true)
    const { data: facData, error: facErr } = await sb
      .from('facturas_proveedor')
      .insert({
        proveedor_id: form.proveedor_id,
        sucursal_id: form.sucursal_id || null,
        tipo_factura: form.tipo_factura,
        punto_venta: form.punto_venta.trim(),
        numero_factura: form.numero_factura.trim(),
        cae: form.cae.trim() || null,
        cae_vencimiento: form.cae_vencimiento || null,
        fecha_emision: form.fecha_emision,
        fecha_vencimiento: form.fecha_vencimiento,
        subtotal: totales.subtotal,
        iva_21: totales.iva21,
        iva_105: totales.iva105,
        iva_27: totales.iva27,
        percepciones: totales.perc,
        retenciones: totales.ret,
        total: totales.total,
        estado: 'borrador',
        observaciones: form.observaciones.trim() || null,
      })
      .select('id')
      .maybeSingle<{ id: string }>()

    if (facErr || !facData) {
      setBusy(false)
      const code = (facErr as { code?: string } | null)?.code
      if (code === '23505') {
        setErr(
          'Ya existe una factura con ese tipo + punto de venta + número para este proveedor.',
        )
      } else {
        setErr(facErr?.message || 'Error al crear la factura.')
      }
      return
    }

    if (cleanItems.length > 0) {
      const itemsPayload = cleanItems.map((it) => {
        const qty = Number(it.cantidad)
        const price = Number(it.precio_unitario) || 0
        return {
          factura_id: facData.id,
          descripcion: it.descripcion.trim(),
          cantidad: qty,
          precio_unitario: price,
          subtotal: qty * price,
          alicuota_iva: Number(it.alicuota_iva) || 0,
        }
      })
      await sb.from('factura_items').insert(itemsPayload)
    }

    setBusy(false)
    router.push(`/admin/facturas/${facData.id}`)
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
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Proveedor y sucursal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Proveedor *">
              <Select
                value={form.proveedor_id || NONE}
                onValueChange={(v) => onProveedorChange(v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Elegí proveedor —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Elegí proveedor —</SelectItem>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sucursal (opcional)">
              <Select
                value={form.sucursal_id || NONE}
                onValueChange={(v) => patchForm('sucursal_id', v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Comprobante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-[0.5fr_1fr_1.5fr]">
            <Field label="Tipo *">
              <Select
                value={form.tipo_factura}
                onValueChange={(v) => patchForm('tipo_factura', v as TipoFactura)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Punto de venta *">
              <Input
                value={form.punto_venta}
                onChange={(e) => patchForm('punto_venta', e.target.value)}
                placeholder="00001"
                required
              />
            </Field>
            <Field label="Número *">
              <Input
                value={form.numero_factura}
                onChange={(e) => patchForm('numero_factura', e.target.value)}
                placeholder="00012345"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CAE">
              <Input
                value={form.cae}
                onChange={(e) => patchForm('cae', e.target.value)}
              />
            </Field>
            <Field label="Vencimiento CAE">
              <Input
                type="date"
                value={form.cae_vencimiento}
                onChange={(e) => patchForm('cae_vencimiento', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha emisión *">
              <Input
                type="date"
                value={form.fecha_emision}
                onChange={(e) => patchForm('fecha_emision', e.target.value)}
                required
              />
            </Field>
            <Field label="Fecha vencimiento *">
              <Input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => patchForm('fecha_vencimiento', e.target.value)}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Items
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-4" />
            Agregar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[3fr_0.7fr_1fr_0.7fr_auto] sm:items-end"
            >
              <Field label={i === 0 ? 'Descripción' : undefined}>
                <Input
                  value={it.descripcion}
                  onChange={(e) => patchItem(i, { descripcion: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? 'Cant.' : undefined}>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={it.cantidad}
                  onChange={(e) => patchItem(i, { cantidad: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? 'Precio unit.' : undefined}>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={it.precio_unitario}
                  onChange={(e) => patchItem(i, { precio_unitario: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? 'IVA %' : undefined}>
                <Select
                  value={it.alicuota_iva}
                  onValueChange={(v) => patchItem(i, { alicuota_iva: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALICUOTAS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Ajustes y totales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Percepciones">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.percepciones}
                onChange={(e) => patchForm('percepciones', e.target.value)}
              />
            </Field>
            <Field label="Retenciones">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.retenciones}
                onChange={(e) => patchForm('retenciones', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right tabular-nums">
              ${totales.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            {totales.iva21 > 0 && (
              <>
                <span className="text-muted-foreground">IVA 21%</span>
                <span className="text-right tabular-nums">
                  ${totales.iva21.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            {totales.iva105 > 0 && (
              <>
                <span className="text-muted-foreground">IVA 10,5%</span>
                <span className="text-right tabular-nums">
                  ${totales.iva105.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            {totales.iva27 > 0 && (
              <>
                <span className="text-muted-foreground">IVA 27%</span>
                <span className="text-right tabular-nums">
                  ${totales.iva27.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            {totales.perc > 0 && (
              <>
                <span className="text-muted-foreground">Percepciones</span>
                <span className="text-right tabular-nums">
                  +${totales.perc.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            {totales.ret > 0 && (
              <>
                <span className="text-muted-foreground">Retenciones</span>
                <span className="text-right tabular-nums text-destructive">
                  -${totales.ret.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </>
            )}
            <span className="mt-1 border-t border-border pt-2 text-base font-bold">
              TOTAL
            </span>
            <span className="mt-1 border-t border-border pt-2 text-right text-base font-bold tabular-nums">
              ${totales.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <Field label="Observaciones">
            <Textarea
              value={form.observaciones}
              onChange={(e) => patchForm('observaciones', e.target.value)}
              rows={2}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              Crear factura
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </Label>
      )}
      {children}
    </div>
  )
}
