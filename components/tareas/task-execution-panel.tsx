'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Play, CheckCircle2, Camera, Upload, MapPin, PenLine, Thermometer,
  DollarSign, ListChecks, FileText, Loader2, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { EVIDENCIA_LABELS, type EvidenciaTipo } from '@/lib/types/tareas-enterprise'
import type { EvidenciaItem } from '@/lib/tareas/workflow-v2'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const BUCKET = 'tareas-evidencias'

export function TaskExecutionPanel({
  tareaId,
  estado,
  esResponsable,
  esSupervisor,
  requeridas,
  checklistItems,
  verificacionHumana,
  preVerificacion,
}: {
  tareaId: string
  estado: string
  esResponsable: boolean
  esSupervisor: boolean
  requeridas: string[]
  checklistItems: string[] | null
  verificacionHumana: boolean
  preVerificacion: { resultado?: string; motivo?: string } | null
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [evidencias, setEvidencias] = useState<EvidenciaItem[]>([])

  async function accion(accion: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const r = await fetch(`/api/tareas/${tareaId}/accion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion, ...extra }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      toast.success('Listo.')
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setBusy(false)
    }
  }

  const tiposCargados = new Set(evidencias.map((e) => e.tipo))
  const faltan = requeridas.filter((r) => !tiposCargados.has(r))

  function addEvidencia(ev: EvidenciaItem) {
    setEvidencias((prev) => [...prev.filter((e) => e.tipo !== ev.tipo), ev])
  }

  // ---- Estados de la UI ----
  if (['pendiente', 'reclamada', 'rechazada'].includes(estado) && esResponsable) {
    return (
      <div className="space-y-2">
        {estado === 'rechazada' && (
          <p className="text-xs text-destructive">Fue rechazada. Corregí y volvé a completarla.</p>
        )}
        <Button className="w-full" disabled={busy} onClick={() => accion('empezar')}>
          <Play className="size-4" /> Empezar tarea
        </Button>
      </div>
    )
  }

  if (estado === 'en_progreso' && esResponsable) {
    return (
      <div className="space-y-3">
        {requeridas.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Evidencias requeridas
            </div>
            {requeridas.map((tipo) => (
              <EvidenceInput
                key={tipo}
                tipo={tipo as EvidenciaTipo}
                tareaId={tareaId}
                sb={sb}
                checklistItems={checklistItems}
                cargada={tiposCargados.has(tipo)}
                onAdd={addEvidencia}
              />
            ))}
          </div>
        )}
        <Button
          className="w-full"
          disabled={busy || faltan.length > 0}
          onClick={() => accion('completar', { evidencias })}
        >
          <CheckCircle2 className="size-4" />
          {faltan.length > 0
            ? `Faltan: ${faltan.map((f) => EVIDENCIA_LABELS[f as EvidenciaTipo] ?? f).join(', ')}`
            : verificacionHumana ? 'Completar y enviar a verificación' : 'Completar tarea'}
        </Button>
      </div>
    )
  }

  if (estado === 'en_verificacion') {
    return (
      <div className="space-y-3">
        {preVerificacion?.resultado && (
          <div className={cn('rounded-md px-3 py-2 text-xs',
            preVerificacion.resultado === 'aprobada' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : preVerificacion.resultado === 'rechazada' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
            NORA: {preVerificacion.resultado} {preVerificacion.motivo ? `· ${preVerificacion.motivo}` : ''}
          </div>
        )}
        {esSupervisor ? (
          <VerificarAcciones busy={busy} onAprobar={() => accion('aprobar')} onRechazar={(m) => accion('rechazar', { motivo: m })} />
        ) : (
          <p className="text-xs text-muted-foreground">En verificación por el supervisor.</p>
        )}
      </div>
    )
  }

  if (estado === 'completada') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4" /> Tarea completada
      </div>
    )
  }

  return <p className="text-xs text-muted-foreground">Sin acciones disponibles para vos en este estado.</p>
}

function VerificarAcciones({ busy, onAprobar, onRechazar }: { busy: boolean; onAprobar: () => void; onRechazar: (m: string) => void }) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  return (
    <div className="space-y-2">
      {!rechazando ? (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={onAprobar}>
            <ThumbsUp className="size-4" /> Aprobar
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRechazando(true)}>
            <ThumbsDown className="size-4" /> Rechazar
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del rechazo (mín. 10)…" rows={2} />
          <div className="flex gap-2">
            <Button variant="destructive" className="flex-1" disabled={busy || motivo.trim().length < 10} onClick={() => onRechazar(motivo.trim())}>
              Confirmar rechazo
            </Button>
            <Button variant="ghost" onClick={() => setRechazando(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EvidenceInput({
  tipo, tareaId, sb, checklistItems, cargada, onAdd,
}: {
  tipo: EvidenciaTipo
  tareaId: string
  sb: ReturnType<typeof createClient>
  checklistItems: string[] | null
  cargada: boolean
  onAdd: (e: EvidenciaItem) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [temp, setTemp] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [checks, setChecks] = useState<boolean[]>((checklistItems ?? []).map(() => false))
  const fileRef = useRef<HTMLInputElement>(null)

  const now = () => new Date().toISOString()
  const uid = '' // el server reasigna user_id; acá lo dejamos vacío

  async function subirArchivo(file: File, conTemp?: string) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${tareaId}/${tipo}-${Date.now()}.${ext}`
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      onAdd({ tipo, url: path, valor: conTemp, timestamp: now(), user_id: uid })
      toast.success(`${EVIDENCIA_LABELS[tipo]} cargada.`)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo subir.')
    } finally {
      setUploading(false)
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div className={cn('rounded-md border p-2.5', cargada ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border')}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <EvidenceIcon tipo={tipo} />
        {EVIDENCIA_LABELS[tipo]}
        {cargada && <CheckCircle2 className="size-3.5 text-emerald-500" />}
      </div>
      {children}
    </div>
  )

  if (tipo === 'foto' || tipo === 'archivo') {
    return wrap(
      <>
        <input ref={fileRef} type="file" accept={tipo === 'foto' ? 'image/*' : undefined}
          {...(tipo === 'foto' ? { capture: 'environment' as any } : {})}
          className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivo(f) }} />
        <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : tipo === 'foto' ? <Camera className="size-4" /> : <Upload className="size-4" />}
          {cargada ? 'Reemplazar' : tipo === 'foto' ? 'Sacar / subir foto' : 'Subir archivo'}
        </Button>
      </>,
    )
  }

  if (tipo === 'foto_termometro') {
    return wrap(
      <div className="space-y-2">
        <Input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Temperatura (°C)" />
        <input ref={fileRef} type="file" accept="image/*" capture={'environment' as any} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (!temp) { toast.error('Ingresá la temperatura'); return } subirArchivo(f, temp) } }} />
        <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Foto del termómetro
        </Button>
      </div>,
    )
  }

  if (tipo === 'gps') {
    return wrap(
      <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => {
        if (!navigator.geolocation) { toast.error('GPS no disponible'); return }
        setUploading(true)
        navigator.geolocation.getCurrentPosition(
          (pos) => { onAdd({ tipo, valor: `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`, timestamp: now(), user_id: uid }); setUploading(false); toast.success('Ubicación capturada.') },
          () => { setUploading(false); toast.error('No se pudo obtener la ubicación') },
          { enableHighAccuracy: true, timeout: 10000 },
        )
      }}>
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />} Capturar ubicación
      </Button>,
    )
  }

  if (tipo === 'monto_arqueo') {
    return wrap(
      <div className="flex gap-2">
        <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto $" />
        <Button variant="outline" size="sm" disabled={!monto} onClick={() => onAdd({ tipo, valor: monto, timestamp: now(), user_id: uid })}>Guardar</Button>
      </div>,
    )
  }

  if (tipo === 'nota' || tipo === 'qr') {
    return wrap(
      <div className="space-y-2">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder={tipo === 'qr' ? 'Código escaneado…' : 'Nota (mín. 20 caracteres)…'} />
        <Button variant="outline" size="sm" className="w-full" disabled={tipo === 'nota' ? nota.trim().length < 20 : !nota.trim()} onClick={() => onAdd({ tipo, valor: nota.trim(), timestamp: now(), user_id: uid })}>Guardar</Button>
      </div>,
    )
  }

  if (tipo === 'checklist') {
    const items = checklistItems ?? []
    const todos = checks.every(Boolean) && checks.length > 0
    return wrap(
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={checks[i] ?? false} className="size-4 accent-[hsl(var(--primary))]"
              onChange={(e) => { const c = [...checks]; c[i] = e.target.checked; setChecks(c); if (c.every(Boolean) && c.length) onAdd({ tipo, valor: JSON.stringify(items), timestamp: now(), user_id: uid }) }} />
            {it}
          </label>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">Sin ítems definidos en el tipo.</p>}
        {!todos && items.length > 0 && <p className="text-[10px] text-muted-foreground">Marcá todos para completar.</p>}
      </div>,
    )
  }

  if (tipo === 'firma') {
    return wrap(<FirmaCanvas onSave={(file) => subirArchivo(file)} uploading={uploading} />)
  }

  return wrap(<p className="text-xs text-muted-foreground">Tipo no soportado.</p>)
}

