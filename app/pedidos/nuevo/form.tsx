'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Plus, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { ORIGIN_LABELS, TIPO_ENVIO_LABELS } from '@/lib/types'
import type { Order, OrderOrigin, TipoEnvio, ZonaReparto } from '@/lib/types'

import CustomerSearch from './customer-search'
import ProductSearch from './product-search'
import type { CustomerSuggestion } from '@/app/api/customers/search/route'
import type { ProductSuggestion } from '@/app/api/products/search/route'

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
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type ItemDraft = { name: string; qty: string; price: string; sku: string }

function emptyItem(): ItemDraft {
  return { name: '', qty: '1', price: '', sku: '' }
}

const MANUAL_ORIGINS: Exclude<OrderOrigin, 'woo'>[] = [
  'whatsapp',
  'telefono',
  'instagram',
  'otro',
]

type ShippingAddress = {
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postcode?: string
}

export default function NuevoPedidoForm({
  zonas,
  source,
}: {
  zonas: Pick<ZonaReparto, 'id' | 'nombre' | 'color' | 'activa'>[]
  source?: Order | null
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const srcOriginManual: Exclude<OrderOrigin, 'woo'> =
    source && source.origin !== 'woo' ? source.origin : 'whatsapp'
  const srcAddr: ShippingAddress = (source?.shipping_address ??
    source?.billing_address ??
    {}) as ShippingAddress
  const srcItems: ItemDraft[] = (source?.items ?? []).map((it) => ({
    name: it.name ?? '',
    qty: String(it.qty ?? 1),
    price: String(it.price ?? 0),
    sku: it.sku ?? '',
  }))

  const [origin, setOrigin] = useState<Exclude<OrderOrigin, 'woo'>>(srcOriginManual)
  const [tipoEnvio, setTipoEnvio] = useState<TipoEnvio>(source?.tipo_envio ?? 'programado')
  const [customer, setCustomer] = useState({
    name: source?.customer_name ?? '',
    phone: source?.customer_phone ?? '',
    email: source?.customer_email ?? '',
    dni: source?.customer_dni ?? '',
  })
  const [address, setAddress] = useState({
    address_1: srcAddr.address_1 ?? '',
    address_2: srcAddr.address_2 ?? '',
    city: srcAddr.city ?? '',
    state: srcAddr.state ?? '',
    postcode: srcAddr.postcode ?? '',
  })
  const [zonaId, setZonaId] = useState<string>(source?.zona_id ?? '')
  const [paymentMethod, setPaymentMethod] = useState(source?.payment_method ?? '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [items, setItems] = useState<ItemDraft[]>(
    srcItems.length > 0 ? srcItems : [emptyItem()],
  )

  const total = useMemo(
    () =>
      items.reduce((acc, it) => {
        const q = Number(it.qty) || 0
        const p = Number(it.price) || 0
        return acc + q * p
      }, 0),
    [items],
  )

  function pickCustomer(c: CustomerSuggestion) {
    setCustomer({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      dni: c.dni || '',
    })
    const a = c.address || {}
    setAddress({
      address_1: a.address_1 || '',
      address_2: a.address_2 || '',
      city: a.city || '',
      state: a.state || '',
      postcode: a.postcode || '',
    })
  }

  function patchItem(i: number, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems((arr) => [...arr, emptyItem()])
  }
  function removeItem(i: number) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, idx) => idx !== i)))
  }

  function addProductItem(p: ProductSuggestion) {
    setItems((arr) => {
      const match = arr.findIndex(
        (it) =>
          (p.sku && it.sku.trim() === p.sku) ||
          (!p.sku && it.name.trim().toLowerCase() === p.name.toLowerCase()),
      )
      if (match !== -1) {
        return arr.map((it, idx) =>
          idx === match
            ? { ...it, qty: String((Number(it.qty) || 0) + 1) }
            : it,
        )
      }
      const draft: ItemDraft = {
        name: p.name,
        qty: '1',
        price: String(p.price || 0),
        sku: p.sku ?? '',
      }
      const firstEmpty = arr.findIndex((it) => !it.name.trim() && !it.sku.trim())
      if (firstEmpty !== -1) {
        return arr.map((it, idx) => (idx === firstEmpty ? draft : it))
      }
      return [...arr, draft]
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)

    const cleanItems = items
      .map((it) => ({
        name: it.name.trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
        sku: it.sku.trim() || undefined,
      }))
      .filter((it) => it.name && it.qty > 0)

    if (cleanItems.length === 0) {
      setBusy(false)
      setErr('Agregá al menos un item con nombre y cantidad.')
      return
    }
    if (!customer.name.trim() && !customer.phone.trim()) {
      setBusy(false)
      setErr('Poné al menos nombre o teléfono del cliente.')
      return
    }

    const shipping = Object.values(address).some((v) => v.trim())
      ? {
          first_name: customer.name.trim().split(' ')[0] || '',
          last_name: customer.name.trim().split(' ').slice(1).join(' ') || '',
          address_1: address.address_1.trim() || undefined,
          address_2: address.address_2.trim() || undefined,
          city: address.city.trim() || undefined,
          state: address.state.trim() || undefined,
          postcode: address.postcode.trim() || undefined,
          phone: customer.phone.trim() || undefined,
          email: customer.email.trim() || undefined,
        }
      : null

    const { data, error } = await sb.rpc('create_manual_order', {
      p_origin: origin,
      p_tipo_envio: tipoEnvio,
      p_customer_name: customer.name,
      p_customer_phone: customer.phone,
      p_customer_email: customer.email,
      p_customer_dni: customer.dni,
      p_shipping_address: shipping,
      p_zona_id: zonaId || null,
      p_items: cleanItems,
      p_total: total,
      p_payment_method: paymentMethod,
      p_notes: notes,
    })

    setBusy(false)

    if (error) {
      setErr(error.message)
      return
    }
    const created = Array.isArray(data) ? data[0] : data
    if (created?.id) {
      router.push(`/pedidos/${created.id}`)
      router.refresh()
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {/* Canal + Tipo */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Canal de origen
            </Label>
            <div className="flex flex-wrap gap-2">
              {MANUAL_ORIGINS.map((o) => (
                <Button
                  key={o}
                  type="button"
                  variant={origin === o ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrigin(o)}
                >
                  {ORIGIN_LABELS[o]}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              El número del pedido se genera automáticamente según el canal (WSP-001,
              TEL-001, etc.).
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Tipo de envío
            </Label>
            <div className="flex flex-wrap gap-2">
              {(['express', 'programado', 'retiro'] as TipoEnvio[]).map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={tipoEnvio === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTipoEnvio(t)}
                >
                  {TIPO_ENVIO_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CustomerSearch onPick={pickCustomer} />
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Nombre completo
            </Label>
            <Input
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              placeholder="Juan Pérez"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Teléfono
              </Label>
              <Input
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="+54 9 11 5555-5555"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                DNI
              </Label>
              <Input
                value={customer.dni}
                onChange={(e) => setCustomer({ ...customer, dni: e.target.value })}
                placeholder="12345678"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              type="email"
              value={customer.email}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              placeholder="cliente@mail.com"
            />
          </div>
        </CardContent>
      </Card>

      {/* Dirección */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Dirección de envío
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Calle y número
            </Label>
            <Input
              value={address.address_1}
              onChange={(e) => setAddress({ ...address, address_1: e.target.value })}
              placeholder="Av. Siempre Viva 742"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Piso / Depto / Referencias
            </Label>
            <Input
              value={address.address_2}
              onChange={(e) => setAddress({ ...address, address_2: e.target.value })}
              placeholder="3° B · timbre rojo"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Ciudad
              </Label>
              <Input
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Provincia
              </Label>
              <Input
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                CP
              </Label>
              <Input
                value={address.postcode}
                onChange={(e) => setAddress({ ...address, postcode: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Zona de reparto
            </Label>
            <Select
              value={zonaId || 'none'}
              onValueChange={(v) => setZonaId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin zona —</SelectItem>
                {zonas.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zonas.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Todavía no hay zonas creadas. Un admin puede crearlas en Config.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Items
          </CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="size-4" />
            Agregar manual
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProductSearch onPick={addProductItem} />
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
                  <Input
                    value={it.name}
                    onChange={(e) => patchItem(i, { name: e.target.value })}
                    placeholder="Descripción"
                  />
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
                    onChange={(e) => patchItem(i, { qty: e.target.value })}
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
                    onChange={(e) => patchItem(i, { price: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="sa-items-sku">
                  {i === 0 && (
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      SKU
                    </Label>
                  )}
                  <Input
                    value={it.sku}
                    onChange={(e) => patchItem(i, { sku: e.target.value })}
                    placeholder="—"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  className={i === 0 ? 'mt-[22px]' : ''}
                  aria-label={`Quitar item ${i + 1}`}
                >
                  <X className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total calculado</span>
            <span className="text-base font-bold tabular-nums">
              ${total.toLocaleString('es-AR')}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pago + Notas */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Método de pago
            </Label>
            <Input
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Efectivo, transferencia, …"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Notas
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Indicaciones del cliente, horarios, etc."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy} size="lg">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              Crear pedido
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
