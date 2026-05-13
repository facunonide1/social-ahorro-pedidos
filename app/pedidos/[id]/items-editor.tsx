'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { Order, OrderItem } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Draft = { name: string; qty: string; price: string; sku: string }

function itemToDraft(it: OrderItem): Draft {
  return {
    name: it.name ?? '',
    qty: String(it.qty ?? 1),
    price: String(it.price ?? 0),
    sku: it.sku ?? '',
  }
}

export default function ItemsEditor({ order }: { order: Order }) {
  const router = useRouter()
  const sb = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Draft[]>((order.items ?? []).map(itemToDraft))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const total = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.price) || 0), 0),
    [items],
  )
  const originalTotal = Number(order.total) || 0

  function patch(i: number, p: Partial<Draft>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)))
  }
  function addRow() {
    setItems((arr) => [...arr, { name: '', qty: '1', price: '', sku: '' }])
  }
  function removeRow(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i))
  }

  async function save() {
    setBusy(true)
    setErr(null)
    setMsg(null)
    const cleaned = items
      .map((it) => ({
        name: it.name.trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        sku: it.sku.trim() || undefined,
      }))
      .filter((it) => it.name && it.qty > 0)

    if (cleaned.length === 0) {
      setErr('Tiene que haber al menos un item.')
      setBusy(false)
      return
    }

    const newTotal = cleaned.reduce((a, it) => a + it.qty * it.price, 0)

    const { error } = await sb
      .from('orders')
      .update({ items: cleaned, total: newTotal })
      .eq('id', order.id)
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setMsg(`Items actualizados. Nuevo total: $${newTotal.toLocaleString('es-AR')}`)
    router.refresh()
    setTimeout(() => {
      setMsg(null)
      setOpen(false)
    }, 2000)
  }

  function cancel() {
    setItems((order.items ?? []).map(itemToDraft))
    setOpen(false)
    setErr(null)
    setMsg(null)
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <Pencil className="size-4" />
        Editar items
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      {order.origin === 'woo' && (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            Este pedido vino de WooCommerce. Editar items acá <b>no</b> sincroniza con la
            web; solo actualiza tu registro interno.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {items.map((it, i) => (
          <div
            key={i}
            className="grid gap-2 sm:grid-cols-[3fr_0.7fr_1fr_1fr_auto] sa-items-row"
          >
            <div>
              {i === 0 && (
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Producto
                </Label>
              )}
              <Input value={it.name} onChange={(e) => patch(i, { name: e.target.value })} />
            </div>
            <div>
              {i === 0 && (
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Cant.
                </Label>
              )}
              <Input
                type="number"
                min="0"
                step="1"
                value={it.qty}
                onChange={(e) => patch(i, { qty: e.target.value })}
              />
            </div>
            <div>
              {i === 0 && (
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Precio unit.
                </Label>
              )}
              <Input
                type="number"
                min="0"
                step="0.01"
                value={it.price}
                onChange={(e) => patch(i, { price: e.target.value })}
              />
            </div>
            <div className="sa-items-sku">
              {i === 0 && (
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  SKU
                </Label>
              )}
              <Input value={it.sku} onChange={(e) => patch(i, { sku: e.target.value })} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => removeRow(i)}
              className={i === 0 ? 'mt-[22px]' : ''}
              aria-label={`Quitar item ${i + 1}`}
            >
              <X className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          Agregar fila
        </Button>
        <div className="text-sm text-muted-foreground">
          Nuevo total:{' '}
          <span className="font-bold text-foreground tabular-nums">
            ${total.toLocaleString('es-AR')}
          </span>
          {total !== originalTotal && (
            <span
              className={
                'ml-2 text-xs ' + (total > originalTotal ? 'text-success' : 'text-destructive')
              }
            >
              ({total > originalTotal ? '+' : ''}$
              {(total - originalTotal).toLocaleString('es-AR')} vs $
              {originalTotal.toLocaleString('es-AR')})
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancel} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando…
            </>
          ) : (
            'Guardar items'
          )}
        </Button>
      </div>
    </div>
  )
}
