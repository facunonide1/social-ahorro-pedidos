'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

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

type Suc = { id: string; nombre: string }
type Prod = { id: string; nombre: string; codigo_interno: string | null }
type Item = { producto_id: string; cantidad: string }

export default function TransferenciaForm({
  sucursales,
  productos,
}: {
  sucursales: Suc[]
  productos: Prod[]
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<Item[]>([{ producto_id: '', cantidad: '1' }])

  function patchItem(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!origen || !destino) {
      setErr('Elegí sucursal de origen y destino.')
      return
    }
    if (origen === destino) {
      setErr('El origen y el destino no pueden ser la misma sucursal.')
      return
    }
    const cleanItems = items.filter(
      (it) => it.producto_id && Number(it.cantidad) > 0,
    )
    if (cleanItems.length === 0) {
      setErr('Agregá al menos un producto con cantidad.')
      return
    }

    setBusy(true)
    const { data: trans, error: transErr } = await sb
      .from('transferencias_sucursal')
      .insert({
        sucursal_origen_id: origen,
        sucursal_destino_id: destino,
        estado: 'solicitada',
        observaciones: observaciones.trim() || null,
      })
      .select('id')
      .maybeSingle<{ id: string }>()
    if (transErr || !trans) {
      setBusy(false)
      setErr(transErr?.message || 'No se pudo crear la transferencia.')
      return
    }
    await sb.from('transferencia_items').insert(
      cleanItems.map((it) => ({
        transferencia_id: trans.id,
        producto_id: it.producto_id,
        cantidad_solicitada: Number(it.cantidad),
      })),
    )
    setBusy(false)
    router.push(`/hub/operaciones/transferencias/${trans.id}`)
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
            Sucursales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Origen *">
              <Select value={origen || NONE} onValueChange={(v) => setOrigen(v === NONE ? '' : v)}>
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
            <Field label="Destino *">
              <Select value={destino || NONE} onValueChange={(v) => setDestino(v === NONE ? '' : v)}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Productos a transferir
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setItems((arr) => [...arr, { producto_id: '', cantidad: '1' }])
            }
          >
            <Plus className="size-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[3fr_1fr_auto] sm:items-end"
            >
              <Field label={i === 0 ? 'Producto' : undefined}>
                <Select
                  value={it.producto_id || NONE}
                  onValueChange={(v) =>
                    patchItem(i, { producto_id: v === NONE ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— Elegí producto —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Elegí producto —</SelectItem>
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
                  step={1}
                  value={it.cantidad}
                  onChange={(e) => patchItem(i, { cantidad: e.target.value })}
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
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
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
              Crear transferencia
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
