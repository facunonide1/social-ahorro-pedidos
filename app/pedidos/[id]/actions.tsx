'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import {
  STATUS_LABELS,
  TIPO_ENVIO_LABELS,
  TIPO_ENVIO_FLOW,
} from '@/lib/types'
import type {
  Order,
  OrderStatus,
  TipoEnvio,
  UserRole,
  UserPedidos,
  ZonaReparto,
} from '@/lib/types'
import { messageForStatus, whatsappLink } from '@/lib/whatsapp/messages'
import { formatOrderNumber } from '@/lib/orders/format'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

export default function OrderActions({
  order,
  role,
  repartidores,
  zonas,
  suggestedRepartidorId,
}: {
  order: Order
  role: UserRole
  repartidores: Pick<UserPedidos, 'id' | 'name' | 'email' | 'role' | 'active'>[]
  zonas: Pick<ZonaReparto, 'id' | 'nombre' | 'color' | 'activa'>[]
  suggestedRepartidorId?: string | null
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignTo, setAssignTo] = useState<string>(order.assigned_to ?? '')
  const [zonaSaving, setZonaSaving] = useState(false)
  const [zonaId, setZonaId] = useState<string>(order.zona_id ?? '')
  const [tipoSaving, setTipoSaving] = useState(false)
  const [tipoEnvio, setTipoEnvio] = useState<TipoEnvio>(order.tipo_envio)

  const flow = TIPO_ENVIO_FLOW[order.tipo_envio]
  const allowedStatuses: OrderStatus[] =
    role === 'repartidor'
      ? (['en_camino', 'entregado'] as OrderStatus[]).filter((s) => flow.includes(s))
      : flow.filter((s) => s !== order.status)

  async function changeStatus(next: OrderStatus) {
    setBusy(true)
    setErr(null)
    const note = noteDraft.trim() || null
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, note }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error_cambio_estado')
        return
      }
      setNoteDraft('')
      const warnings: string[] = []
      if (json?.woo && json.woo.ok === false) {
        warnings.push(`No se sincronizó con Woo: ${json.woo.error}`)
      }
      if (json?.whatsappMsg && json.whatsappMsg.ok === false) {
        warnings.push(`No se generó mensaje WhatsApp: ${json.whatsappMsg.error}`)
      }
      if (warnings.length) {
        setErr(`Estado guardado. ${warnings.join(' · ')}`)
      }
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
    }
  }

  async function addNote() {
    const note = noteDraft.trim()
    if (!note) return
    setBusy(true)
    setErr(null)
    const { error } = await sb.rpc('add_order_note', {
      p_order_id: order.id,
      p_note: note,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setNoteDraft('')
    router.refresh()
  }

  async function assign() {
    setAssigning(true)
    setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ assigned_to: assignTo || null })
      .eq('id', order.id)
    setAssigning(false)
    if (error) {
      setErr(error.message)
      return
    }
    router.refresh()
  }

  async function saveZona() {
    setZonaSaving(true)
    setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ zona_id: zonaId || null })
      .eq('id', order.id)
    setZonaSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    router.refresh()
  }

  async function saveTipo() {
    setTipoSaving(true)
    setErr(null)
    const { error } = await sb
      .from('orders')
      .update({ tipo_envio: tipoEnvio })
      .eq('id', order.id)
    setTipoSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    router.refresh()
  }

  const waText = messageForStatus(order.status, {
    customerName: order.customer_name,
    orderNumber: formatOrderNumber(order),
  })
  const waLink = whatsappLink(order.customer_phone, waText)

  const isAdminOrOp = role === 'admin' || role === 'operador'
  const suggested = suggestedRepartidorId
    ? repartidores.find((r) => r.id === suggestedRepartidorId)
    : null
  const showSuggestion = !!suggested && suggested.id !== (order.assigned_to ?? '')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Acciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}

        {/* Nota */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Nota / observación (opcional)
          </Label>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="Ej: dejado con el portero, cliente no atendió, etc."
          />
          <Button
            onClick={addNote}
            disabled={busy || !noteDraft.trim()}
            variant="outline"
            size="sm"
          >
            Guardar solo nota
          </Button>
        </div>

        <Separator />

        {/* Cambio de estado */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Cambiar estado
          </Label>
          <div className="flex flex-wrap gap-2">
            {allowedStatuses.map((s) => (
              <Button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={busy}
                variant="outline"
                size="sm"
              >
                <ArrowRight className="size-3.5" />
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {noteDraft.trim() && (
            <p className="text-[11px] text-muted-foreground">
              La nota se va a adjuntar al cambio de estado.
            </p>
          )}
        </div>

        <Separator />

        {/* WhatsApp */}
        {waLink ? (
          <Button
            asChild
            className="w-full bg-[#25D366] text-white hover:bg-[#20bd5b]"
          >
            <a href={waLink} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" />
              Enviar WhatsApp ({STATUS_LABELS[order.status]})
            </a>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Sin teléfono válido para WhatsApp</p>
        )}

        {/* Tipo de envío */}
        {isAdminOrOp && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tipo de envío
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {(['express', 'programado', 'retiro'] as TipoEnvio[]).map((t) => {
                  const selected = tipoEnvio === t
                  return (
                    <Button
                      key={t}
                      type="button"
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTipoEnvio(t)}
                    >
                      {TIPO_ENVIO_LABELS[t]}
                    </Button>
                  )
                })}
                <Button
                  onClick={saveTipo}
                  disabled={tipoSaving || tipoEnvio === order.tipo_envio}
                  size="sm"
                >
                  Guardar tipo
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                El tipo determina qué estados se pueden elegir arriba (retiro no pasa por
                &ldquo;en camino&rdquo;, express no pasa por &ldquo;listo&rdquo;).
              </p>
            </div>
          </>
        )}

        {/* Zona de reparto */}
        {isAdminOrOp && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Zona de reparto
              </Label>
              <div className="flex gap-2">
                <Select value={zonaId || 'none'} onValueChange={(v) => setZonaId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sin zona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin zona —</SelectItem>
                    {zonas
                      .filter((z) => z.activa || z.id === order.zona_id)
                      .map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {z.nombre}
                          {!z.activa ? ' (inactiva)' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={saveZona}
                  disabled={zonaSaving || zonaId === (order.zona_id ?? '')}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Repartidor */}
        {isAdminOrOp && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Repartidor
              </Label>
              {showSuggestion && (
                <div className="flex items-center gap-2 rounded-md border border-info/40 bg-info/5 px-3 py-2">
                  <Sparkles className="size-4 text-info" />
                  <Badge variant="info" className="text-[10px] uppercase tracking-wide">
                    Sugerido
                  </Badge>
                  <span className="flex-1 text-sm">
                    {suggested!.name || suggested!.email}{' '}
                    <span className="text-muted-foreground">
                      (más entregas en esta zona)
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAssignTo(suggested!.id)}
                  >
                    Usar
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={assignTo || 'none'}
                  onValueChange={(v) => setAssignTo(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin asignar —</SelectItem>
                    {repartidores.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name || r.email}
                        {r.id === suggestedRepartidorId ? ' ★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={assign}
                  disabled={assigning || assignTo === (order.assigned_to ?? '')}
                >
                  Asignar
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
