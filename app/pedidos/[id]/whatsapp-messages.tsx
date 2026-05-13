'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw } from 'lucide-react'

import { WHATSAPP_STATUS_LABELS } from '@/lib/types'
import type { WhatsappMessage, UserPedidos, WhatsappMsgStatus } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'

const STATUS_VARIANTS: Record<WhatsappMsgStatus, React.ComponentProps<typeof Badge>['variant']> = {
  sent: 'success',
  skipped: 'outline',
  pending: 'warning',
}

function waLink(phone: string | null, text: string): string | null {
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

export default function WhatsappMessagesList({
  messages,
  users,
  orderId,
}: {
  messages: WhatsappMessage[]
  users: Pick<UserPedidos, 'id' | 'name' | 'email'>[]
  orderId: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(messages)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [regenMsg, setRegenMsg] = useState<string | null>(null)

  const userMap = new Map(users.map((u) => [u.id, u.name || u.email]))

  async function regenerate() {
    setBusy('regenerate')
    setErr(null)
    setRegenMsg(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/regenerate-messages`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.hint || json?.error || 'error')
        return
      }
      setRegenMsg(
        json.created > 0
          ? `Se generaron ${json.created} mensajes a partir del historial.`
          : 'No había mensajes faltantes.',
      )
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(null)
      setTimeout(() => setRegenMsg(null), 5000)
    }
  }

  async function patch(id: string, status: WhatsappMsgStatus) {
    setBusy(id)
    setErr(null)
    try {
      const res = await fetch(`/api/whatsapp-messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      if (json.message) setRows((arr) => arr.map((r) => (r.id === id ? json.message : r)))
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(null)
    }
  }

  function sendAndMark(m: WhatsappMessage) {
    const link = waLink(m.phone, m.message)
    if (!link) return
    window.open(link, '_blank', 'noopener,noreferrer')
    patch(m.id, 'sent')
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Mensajes de WhatsApp
        </CardTitle>
        <Button
          onClick={regenerate}
          disabled={busy === 'regenerate'}
          variant="outline"
          size="sm"
          title="Reconstruye los mensajes faltantes usando el historial del pedido."
        >
          <RefreshCw className={busy === 'regenerate' ? 'size-4 animate-spin' : 'size-4'} />
          Regenerar
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {err && (
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        {regenMsg && (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertDescription>{regenMsg}</AlertDescription>
          </Alert>
        )}

        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Todavía no hay mensajes para este pedido. Cada cambio de estado agrega uno
            automáticamente; si el pedido ya cambió antes, podés reconstruirlos desde el
            historial.
          </div>
        ) : (
          rows.map((m) => {
            const isPending = m.status === 'pending'
            const isSent = m.status === 'sent'
            const isSkipped = m.status === 'skipped'
            const link = waLink(m.phone, m.message)
            return (
              <div
                key={m.id}
                className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={m.status_trigger} />
                    <Badge
                      variant={STATUS_VARIANTS[m.status]}
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {WHATSAPP_STATUS_LABELS[m.status]}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleString('es-AR')}
                  </span>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</div>

                <div className="text-[11px] text-muted-foreground">
                  {m.phone ? `Para: ${m.phone}` : 'Sin teléfono válido'}
                  {isSent && m.sent_at && (
                    <>
                      {' '}
                      · Enviado {new Date(m.sent_at).toLocaleString('es-AR')}
                      {m.sent_by &&
                        userMap.has(m.sent_by) &&
                        ` por ${userMap.get(m.sent_by)}`}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {isPending && link && (
                    <Button
                      onClick={() => sendAndMark(m)}
                      disabled={busy === m.id}
                      size="sm"
                      className="bg-[#25D366] text-white hover:bg-[#20bd5b]"
                    >
                      <MessageCircle className="size-4" />
                      Enviar por WhatsApp
                    </Button>
                  )}
                  {isPending && !link && (
                    <span className="text-[11px] text-muted-foreground">
                      No se puede enviar: el cliente no tiene teléfono.
                    </span>
                  )}
                  {isPending && (
                    <Button
                      onClick={() => patch(m.id, 'skipped')}
                      disabled={busy === m.id}
                      variant="outline"
                      size="sm"
                    >
                      Marcar como omitido
                    </Button>
                  )}
                  {(isSent || isSkipped) && (
                    <Button
                      onClick={() => patch(m.id, 'pending')}
                      disabled={busy === m.id}
                      variant="outline"
                      size="sm"
                    >
                      Marcar como pendiente
                    </Button>
                  )}
                  {link && !isPending && (
                    <Button asChild variant="outline" size="sm">
                      <a href={link} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" />
                        Abrir en WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
