'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Check, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ConvLite = { id: string; nombre: string }
type SucLite = { id: string; nombre: string }

type Leido = {
  extraccion_id: string
  archivo_nombre: string
  archivo_hash: string
  leido: {
    obra_social: string | null; periodo: string | null
    fecha_liquidacion: string | null; total_debitado: number | null
    confianza: number | null; ilegible: string | null
  }
  filas: any[]
  aviso: string | null
}
type Previa = {
  filas_leidas: number; guardables: number; descartadas: number
  sin_motivo_reconocido: number; total: number
  por_motivo: { motivo: string; n: number; plata: number }[]
  textos_sin_reconocer: string[]
}

export function FotoClient({ convenios, sucursales, miSucursal }: {
  convenios: ConvLite[]; sucursales: SucLite[]; miSucursal: string | null
}) {
  const router = useRouter()
  const [leido, setLeido] = useState<Leido | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    convenio_id: '', sucursal_id: miSucursal ?? '',
    fecha_liquidacion: '', periodo: '',
  })

  async function sacar(file: File) {
    setBusy(true); setPrevia(null)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const r = await fetch('/api/convenios/liquidaciones/foto', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo leer la foto.')
      setLeido(j)
      setF((p) => ({
        ...p,
        fecha_liquidacion: j.leido?.fecha_liquidacion ?? p.fecha_liquidacion,
        periodo: j.leido?.periodo ?? p.periodo,
      }))
      toast.success(`Leídos ${j.filas.length} renglones.`, {
        description: j.aviso ?? (j.leido?.ilegible ?? undefined),
      })
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setBusy(false) }
  }

  async function revisar() {
    if (!leido) return
    if (!f.convenio_id) { toast.error('Elegí la obra social.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/convenios/liquidaciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'previa', convenio_id: f.convenio_id,
          sucursal_id: f.sucursal_id || null,
          fecha_liquidacion: f.fecha_liquidacion || null,
          filas: leido.filas,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo revisar.')
      setPrevia(j)
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  async function confirmar() {
    if (!leido || !previa) return
    setBusy(true)
    try {
      const r = await fetch('/api/convenios/liquidaciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'confirmar', convenio_id: f.convenio_id,
          sucursal_id: f.sucursal_id || null,
          fecha_liquidacion: f.fecha_liquidacion, periodo: f.periodo || null,
          origen: 'foto',
          archivo_nombre: leido.archivo_nombre, archivo_hash: leido.archivo_hash,
          extraccion_id: leido.extraccion_id,
          mapeo: { origen: 'foto', prompt: 'liquidacion-v1' },
          filas: leido.filas,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar.')
      toast.success(`${j.guardados} débitos guardados.`)
      router.push('/admin/convenios/debitos')
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* ── EL LÍMITE, DICHO EN LA PANTALLA ─────────────────────────────── */}
      <div className="flex gap-2 rounded-lg border-l-2 border-foreground/60 bg-muted/30 p-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-snug text-muted-foreground">
          La liquidación en papel suele traer el apellido del afiliado en cada renglón.{' '}
          <b>NORA no lo guarda.</b> Se le pide al modelo que no lo devuelva, y lo que devuelva
          igual se descarta antes de llegar a la base: lo que se registra es qué se descontó y por
          qué, no de quién era la receta.
        </p>
      </div>

      {!leido ? (
        <>
          <p className="text-sm leading-snug text-muted-foreground">
            Sacá la foto del papel completo, de frente y sin sombra. Si la liquidación tiene varias
            hojas, se carga una por una: cada foto es una liquidación aparte y los débitos se suman.
          </p>
          <label className="block">
            <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
              onChange={(e) => { const x = e.target.files?.[0]; if (x) sacar(x) }} />
            <Button asChild size="lg" className="h-14 w-full" disabled={busy}>
              <span>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                {busy ? 'Leyendo el papel…' : 'Sacar la foto'}
              </span>
            </Button>
          </label>
        </>
      ) : (
        <div className="space-y-4">
          <section className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{leido.filas.length} renglones leídos</span>
              {leido.leido.confianza != null && (
                <Badge variant="outline" className="text-[10px]">
                  confianza {Math.round(leido.leido.confianza * 100)}%
                </Badge>
              )}
              {leido.leido.total_debitado != null && (
                <span className="ml-auto text-xs text-muted-foreground">
                  el papel dice {formatARS(leido.leido.total_debitado)}
                </span>
              )}
            </div>
            {leido.leido.obra_social && (
              <p className="text-xs text-muted-foreground">
                El papel dice que es de <b>{leido.leido.obra_social}</b>. Elegila abajo igual: el
                nombre impreso no siempre coincide con el del padrón.
              </p>
            )}
            {leido.leido.ilegible && (
              <p className="flex gap-1.5 text-xs leading-snug text-amber-700 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {leido.leido.ilegible}
              </p>
            )}
            {leido.aviso && (
              <p className="text-xs leading-snug text-muted-foreground">{leido.aviso}</p>
            )}
          </section>

          <Campo label="Obra social">
            <Select value={f.convenio_id} onValueChange={(v) => setF({ ...f, convenio_id: v })}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Elegí" /></SelectTrigger>
              <SelectContent>
                {convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Sucursal">
            <Select value={f.sucursal_id} onValueChange={(v) => setF({ ...f, sucursal_id: v })}
              disabled={!!miSucursal}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Elegí" /></SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>

          <Campo label="Fecha de liquidación"
            ayuda="Desde acá corre el plazo de reclamo. Si el papel la traía, ya está puesta.">
            <Input type="date" className="h-12" value={f.fecha_liquidacion}
              onChange={(e) => setF({ ...f, fecha_liquidacion: e.target.value })} />
          </Campo>

          {!previa ? (
            <Button size="lg" className="h-12 w-full" disabled={busy || !f.convenio_id}
              onClick={revisar}>
              {busy && <Loader2 className="size-4 animate-spin" />} Revisar qué entendió
            </Button>
          ) : (
            <section className="space-y-3 rounded-lg border border-primary/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{formatARS(previa.total)}</span>
                <span className="text-sm text-muted-foreground">
                  en {previa.guardables} débitos
                </span>
              </div>

              {leido.leido.total_debitado != null &&
                Math.abs(leido.leido.total_debitado - previa.total) > 1 && (
                <p className="text-xs leading-snug text-amber-700 dark:text-amber-500">
                  El papel declara {formatARS(leido.leido.total_debitado)} y los renglones leídos
                  suman {formatARS(previa.total)}. La diferencia es{' '}
                  {formatARS(Math.abs(leido.leido.total_debitado - previa.total))}: puede faltar un
                  renglón que no se leyó, o puede que el papel sume otra cosa. Convendría mirar
                  antes de confirmar.
                </p>
              )}

              <div className="space-y-1">
                {previa.por_motivo.map((m) => (
                  <div key={m.motivo} className="flex items-center gap-2 text-sm">
                    <span>{m.motivo === 'otro' ? 'Otro (sin reconocer)' : m.motivo.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{m.n}</span>
                    <span className="ml-auto tabular-nums">{formatARS(m.plata)}</span>
                  </div>
                ))}
              </div>

              {previa.descartadas > 0 && (
                <p className="text-xs leading-snug text-muted-foreground">
                  {previa.descartadas} renglón(es) no se van a guardar: no se les pudo leer el
                  importe. Si son muchos, conviene sacar la foto de nuevo con mejor luz.
                </p>
              )}

              <Button size="lg" className="h-12 w-full" disabled={busy || !previa.guardables}
                onClick={confirmar}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirmar {previa.guardables} débitos
              </Button>
            </section>
          )}

          <Button variant="ghost" className="w-full" onClick={() => { setLeido(null); setPrevia(null) }}>
            Sacar otra foto
          </Button>
        </div>
      )}
    </div>
  )
}

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {ayuda && <p className="text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