function FirmaCanvas({ onSave, uploading }: { onSave: (f: File) => void; uploading: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  function pos(e: React.PointerEvent) {
    const c = ref.current!; const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function start(e: React.PointerEvent) { drawing.current = true; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke() }
  function end() { drawing.current = false }
  function clear() { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height) }
  function save() {
    ref.current!.toBlob((blob) => { if (blob) onSave(new File([blob], 'firma.png', { type: 'image/png' })) }, 'image/png')
  }

  return (
    <div className="space-y-2">
      <canvas ref={ref} width={300} height={120}
        className="w-full touch-none rounded-md border border-dashed bg-white"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" disabled={uploading} onClick={save}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />} Guardar firma
        </Button>
        <Button variant="ghost" size="sm" onClick={clear}>Borrar</Button>
      </div>
    </div>
  )
}

function EvidenceIcon({ tipo }: { tipo: EvidenciaTipo }) {
  const cls = 'size-3.5 text-muted-foreground'
  switch (tipo) {
    case 'foto': return <Camera className={cls} />
    case 'foto_termometro': return <Thermometer className={cls} />
    case 'archivo': return <Upload className={cls} />
    case 'gps': return <MapPin className={cls} />
    case 'monto_arqueo': return <DollarSign className={cls} />
    case 'checklist': return <ListChecks className={cls} />
    case 'firma': return <PenLine className={cls} />
    default: return <FileText className={cls} />
  }
}
