'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Loader2,
  ScanLine,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  ESTADO_TICKET_LABELS,
  type EstadoTicketValidacion,
} from '@/lib/types/admin'
import { cn } from '@/lib/utils'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TicketConUrl } from './page'

const ESTADO_VARIANT: Record<
  EstadoTicketValidacion,
  'warning' | 'secondary' | 'info' | 'success' | 'destructive'
> = {
  pendiente: 'warning',
  dudoso: 'secondary',
  auto_validado: 'info',
  manual_aprobado: 'success',
  rechazado: 'destructive',
}

function fmtMonto(n: number | null): string {
  if (n == null) return '—'
  return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export function TicketsClient({
  initialTickets,
  userId,
}: {
  initialTickets: TicketConUrl[]
  userId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [tickets, setTickets] = useState(initialTickets)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dni, setDni] = useState('')
  const [telefono, setTelefono] = useState('')
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (dni.trim()) form.append('cliente_dni', dni.trim())
      if (telefono.trim()) form.append('cliente_telefono', telefono.trim())
      const res = await fetch('/api/ai/ocr-ticket', {
        method: 'POST',
        body: form,
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error || `Error ${res.status}`)
      if (j.duplicado) {
        toast.info('Este ticket ya estaba cargado.')
      } else {
        toast.success('Ticket procesado por la IA.')
      }
      setDni('')
      setTelefono('')
      router.refresh()
    } catch (e: any) {
      setErr(e?.message || 'No se pudo procesar el ticket.')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  async function resolver(
    id: string,
    estado: 'manual_aprobado' | 'rechazado',
  ) {
    setResolviendo(id)
    const { error } = await sb
      .from('tickets_validacion')
      .update({
        estado,
        validado_por: userId,
        validado_at: new Date().toISOString(),
      })
      .eq('id', id)
    setResolviendo(null)
    if (error) {
      toast.error(error.message)
      return
    }
    setTickets((arr) =>
      arr.map((t) => (t.id === id ? { ...t, estado } : t)),
    )
    toast.success(
      estado === 'manual_aprobado' ? 'Ticket aprobado.' : 'Ticket rechazado.',
    )
  }

  return (
    <div className="space-y-4">
      {/* Uploader */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Cargar ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                DNI cliente (opcional)
              </Label>
              <Input
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="Para asociar a la cuponera"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Teléfono cliente (opcional)
              </Label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Foto del ticket
            </Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFile}
              disabled={busy}
            />
          </div>
          {busy && (
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Procesando con IA — extrayendo datos del ticket…
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <Upload className="mr-1 inline size-3" />
            JPG, PNG, WEBP o GIF — máximo 10 MB. La IA extrae fecha, total,
            comercio y número de ticket.
          </p>
          {err && (
            <Alert variant="destructive">
              <AlertDescription>{err}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tickets cargados ({tickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay tickets cargados.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((t) => {
                const ocr = (t.raw_ocr ?? {}) as Record<string, any>
                const puedeResolver = ['pendiente', 'dudoso'].includes(
                  t.estado,
                )
                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
                  >
                    {/* Thumbnail */}
                    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {t.foto_signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a
                          href={t.foto_signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={t.foto_signed_url}
                            alt="Ticket"
                            className="size-20 object-cover transition-opacity hover:opacity-80"
                          />
                        </a>
                      ) : (
                        <ScanLine className="size-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Datos */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {ocr.comercio || 'Comercio no detectado'}
                        </span>
                        <Badge
                          variant={ESTADO_VARIANT[t.estado]}
                          className="text-[10px]"
                        >
                          {ESTADO_TICKET_LABELS[t.estado]}
                        </Badge>
                        {ocr.confianza && (
                          <span className="text-[10px] text-muted-foreground">
                            confianza {ocr.confianza}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                        <span>
                          Total:{' '}
                          <span className="font-medium text-foreground tabular-nums">
                            {fmtMonto(t.total_extraido)}
                          </span>
                        </span>
                        <span>
                          Fecha:{' '}
                          <span className="font-medium text-foreground">
                            {t.fecha_ticket_extraida || '—'}
                          </span>
                        </span>
                        <span>
                          N°:{' '}
                          <span className="font-medium text-foreground">
                            {t.numero_ticket_extraido || '—'}
                          </span>
                        </span>
                        <span>
                          Sucursal:{' '}
                          <span className="font-medium text-foreground">
                            {t.sucursal_extraida || '—'}
                          </span>
                        </span>
                      </div>
                      {(t.cliente_dni || t.cliente_telefono) && (
                        <div className="text-xs text-muted-foreground">
                          Cliente: {t.cliente_dni || t.cliente_telefono}
                        </div>
                      )}
                      {ocr.observaciones && (
                        <div className="text-xs text-warning">
                          {ocr.observaciones}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        Cargado{' '}
                        {new Date(t.fecha_carga).toLocaleString('es-AR')}
                      </div>
                    </div>

                    {/* Acciones */}
                    {puedeResolver && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolviendo === t.id}
                          onClick={() => resolver(t.id, 'manual_aprobado')}
                          className="text-success hover:text-success"
                        >
                          {resolviendo === t.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-3.5" />
                          )}
                          Aprobar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={resolviendo === t.id}
                          onClick={() => resolver(t.id, 'rechazado')}
                          aria-label="Rechazar"
                          className={cn(
                            'text-destructive hover:text-destructive',
                          )}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
