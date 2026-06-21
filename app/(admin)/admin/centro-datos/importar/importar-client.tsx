'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, Loader2, AlertTriangle,
  Info, XCircle, Sparkles, TrendingUp, TrendingDown, PackagePlus, Clock,
} from 'lucide-react'
import { toast } from 'sonner'

import { parseSpreadsheet } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  FRECUENCIA_LABEL, FRECUENCIA_HORAS, TIPO_PERFIL_LABEL, FORMATOS_ACEPTADOS,
  type PerfilDatos, type Anomalia, type ResumenImport, type FrecuenciaDatos,
} from '@/lib/types/centro-datos'

type Suc = { id: string; nombre: string }
type ItemPreview = {
  fila: number; sku: string | null; nombre: string | null; producto_id: string | null
  nombre_match: string | null; via: string | null; precio_nuevo: number | null
  precio_anterior: number | null; delta_precio_pct: number | null; stock_nuevo: number | null
  cantidad: number | null; monto: number | null; es_nuevo: boolean
}
type Analisis = { total: number; matcheados: number; sin_match: number; anomalias: Anomalia[]; resumen: ResumenImport; preview: ItemPreview[] }

function horasDesde(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}

const SEMAFORO: Record<Anomalia['severidad'], { icon: any; cls: string }> = {
  info: { icon: Info, cls: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30' },
  warning: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-500/10 border-amber-500/30' },
  critica: { icon: XCircle, cls: 'text-red-600 bg-red-500/10 border-red-500/30' },
}

export function ImportarClient({
  perfiles, sucursales, sucursalActiva, perfilPreseleccionado,
}: {
  perfiles: PerfilDatos[]; sucursales: Suc[]; sucursalActiva: string | null; perfilPreseleccionado: string | null
}) {
  const router = useRouter()
  const [activo, setActivo] = useState<PerfilDatos | null>(
    perfilPreseleccionado ? perfiles.find((p) => p.id === perfilPreseleccionado) ?? null : null,
  )

  if (activo) {
    return <FlujoImport perfil={activo} sucursales={sucursales} sucursalActiva={sucursalActiva} onBack={() => { setActivo(null); router.refresh() }} />
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">{perfiles.length} perfiles de importación. Elegí uno y subí el archivo.</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perfiles.map((p) => {
          const limite = FRECUENCIA_HORAS[p.frecuencia]
          const h = horasDesde(p.ultima_carga)
          const atrasado = limite != null && (h == null || h > limite)
          return (
            <button key={p.id} onClick={() => setActivo(p)}
              className="group rounded-lg border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-muted/50 p-2 text-primary"><FileSpreadsheet className="size-5" /></div>
                <div className="flex flex-col items-end gap-1">
                  {p.es_sistema && <Badge variant="outline" className="text-[10px]">SIFACO</Badge>}
                  <Badge variant="secondary" className="text-[10px]">{FRECUENCIA_LABEL[p.frecuencia]}</Badge>
                </div>
              </div>
              <div className="mt-3 font-medium">{p.nombre}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{TIPO_PERFIL_LABEL[p.tipo]}</div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {atrasado ? (
                  <span className="flex items-center gap-1 text-amber-600"><Clock className="size-3" /> {p.ultima_carga ? 'desactualizado' : 'nunca cargado'}</span>
                ) : (
                  <span className="text-muted-foreground">{p.ultima_carga ? `Última: ${new Date(p.ultima_carga).toLocaleDateString('es-AR')}` : 'Sin cargas'}</span>
                )}
              </div>
              <div className="mt-3"><span className="inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:underline"><Upload className="size-3.5" /> Subir ahora</span></div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FlujoImport({ perfil, sucursales, sucursalActiva, onBack }: { perfil: PerfilDatos; sucursales: Suc[]; sucursalActiva: string | null; onBack: () => void }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [sucursal, setSucursal] = useState<string>(sucursalActiva ?? '')
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [hecho, setHecho] = useState<{ filas_ok: number; sin_match: number; job: string } | null>(null)

  const requiereSucursal = perfil.tipo === 'ventas'
  const sucursalParaStock = perfil.tipo === 'productos' || perfil.tipo === 'stock'

  async function elegirArchivo(f: File) {
    setArchivo(f); setAnalisis(null); setHecho(null)
    try {
      const { headers, rows } = await parseSpreadsheet(f)
      if (!headers.length) { toast.error('No se detectaron columnas en el archivo'); return }
      setHeaders(headers); setRows(rows)
    } catch (e: any) { toast.error('No se pudo leer el archivo: ' + (e?.message ?? '')) }
  }

  async function analizar() {
    if (!headers.length) { toast.error('Subí un archivo primero'); return }
    if (requiereSucursal && !sucursal) { toast.error('Elegí una sucursal'); return }
    setCargando(true)
    try {
      const r = await fetch('/api/centro-datos/import', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'analizar', perfil_id: perfil.id, headers, rows, sucursal_id: sucursal || null, fecha }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      setAnalisis(j)
    } catch (e: any) { toast.error(e?.message ?? 'Error al analizar') } finally { setCargando(false) }
  }

  async function confirmar(forzar = false) {
    setAplicando(true)
    try {
      const r = await fetch('/api/centro-datos/import', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'confirmar', perfil_id: perfil.id, headers, rows, sucursal_id: sucursal || null, fecha, archivo_nombre: archivo?.name ?? null, forzar }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      if (j?.duplicado && !forzar) {
        if (confirm(`${j.mensaje}\n\n¿Aplicar igual?`)) return confirmar(true)
        return
      }
      setHecho({ filas_ok: j.filas_ok, sin_match: j.filas_sin_match, job: j.import_job_id })
      toast.success(`Importación aplicada: ${j.filas_ok} filas`)
    } catch (e: any) { toast.error(e?.message ?? 'Error al aplicar') } finally { setAplicando(false) }
  }

  const peorSeveridad = useMemo<Anomalia['severidad']>(() => {
    if (!analisis) return 'info'
    if (analisis.anomalias.some((a) => a.severidad === 'critica')) return 'critica'
    if (analisis.anomalias.some((a) => a.severidad === 'warning')) return 'warning'
    return 'info'
  }, [analisis])

  if (hecho) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <div className="text-lg font-semibold">Importación aplicada</div>
        <div className="text-sm text-muted-foreground">{hecho.filas_ok} filas procesadas{hecho.sin_match > 0 ? ` · ${hecho.sin_match} sin matchear` : ''}.</div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" /> Volver</Button>
          {hecho.sin_match > 0 && <Button variant="outline" onClick={() => router.push('/admin/centro-datos/sin-matchear')}>Resolver {hecho.sin_match} sin match</Button>}
          <Button onClick={() => router.push('/admin/centro-datos/historial')}>Ver en historial</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Perfiles de importación</button>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-primary" />
          <div><div className="font-medium">{perfil.nombre}</div><div className="text-xs text-muted-foreground">{TIPO_PERFIL_LABEL[perfil.tipo]} · acepta {FORMATOS_ACEPTADOS}</div></div>
        </div>

        {/* config: sucursal / fecha */}
        {(requiereSucursal || sucursalParaStock) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Sucursal {requiereSucursal ? '*' : '(para stock)'}</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger><SelectValue placeholder="Elegí sucursal" /></SelectTrigger>
                <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {requiereSucursal && (
              <div><Label className="text-xs">Fecha *</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            )}
          </div>
        )}

        {/* upload */}
        <div className="mt-4">
          <input ref={fileInput} type="file" accept={FORMATOS_ACEPTADOS} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) elegirArchivo(f) }} />
          <button onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/30">
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-sm">{archivo ? <span className="font-medium">{archivo.name}</span> : 'Click para elegir archivo'}</div>
            {!!rows.length && <div className="text-xs text-muted-foreground">{rows.length} filas · {headers.length} columnas detectadas</div>}
          </button>
        </div>

        {!analisis && (
          <Button className="mt-4 w-full" disabled={!rows.length || cargando} onClick={analizar}>
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            NORA: leer y validar
          </Button>
        )}
      </div>

      {/* Resultado del análisis */}
      {analisis && (
        <div className="space-y-4">
          {/* mejora 8: explicación NORA */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" /> NORA leyó el archivo</div>
            <div className="mt-1.5 text-sm">{analisis.resumen.texto}</div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{analisis.matcheados} matcheados</span>
              {analisis.sin_match > 0 && <span className="text-amber-600">{analisis.sin_match} sin match</span>}
              {!!analisis.resumen.nuevos && <span className="inline-flex items-center gap-1"><PackagePlus className="size-3" /> {analisis.resumen.nuevos} nuevos</span>}
              {!!analisis.resumen.subieron_precio && <span className="inline-flex items-center gap-1 text-red-600"><TrendingUp className="size-3" /> {analisis.resumen.subieron_precio} suben</span>}
              {!!analisis.resumen.bajaron_precio && <span className="inline-flex items-center gap-1 text-emerald-600"><TrendingDown className="size-3" /> {analisis.resumen.bajaron_precio} bajan</span>}
            </div>
          </div>

          {/* mejora 2: semáforo */}
          <div className="space-y-2">
            {analisis.anomalias.map((a, i) => {
              const S = SEMAFORO[a.severidad]; const SIcon = S.icon
              return (
                <div key={i} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', S.cls)}>
                  <SIcon className="mt-0.5 size-4 shrink-0" />
                  <div><div className="font-medium">{a.mensaje}</div>{a.detalle && <div className="text-xs opacity-80">{a.detalle}</div>}</div>
                </div>
              )
            })}
          </div>

          {/* preview */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">CODIGO</th><th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2">Match</th>
                  {perfil.tipo === 'ventas' ? <><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Monto</th></>
                    : <><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Δ%</th><th className="px-3 py-2 text-right">Stock</th></>}
                </tr>
              </thead>
              <tbody>
                {analisis.preview.slice(0, 100).map((it) => (
                  <tr key={it.fila} className="border-t border-border/60">
                    <td className="px-3 py-1.5 font-mono text-xs">{it.sku ?? '—'}</td>
                    <td className="px-3 py-1.5 max-w-[220px] truncate">{it.nombre ?? it.nombre_match ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {it.producto_id ? <Badge variant="outline" className="text-[10px]">{it.via}</Badge>
                        : <Badge variant="secondary" className="text-[10px] text-amber-600">sin match</Badge>}
                    </td>
                    {perfil.tipo === 'ventas' ? (
                      <><td className="px-3 py-1.5 text-right">{it.cantidad ?? '—'}</td><td className="px-3 py-1.5 text-right">{it.monto != null ? `$${it.monto.toLocaleString('es-AR')}` : '—'}</td></>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-right">{it.precio_nuevo != null ? `$${it.precio_nuevo.toLocaleString('es-AR')}` : '—'}</td>
                        <td className={cn('px-3 py-1.5 text-right', (it.delta_precio_pct ?? 0) > 0 ? 'text-red-600' : (it.delta_precio_pct ?? 0) < 0 ? 'text-emerald-600' : '')}>{it.delta_precio_pct != null ? `${it.delta_precio_pct > 0 ? '+' : ''}${it.delta_precio_pct}%` : '—'}</td>
                        <td className="px-3 py-1.5 text-right">{it.stock_nuevo ?? '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {analisis.total > analisis.preview.length && <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-center text-xs text-muted-foreground">Mostrando {Math.min(100, analisis.preview.length)} de {analisis.total} filas</div>}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">Se guarda un snapshot antes de aplicar (deshacer disponible).</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAnalisis(null)}>Cancelar</Button>
              <Button disabled={aplicando} onClick={() => confirmar(false)} className={peorSeveridad === 'critica' ? 'bg-amber-600 hover:bg-amber-700' : ''}>
                {aplicando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                {peorSeveridad === 'critica' ? 'Aplicar igual' : 'Confirmar e importar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
