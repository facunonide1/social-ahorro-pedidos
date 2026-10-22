'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, Camera, Loader2, Check, AlertTriangle, FileSpreadsheet, Columns3,
} from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { leerLiquidacion, type LecturaDeLiquidacion } from '@/lib/convenios/leer-liquidacion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ConvLite = { id: string; nombre: string }
type SucLite = { id: string; nombre: string }
type Motivo = { clave: string; nombre: string }
type Liq = {
  id: string; fecha_liquidacion: string; periodo: string | null; origen: string
  archivo_nombre: string | null; filas_leidas: number | null; filas_guardadas: number | null
  sin_motivo_reconocido: number | null; total_debitado: number | null; estado: string
  columnas_leidas: any
  convenios: { nombre: string } | null
  sucursales: { nombre: string } | null
}

type Previa = {
  filas_leidas: number; guardables: number; descartadas: number
  sin_motivo_reconocido: number; total: number
  por_motivo: { motivo: string; n: number; plata: number }[]
  descartes: { numero: string | null; importe: number | null; por_que: string }[]
  textos_sin_reconocer: string[]
}

export function LiquidacionesClient({
  convenios, sucursales, liquidaciones, motivos, miSucursal, puedeImportar,
}: {
  convenios: ConvLite[]; sucursales: SucLite[]; liquidaciones: Liq[]
  motivos: Motivo[]; miSucursal: string | null; puedeImportar: boolean
}) {
  const router = useRouter()
  const [lectura, setLectura] = useState<LecturaDeLiquidacion | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    convenio_id: '', sucursal_id: miSucursal ?? '',
    fecha_liquidacion: new Date().toISOString().slice(0, 10), periodo: '',
  })

  const nombreMotivo = (c: string) => motivos.find((m) => m.clave === c)?.nombre ?? c

  if (!convenios.length) {
    return (
      <div className="max-w-xl space-y-2 rounded-lg border border-dashed p-5">
        <h2 className="font-medium">No hay convenios cargados.</h2>
        <p className="text-sm leading-snug text-muted-foreground">
          Un débito es siempre de una obra social. Antes de importar la liquidación hay que tener
          el convenio en el padrón — y conviene tenerlo completo, porque el plazo de reclamo sale
          de ahí.
        </p>
        <Button variant="outline" asChild className="mt-1">
          <a href="/admin/convenios/padron">Ir al padrón</a>
        </Button>
      </div>
    )
  }

  async function elegirArchivo(file: File) {
    setBusy(true); setPrevia(null)
    try {
      const l = await leerLiquidacion(file)
      setLectura(l)
      if (l.mapeo['Importe debitado'] == null) {
        toast.error('No se encontró la columna de importe.', {
          description: 'Mirá abajo qué columnas tiene el archivo. Sin importe no se puede guardar ninguna fila.',
        })
      } else {
        toast.success(`Leído: ${l.filas.length} filas.`)
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo leer el archivo.')
    } finally { setBusy(false) }
  }

  async function verPrevia() {
    if (!lectura) return
    if (!f.convenio_id) { toast.error('Elegí la obra social.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/convenios/liquidaciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'previa', convenio_id: f.convenio_id,
          sucursal_id: f.sucursal_id || null, fecha_liquidacion: f.fecha_liquidacion,
          filas: lectura.filas,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo revisar.')
      setPrevia(j)
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  async function confirmar() {
    if (!lectura || !previa) return
    setBusy(true)
    try {
      const r = await fetch('/api/convenios/liquidaciones', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'confirmar', convenio_id: f.convenio_id,
          sucursal_id: f.sucursal_id || null,
          fecha_liquidacion: f.fecha_liquidacion, periodo: f.periodo || null,
          archivo_nombre: lectura.nombre, archivo_hash: lectura.hash,
          mapeo: lectura.mapeo, filas: lectura.filas,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar.')
      toast.success(`${j.guardados} débitos guardados.`, {
        description: j.errores ? `Con errores: ${j.errores.join('; ')}` : undefined,
      })
      setLectura(null); setPrevia(null); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {puedeImportar && (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-semibold">Importar una liquidación</h2>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              El archivo se lee <b>en tu máquina</b>. Lo que se manda al servidor son las filas ya
              leídas, para que te diga qué entendió antes de guardar nada. No se asume ningún
              formato: se buscan las columnas por nombre entre los nombres que se usan
              habitualmente, y se muestra cuál se usó para cada cosa.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Obra social">
              <Select value={f.convenio_id} onValueChange={(v) => setF({ ...f, convenio_id: v })}>
                <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>
                  {convenios.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Sucursal"
              ayuda={miSucursal ? 'Tu sucursal.' : 'Si el archivo trae la sucursal por fila, gana la del archivo.'}>
              <Select value={f.sucursal_id} onValueChange={(v) => setF({ ...f, sucursal_id: v })}
                disabled={!!miSucursal}>
                <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>
                  {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Fecha de liquidación"
              ayuda="Desde acá corre el plazo de reclamo de cada débito.">
              <Input type="date" value={f.fecha_liquidacion}
                onChange={(e) => setF({ ...f, fecha_liquidacion: e.target.value })} />
            </Campo>
            <Campo label="Período (opcional)">
              <Input value={f.periodo} placeholder="Ej: 09/2026"
                onChange={(e) => setF({ ...f, periodo: e.target.value })} />
            </Campo>
          </div>

          <div className="flex flex-wrap gap-2">
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const x = e.target.files?.[0]; if (x) elegirArchivo(x) }} />
              <Button asChild size="lg" variant="outline" className="h-12">
                <span><Upload className="size-4" /> Elegir archivo</span>
              </Button>
            </label>
            {/* E.3 · la foto reusa el motor de documentos, en otra pantalla. */}
            <Button size="lg" variant="outline" className="h-12" asChild>
              <a href="/admin/convenios/liquidaciones/foto">
                <Camera className="size-4" /> Cargar por foto
              </a>
            </Button>
          </div>

          {/* ── E.1 · QUÉ COLUMNAS SE LEYERON ──────────────────────────── */}
          {lectura && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="font-medium">{lectura.nombre}</span>
                <span className="text-xs text-muted-foreground">{lectura.filas.length} filas</span>
                {lectura.total != null
                  ? <Badge variant="outline" className="text-[10px]">{formatARS(lectura.total)}</Badge>
                  : <Badge variant="destructive" className="text-[10px]">sin columna de importe</Badge>}
              </div>

              <div className="space-y-1">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Columns3 className="size-3" /> Qué columna se usó para cada cosa
                </h3>
                <div className="grid gap-1 text-xs sm:grid-cols-2">
                  {Object.entries(lectura.mapeo).map(([campo, col]) => (
                    <div key={campo} className="flex gap-2">
                      <span className="text-muted-foreground">{campo}:</span>
                      {col
                        ? <code className="font-medium">{col}</code>
                        : <span className="text-amber-700 dark:text-amber-500">no se encontró</span>}
                    </div>
                  ))}
                </div>
              </div>

              {lectura.sin_usar.length > 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Columnas del archivo que no se usaron: {lectura.sin_usar.map((c) => `«${c}»`).join(', ')}.
                  Si alguna de esas es la que importa, el archivo no se leyó bien.
                </p>
              )}

              <Button disabled={busy || !f.convenio_id} onClick={verPrevia}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Revisar qué entendió
              </Button>
            </div>
          )}

          {/* ── LA PREVIA, ANTES DE GUARDAR ───────────────────────────── */}
          {previa && (
            <div className="space-y-3 rounded-lg border border-primary/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{formatARS(previa.total)}</span>
                <span className="text-sm text-muted-foreground">
                  en {previa.guardables} débitos, de {previa.filas_leidas} filas leídas
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Qué motivo le puso a cada uno
                </h3>
                {previa.por_motivo.map((m) => (
                  <div key={m.motivo} className="flex items-center gap-2 text-sm">
                    <span>{nombreMotivo(m.motivo)}</span>
                    {m.motivo === 'otro' && (
                      <Badge variant="outline" className="text-[10px] text-amber-700">sin reconocer</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{m.n}</span>
                    <span className="ml-auto tabular-nums">{formatARS(m.plata)}</span>
                  </div>
                ))}
              </div>

              {previa.sin_motivo_reconocido > 0 && (
                <div className="space-y-1 rounded border border-amber-500/40 bg-amber-500/5 p-2.5">
                  <p className="text-xs leading-snug">
                    <b>{previa.sin_motivo_reconocido} débito(s) con un motivo que no se reconoció.</b>{' '}
                    Entran como «Otro» con el texto original guardado tal cual. No se les inventa un
                    motivo para que encajen: un débito mal clasificado queda marcado como no
                    reclamable para siempre y nadie lo vuelve a mirar.
                  </p>
                  {previa.textos_sin_reconocer.length > 0 && (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Los textos que no se entendieron:{' '}
                      {previa.textos_sin_reconocer.slice(0, 8).map((t) => `«${t}»`).join(', ')}
                      {previa.textos_sin_reconocer.length > 8 && ` y ${previa.textos_sin_reconocer.length - 8} más`}.
                    </p>
                  )}
                </div>
              )}

              {previa.descartadas > 0 && (
                <div className="space-y-1">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                    <AlertTriangle className="size-3" /> {previa.descartadas} fila(s) no se van a guardar
                  </h3>
                  <div className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] leading-snug text-muted-foreground">
                    {previa.descartes.slice(0, 50).map((d, i) => (
                      <div key={i}>
                        {d.numero ?? '(sin número)'}
                        {d.importe != null && ` · ${formatARS(d.importe)}`} — {d.por_que}
                      </div>
                    ))}
                    {previa.descartes.length > 50 && (
                      <div>… y {previa.descartes.length - 50} más, todas por los mismos motivos.</div>
                    )}
                  </div>
                </div>
              )}

              <Button size="lg" className="h-12 w-full" disabled={busy || !previa.guardables}
                onClick={confirmar}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirmar y guardar {previa.guardables} débitos
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Al confirmar, los que sean reclamables van a generar su tarea con el plazo. El
                archivo queda registrado por su contenido: si se vuelve a subir el mismo, se
                rechaza — importarlo dos veces duplicaría cada débito.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── LAS IMPORTACIONES ANTERIORES ────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lo que se importó
        </h2>
        {!liquidaciones.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
            No se importó ninguna liquidación todavía. Hasta que entre la primera, el sector no
            puede decir cuánto te debitaron: no es que sea cero, es que no hay con qué mirarlo.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {liquidaciones.map((l) => (
              <div key={l.id} className="space-y-0.5 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.convenios?.nombre ?? '—'}</span>
                  {l.sucursales?.nombre && (
                    <span className="text-xs text-muted-foreground">{l.sucursales.nombre}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{l.fecha_liquidacion}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {l.origen === 'foto' ? 'por foto' : 'archivo'}
                  </Badge>
                  <span className="ml-auto tabular-nums">
                    {l.total_debitado != null ? formatARS(Number(l.total_debitado)) : '—'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {l.filas_guardadas ?? 0} de {l.filas_leidas ?? 0} filas guardadas
                  {(l.sin_motivo_reconocido ?? 0) > 0 && (
                    <> · {l.sin_motivo_reconocido} sin motivo reconocido, en «Otro» con su texto</>
                  )}
                  {l.archivo_nombre && <> · {l.archivo_nombre}</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
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
