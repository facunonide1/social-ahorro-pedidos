'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Megaphone, Plus, Loader2, Sparkles, Send, CalendarClock, Trash2, Bell, Mail, MessageCircle,
  RefreshCw, Scissors, Eye,
} from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { OBJETIVOS_CAMPANIA, CANAL_LABEL, type CampaniaEstado, type CampaniaMensaje, type CampaniaMetricas, type Canal } from '@/lib/types/crm'

export type CampaniaRow = { id: string; nombre: string; objetivo: string | null; canales: string[]; estado: CampaniaEstado; redactado_por: string; metricas: CampaniaMetricas; segmento_id: string | null; created_at: string }
export type SegmentoLite = { id: string; nombre: string; n_clientes: number }

const ESTADO_VARIANT: Record<CampaniaEstado, any> = { borrador: 'outline', programada: 'info', enviada: 'success', finalizada: 'secondary' }
const CANAL_ICON: Record<Canal, any> = { push: Bell, email: Mail, whatsapp: MessageCircle }

async function post(body: any) {
  const r = await fetch('/api/crm/campanias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function ComunicacionClient({ campanias, segmentos, emailConfigurado, segmentoPre }: { campanias: CampaniaRow[]; segmentos: SegmentoLite[]; emailConfigurado: boolean; segmentoPre: string | null }) {
  const router = useRouter()
  const [crear, setCrear] = useState(false)
  const opened = useRef(false)

  useEffect(() => { if (segmentoPre && !opened.current) { opened.current = true; setCrear(true) } }, [segmentoPre])

  async function enviar(id: string) {
    if (!confirm('¿Enviar la campaña ahora?')) return
    try { const j = await post({ accion: 'enviar', id }); toast.success(`Enviada: ${j.push} push, ${j.email_enviados} emails, ${j.whatsapp_encolados} WhatsApp encolados`); router.refresh() }
    catch (e: any) { toast.error(e?.message) }
  }
  async function eliminar(id: string) { if (!confirm('¿Eliminar campaña?')) return; try { await post({ accion: 'eliminar', id }); toast.success('Eliminada'); router.refresh() } catch (e: any) { toast.error(e?.message) } }

  function exportar() {
    exportExcel('campanias', campanias.map((c) => ({ Nombre: c.nombre, Objetivo: c.objetivo ?? '', Canales: c.canales.join(', '), Estado: c.estado, Enviados: c.metricas.enviados ?? 0, Abiertos: c.metricas.abiertos ?? 0, Convirtieron: c.metricas.convirtieron ?? 0, Facturación: c.metricas.facturacion ?? 0 })), { sheet: 'Campañas' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm text-muted-foreground">{campanias.length} campañas</div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!campanias.length} onClick={exportar}>Excel</Button>
          <Button size="sm" onClick={() => setCrear(true)}><Plus className="size-4" /> Nueva campaña</Button>
        </div>
      </div>

      {campanias.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Megaphone className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Sin campañas. Creá una desde un segmento.</div>
          <Button size="sm" onClick={() => setCrear(true)}><Plus className="size-4" /> Nueva campaña</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Campaña</th><th className="px-3 py-2">Canales</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2 text-right">Enviados</th><th className="px-3 py-2 text-right">Abiertos</th><th className="px-3 py-2 text-right">Convirtieron</th><th className="px-3 py-2 text-right">Facturación</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {campanias.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-1.5"><div className="font-medium">{c.nombre}</div><div className="text-[11px] text-muted-foreground">{c.objetivo ?? ''}{c.redactado_por === 'nora' && ' · NORA ✦'}</div></td>
                  <td className="px-3 py-1.5"><div className="flex gap-1">{c.canales.map((ch) => { const I = CANAL_ICON[ch as Canal] ?? Bell; return <I key={ch} className="size-3.5 text-muted-foreground" /> })}</div></td>
                  <td className="px-3 py-1.5"><Badge variant={ESTADO_VARIANT[c.estado]} className="text-[10px]">{c.estado}</Badge></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.metricas.enviados ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.metricas.abiertos ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.metricas.convirtieron ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.metricas.facturacion ? `$${Math.round(c.metricas.facturacion).toLocaleString('es-AR')}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      {c.estado === 'borrador' && <Button size="sm" className="h-7 text-xs" onClick={() => enviar(c.id)}><Send className="size-3.5" /></Button>}
                      <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => eliminar(c.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crear && <CrearCampania segmentos={segmentos} emailConfigurado={emailConfigurado} segmentoPre={segmentoPre} onClose={() => setCrear(false)} onDone={() => { setCrear(false); router.refresh() }} />}
    </div>
  )
}

function CrearCampania({ segmentos, emailConfigurado, segmentoPre, onClose, onDone }: { segmentos: SegmentoLite[]; emailConfigurado: boolean; segmentoPre: string | null; onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('')
  const [segmentoId, setSegmentoId] = useState(segmentoPre ?? '')
  const [objetivo, setObjetivo] = useState('promo')
  const [canales, setCanales] = useState<Canal[]>(['push'])
  const [mensaje, setMensaje] = useState<CampaniaMensaje>({})
  const [via, setVia] = useState<'ia' | 'plantilla' | null>(null)
  const [redactando, setRedactando] = useState(false)
  const [busy, setBusy] = useState(false)
  const seg = segmentos.find((s) => s.id === segmentoId)

  function toggleCanal(c: Canal) { setCanales((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]) }

  async function redactar(variante: 'normal' | 'corto' | 'otra' = 'normal') {
    if (!canales.length) { toast.error('Elegí al menos un canal'); return }
    setRedactando(true)
    try { const j = await post({ accion: 'redactar', objetivo, canales, segmento_id: segmentoId || null, variante }); setMensaje(j.mensaje); setVia(j.via); if (!nombre) setNombre(`${OBJETIVOS_CAMPANIA.find((o) => o.value === objetivo)?.label ?? objetivo}${seg ? ' · ' + seg.nombre : ''}`) }
    catch (e: any) { toast.error(e?.message) } finally { setRedactando(false) }
  }

  function setPush(k: 'title' | 'body', v: string) { setMensaje((m) => ({ ...m, push: { ...m.push, [k]: v } })) }
  function setWa(v: string) { setMensaje((m) => ({ ...m, whatsapp: { body: v } })) }
  function setEmailSubject(v: string) { setMensaje((m) => ({ ...m, email: { ...m.email, subject: v } })) }

  async function guardar(enviar: boolean) {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    if (!Object.keys(mensaje).length) { toast.error('Redactá el mensaje primero'); return }
    setBusy(true)
    try {
      const j = await post({ accion: 'guardar', nombre, segmento_id: segmentoId || null, objetivo, canales, mensaje, redactado_por: via === 'ia' ? 'nora' : 'usuario' })
      if (enviar) {
        const e = await post({ accion: 'enviar', id: j.id })
        toast.success(`Enviada: ${e.push} push, ${e.email_enviados} emails, ${e.whatsapp_encolados} WhatsApp encolados`)
      } else toast.success('Borrador guardado')
      onDone()
    } catch (e: any) { toast.error(e?.message) } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Nueva campaña</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 pt-4 pb-8">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label className="text-xs">Segmento</Label>
              <Select value={segmentoId} onValueChange={setSegmentoId}><SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>{segmentos.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} ({s.n_clientes})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-xs">Objetivo</Label>
              <Select value={objetivo} onValueChange={setObjetivo}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OBJETIVOS_CAMPANIA.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Canales</Label>
            <div className="flex flex-wrap gap-2">
              {(['push', 'email', 'whatsapp'] as Canal[]).map((c) => {
                const I = CANAL_ICON[c]; const on = canales.includes(c)
                return (
                  <button key={c} type="button" onClick={() => toggleCanal(c)}
                    className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs', on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                    <I className="size-3.5" /> {CANAL_LABEL[c]}
                    {c === 'whatsapp' && <Badge variant="outline" className="ml-1 text-[9px] text-amber-600">API pendiente</Badge>}
                    {c === 'email' && !emailConfigurado && <Badge variant="outline" className="ml-1 text-[9px] text-amber-600">encola</Badge>}
                  </button>
                )
              })}
            </div>
            {canales.includes('whatsapp') && <p className="text-[11px] text-amber-600">WhatsApp masivo se arma y encola; el envío real se activa con WhatsApp Business API (F19).</p>}
            {canales.includes('email') && !emailConfigurado && <p className="text-[11px] text-amber-600">Sin servicio de email conectado: los emails quedan encolados. Conectá Resend en configuración.</p>}
          </div>

          {/* NORA redacta */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium text-primary"><Sparkles className="size-4" /> NORA redacta</span>
              {via && <Badge variant="outline" className="text-[10px]">{via === 'ia' ? 'IA' : 'plantilla'}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={redactando} onClick={() => redactar('normal')}>{redactando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Redactar</Button>
              {via && <>
                <Button size="sm" variant="outline" disabled={redactando} onClick={() => redactar('otra')}><RefreshCw className="size-3.5" /> Otra versión</Button>
                <Button size="sm" variant="outline" disabled={redactando} onClick={() => redactar('corto')}><Scissors className="size-3.5" /> Más corto</Button>
              </>}
            </div>
          </div>

          {/* Editar mensaje por canal */}
          {mensaje.push && (
            <div className="space-y-1 rounded-md border border-border p-3">
              <Label className="flex items-center gap-1 text-xs"><Bell className="size-3" /> Push</Label>
              <Input value={mensaje.push.title ?? ''} onChange={(e) => setPush('title', e.target.value)} placeholder="Título" className="h-8" />
              <Textarea value={mensaje.push.body ?? ''} onChange={(e) => setPush('body', e.target.value)} rows={2} placeholder="Cuerpo" />
            </div>
          )}
          {mensaje.email && (
            <div className="space-y-1 rounded-md border border-border p-3">
              <Label className="flex items-center gap-1 text-xs"><Mail className="size-3" /> Email</Label>
              <Input value={mensaje.email.subject ?? ''} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Asunto" className="h-8" />
              <p className="text-[11px] text-muted-foreground">Cuerpo HTML con identidad NORA (generado). Usá "otra versión" para regenerarlo.</p>
            </div>
          )}
          {mensaje.whatsapp && (
            <div className="space-y-1 rounded-md border border-border p-3">
              <Label className="flex items-center gap-1 text-xs"><MessageCircle className="size-3" /> WhatsApp</Label>
              <Textarea value={mensaje.whatsapp.body ?? ''} onChange={(e) => setWa(e.target.value)} rows={3} />
            </div>
          )}

          <div className="space-y-1"><Label className="text-xs">Nombre de la campaña</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => guardar(false)}>Guardar borrador</Button>
            <Button disabled={busy || !Object.keys(mensaje).length} onClick={() => guardar(true)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar a {seg?.n_clientes ?? '…'}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
