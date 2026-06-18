'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { MOTIVO_DEVOLUCION_LABELS } from '@/lib/types/admin'
import type { MotivoDevolucion } from '@/lib/types/admin'

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
const MOTIVOS: MotivoDevolucion[] = ['vencimiento', 'dano', 'error_pedido', 'otro']

type Item = {
  producto_id: string
  cantidad: string
  lote: string
  motivo_especifico: string
}

function emptyItem(): Item {
  return { producto_id: '', cantidad: '1', lote: '', motivo_especifico: '' }
}

export default function DevolucionForm({
  proveedores,
  sucursales,
  productos,
}: {
  proveedores: { id: string; razon_social: string }[]
  sucursales: { id: string; nombre: string }[]
  productos: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const sb = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    proveedor_id: '',
    sucursal_id: '',
    fecha: today,
    motivo: 'vencimiento' as MotivoDevolucion,
    numero_remito_devolucion: '',
    observaciones: '',
  })
  const [items, setItems] = useState<Item[]>([emptyItem()])

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  function patchItem(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.proveedor_id || !form.sucursal_id) {
      setErr('Elegí proveedor y sucursal.')
      return
    }
    const cleanItems = items.filter(
      (it) => it.producto_id && Number(it.cantidad) > 0,
    )
    if (cleanItems.length === 0) {
      setErr('Agregá al menos un producto.')
      return
    }
    setBusy(true)
    const { data: dev, error: devErr } = await sb
      .from('devoluciones_proveedor')
      .insert({
        proveedor_id: form.proveedor_id,
        sucursal_id: form.sucursal_id,
        fecha: form.fecha,
        motivo: form.motivo,
        estado: 'registrada',
        numero_remito_devolucion: form.numero_remito_devolucion.trim() || null,
        observaciones: form.observaciones.trim() || null,
      })
      .select('id')
      .maybeSingle<{ id: string }>()
    if (devErr || !dev) {
      setBusy(false)
      setErr(devErr?.message || 'No se pudo crear la devolución.')
      return
    }
    await sb.from('devolucion_items').insert(
      cleanItems.map((it) => ({
        devolucion_id: dev.id,
        producto_id: it.producto_id,
        cantidad: Number(it.cantidad),
        lote: it.lote.trim() || null,
        motivo_especifico: it.motivo_especifico.trim() || null,
      })),
    )
    setBusy(false)
    router.push('/hub/compras/devoluciones')
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
            Datos de la devolución
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Proveedor *">
              <Select
                value={form.proveedor_id || NONE}
                onValueChange={(v) => patch('proveedor_id', v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Elegí —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Elegí —</SelectItem>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sucursal *">
              <Select
                value={form.sucursal_id || NONE}
                onValueChange={(v) => patch('sucursal_id', v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Elegí —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Elegí —</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fecha">
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => patch('fecha', e.target.value)}
              />
            </Field>
            <Field label="Motivo">
              <Select
                value={form.motivo}
                onValueChange={(v) => patch('motivo', v as MotivoDevolucion)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MOTIVO_DEVOLUCION_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="N° remito devolución">
              <Input
                value={form.numero_remito_devolucion}
                onChange={(e) =>
                  patch('numero_remito_devolucion', e.target.value)
                }
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Productos
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((arr) => [...arr, emptyItem()])}
          >
            <Plus className="size-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[3fr_1fr_1.5fr_auto] sm:items-end"
            >
              <Field label={i === 0 ? 'Producto' : undefined}>
                <Select
                  value={it.producto_id || NONE}
                  onValueChange={(v) =>
                    patchItem(i, { producto_id: v === NONE ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Elegí —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Elegí —</SelectItem>
                    {productos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={i === 0 ? 'Cantidad' : undefined}>
                <Input
                  type="number"
                  min={1}
                  value={it.cantidad}
                  onChange={(e) => patchItem(i, { cantidad: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? 'Lote' : undefined}>
                <Input
                  value={it.lote}
                  onChange={(e) => patchItem(i, { lote: e.target.value })}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={items.length === 1}
                onClick={() =>
                  setItems((arr) => arr.filter((_, idx) => idx !== i))
                }
                aria-label="Quitar"
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
            Observaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.observaciones}
            onChange={(e) => patch('observaciones', e.target.value)}
            rows={2}
          />
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
              Registrar devolución
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
