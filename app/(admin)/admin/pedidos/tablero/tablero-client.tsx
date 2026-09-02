'use client'

import { useState, useTransition } from 'react'
import { Copy, ExternalLink, PenLine, Check, Download } from 'lucide-react'
import { toast } from 'sonner'

import { CANAL_LABELS } from '@/lib/pedidos/canales'
import { AVISO_LABELS, AVISO_POR_QUE_FIRMA, AVISO_REQUIERE_FIRMA, linkWhatsApp, type TipoAviso } from '@/lib/pedidos/avisos'
import { STATUS_LABELS, type OrderStatus } from '@/lib/types'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { asignarSucursal, firmarAviso, marcarAvisoMandado, prepararAviso } from './actions'

const COLUMNAS: OrderStatus[] = ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino']

type Sucursal = { id: string; nombre: string; codigo: string | null; es_ecommerce: boolean }

export function TableroClient({
  pedidos, avisos, sucursales,
}: { pedidos: any[]; avisos: any[]; sucursales: Sucursal[] }) {
  const [pendiente, empezar] = useTransition()
  const [canal, setCanal] = useState<string>('')

  const visibles = canal ? pedidos.filter((p) => p.canal === canal) : pedidos
  const canales = [...new Set(pedidos.map((p) => p.canal))]

  function correr(fn: (fd: FormData) => Promise<any>, fd: FormData, ok = 'Listo') {
    empezar(async () => {
      const r = await fn(fd)
      if (r?.error) toast.error(r.error)
      else toast.success(ok)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCanal('')}
          className={`rounded-md border px-3 py-1 text-sm ${!canal ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
          Todos ({pedidos.length})
        </button>
        {canales.map((c) => (
          <button key={c} type="button" onClick={() => setCanal(c)}
            className={`rounded-md border px-3 py-1 text-sm ${canal === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
            {CANAL_LABELS[c as keyof typeof CANAL_LABELS] ?? c} ({pedidos.filter((p) => p.canal === c).length})
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto gap-1"
          onClick={() => exportExcel('pedidos-abiertos', visibles.map((p) => ({
            Pedido: p.codigo, Canal: CANAL_LABELS[p.canal as keyof typeof CANAL_LABELS] ?? p.canal,
            Estado: STATUS_LABELS[p.status as OrderStatus] ?? p.status,
            Sucursal: p.sucursal ?? 'sin asignar', Cliente: p.cliente ?? '',
            Teléfono: p.telefono ?? '', DNI: p.dni ?? '',
            Renglones: p.renglones, Total: Number(p.total),
            Creado: p.created_at,
          })))}>
          <Download className="size-3.5" /> Exportar
        </Button>
      </div>

      {/* ── LAS COLUMNAS POR ESTADO ──────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-5">
        {COLUMNAS.map((estado) => {
          const enEstado = visibles.filter((p) => p.status === estado)
          return (
            <div key={estado} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {STATUS_LABELS[estado]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{enEstado.length}</span>
              </div>
              {enEstado.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">Ninguno.</p>
              )}
              {enEstado.map((p) => (
                <div key={p.id} className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{p.codigo}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {CANAL_LABELS[p.canal as keyof typeof CANAL_LABELS] ?? p.canal}
                    </Badge>
                  </div>
                  <div className="truncate text-sm">{p.cliente ?? 'sin nombre'}</div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.renglones} renglones</span>
                    <span className="tabular-nums">{formatARS(Number(p.total))}</span>
                  </div>

                  {p.sucursal_id ? (
                    <div className="text-[11px] text-muted-foreground">
                      {p.sucursal}{p.es_ecommerce ? ' · ecommerce' : ''}
                    </div>
                  ) : (
                    <form action={(fd) => correr(asignarSucursal, fd, 'Sucursal asignada')}
                      className="flex items-center gap-1">
                      <input type="hidden" name="order_id" value={p.id} />
                      <select name="sucursal_id" required
                        className="h-7 min-w-0 flex-1 rounded border border-amber-500/40 bg-background px-1 text-[11px]">
                        <option value="">Sin sucursal…</option>
                        {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                      <Button type="submit" size="icon" variant="ghost" className="size-7" disabled={pendiente}>
                        <Check className="size-3.5" />
                      </Button>
                    </form>
                  )}

                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {(['salio', 'por_llegar', 'demora'] as TipoAviso[]).map((t) => (
                      <form key={t} action={(fd) => correr(prepararAviso, fd,
                        AVISO_REQUIERE_FIRMA[t] ? 'Preparado, esperando firma' : 'Aviso preparado')}>
                        <input type="hidden" name="order_id" value={p.id} />
                        <input type="hidden" name="tipo" value={t} />
                        <button type="submit" disabled={pendiente}
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent">
                          {AVISO_LABELS[t]}{AVISO_REQUIERE_FIRMA[t] && ' ✎'}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* ── E.2 · LO QUE ESPERA FIRMA Y LO QUE ESPERA QUE ALGUIEN LO MANDE ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Avisos preparados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              <b>WhatsApp no está integrado.</b> Es la app común del negocio y no tiene API. NORA
              deja el mensaje armado con el pedido y el total; una persona lo copia y lo manda, y
              después lo marca acá. Decir «enviado» sin que nadie lo haya mandado sería mentir.
            </AlertDescription>
          </Alert>

          {avisos.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay avisos esperando.</p>
          )}

          {avisos.map((a) => {
            const bloqueado = a.requiere_firma && !a.firmado_at
            const link = linkWhatsApp(a.phone, a.message)
            return (
              <div key={a.id}
                className={`rounded-lg border p-3 ${bloqueado ? 'border-amber-500/40 bg-amber-500/5' : 'border-border'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{a.pedido}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {AVISO_LABELS[a.aviso as TipoAviso] ?? a.aviso}
                  </Badge>
                  {a.requiere_firma && (
                    <Badge variant={a.firmado_at ? 'outline' : 'warning'} className="gap-1 text-[10px]">
                      <PenLine className="size-3" />
                      {a.firmado_at ? `firmado por ${a.firmado_nombre}` : 'espera firma'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 rounded bg-muted/50 p-2 text-sm">{a.message}</p>
                {bloqueado && AVISO_POR_QUE_FIRMA[a.aviso as TipoAviso] && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {AVISO_POR_QUE_FIRMA[a.aviso as TipoAviso]}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {bloqueado ? (
                    <form action={(fd) => correr(firmarAviso, fd, 'Firmado')}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" size="sm" className="gap-1" disabled={pendiente}>
                        <PenLine className="size-3.5" /> Firmar
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => { navigator.clipboard.writeText(a.message); toast.success('Copiado') }}>
                        <Copy className="size-3.5" /> Copiar
                      </Button>
                      {link && (
                        <Button size="sm" variant="outline" className="gap-1" asChild>
                          <a href={link} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-3.5" /> Abrir en WhatsApp
                          </a>
                        </Button>
                      )}
                      <form action={(fd) => correr(marcarAvisoMandado, fd, 'Marcado como mandado')}>
                        <input type="hidden" name="id" value={a.id} />
                        <Button type="submit" size="sm" variant="ghost" disabled={pendiente}>
                          Ya lo mandé
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
