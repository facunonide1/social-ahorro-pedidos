'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, Download, Loader2, Plus, Trash2, Star } from 'lucide-react'
import { toast } from 'sonner'

import { parseSpreadsheet, exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RUBROS } from '@/components/compras/rubro'
import { cn } from '@/lib/utils'

const NONE = '__none__'
const CAMPOS = [
  { key: 'sku', label: 'SKU / cód. interno' },
  { key: 'codigo', label: 'EAN / cód. barras' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'precio', label: 'Precio *' },
  { key: 'desc_volumen', label: 'Desc. por volumen (opcional)' },
] as const

export type ProvLite = { id: string; nombre: string; rubros: string[] }
export type ListaRow = { id: string; proveedor: string; proveedor_id: string; rubro: string; archivo: string | null; fecha: string; vigente: boolean; es_demo: boolean; items: number; matchPct: number }

function autoMap(headers: string[]): Record<string, string> {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const find = (...keys: string[]) => headers.find((h) => keys.some((k) => n(h).includes(k))) ?? NONE
  return {
    sku: find('sku', 'codigointerno', 'codigo'),
    codigo: find('ean', 'barras', 'codigobarras'),
    descripcion: find('descripcion', 'producto', 'articulo', 'nombre', 'detalle'),
    precio: find('precio', 'costo', 'importe', 'valor'),
    desc_volumen: find('volumen', 'bonif', 'descuento'),
  }
}

export function ListasPreciosClient({ listas, proveedores }: { listas: ListaRow[]; proveedores: ProvLite[] }) {
  const router = useRouter()
  const [importar, setImportar] = useState(false)

  async function accion(body: any, ok: string) {
    try {
      const r = await fetch('/api/compras/listas-precios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">{listas.length} listas cargadas</div>
        <Button size="sm" className="ml-auto" onClick={() => setImportar(true)}><Plus className="size-4" /> Importar lista</Button>
      </div>

      {listas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <FileSpreadsheet className="size-7 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">Sin listas de precios. Importá la lista de una droguería para empezar a comparar.</div>
          <Button size="sm" onClick={() => setImportar(true)}><Upload className="size-4" /> Importar lista</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Rubro</th><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Carga</th><th className="px-3 py-2 text-right">Ítems</th><th className="px-3 py-2 text-right">Match</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {listas.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium">{l.proveedor}{l.es_demo && <Badge variant="outline" className="ml-2 text-[9px]">demo</Badge>}</td>
                  <td className="px-3 py-1.5 text-xs">{l.rubro}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{l.archivo ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{String(l.fecha).slice(0, 10)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.items}</td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', l.matchPct < 60 && 'text-amber-600 dark:text-amber-400')}>{l.matchPct}%</td>
                  <td className="px-3 py-1.5">{l.vigente ? <Badge variant="success" className="font-normal">vigente</Badge> : <Badge variant="outline" className="font-normal">histórica</Badge>}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      {!l.vigente && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Marcar vigente" onClick={() => accion({ accion: 'marcar_vigente', id: l.id, proveedor_id: l.proveedor_id, rubro: l.rubro }, 'Marcada vigente.')}><Star className="size-3.5" /></Button>}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-rose-600" title="Eliminar" onClick={() => { if (confirm('¿Eliminar la lista y sus precios?')) accion({ accion: 'eliminar', id: l.id }, 'Lista eliminada.') }}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importar && <ImportarLista proveedores={proveedores} onClose={() => setImportar(false)} />}
    </div>
  )
}

function ImportarLista({ proveedores, onClose }: { proveedores: ProvLite[]; onClose: () => void }) {
  const router = useRouter()
  const [provId, setProvId] = useState('')
  const [rubro, setRubro] = useState('farmacia')
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapeo, setMapeo] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onFile(file: File) {
    try {
      const { headers: h, rows: r } = await parseSpreadsheet(file)
      if (h.length === 0) { toast.error('El archivo no tiene encabezados.'); return }
      setFileName(file.name); setHeaders(h); setRows(r); setMapeo(autoMap(h)); setPreview(null); setDone(false)
    } catch { toast.error('No se pudo leer el archivo. Usá Excel o CSV (si es PDF, exportalo a Excel).') }
  }

  function buildFilas() {
    const idx = (col: string) => headers.indexOf(col)
    const num = (v: string) => { const n = Number(String(v).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
    const get = (r: string[], k: string) => { const c = mapeo[k]; return c && c !== NONE ? (r[idx(c)] ?? '').trim() : '' }
    return rows.map((r) => ({ sku: get(r, 'sku') || null, codigo: get(r, 'codigo') || null, descripcion: get(r, 'descripcion') || null, precio: num(get(r, 'precio')), desc_volumen: get(r, 'desc_volumen') || null }))
  }

  async function analizar() {
    if (!provId) { toast.error('Elegí el proveedor.'); return }
    if (!mapeo.precio || mapeo.precio === NONE) { toast.error('Mapeá la columna de precio.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/compras/listas-precios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'analizar', proveedor_id: provId, rubro, filas: buildFilas() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      setPreview(j)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  async function confirmar() {
    setBusy(true)
    try {
      const r = await fetch('/api/compras/listas-precios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'confirmar', proveedor_id: provId, rubro, archivo_nombre: fileName, mapeo, filas: buildFilas() }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Lista cargada: ${j.matcheados}/${j.total} matcheados. Ya aparece en el comparador.`); setDone(true); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Importar lista de precios</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Proveedor / droguería *</Label>
              <Select value={provId} onValueChange={setProvId}><SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>{proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rubro</Label>
              <Select value={rubro} onValueChange={setRubro}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RUBROS.filter((r) => r.v !== 'todos').map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent></Select></div>
          </div>

          <label className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50', fileName && 'border-primary/40 bg-nora-bg')}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}>
            {fileName ? <><FileSpreadsheet className="size-7 text-primary" /><div className="text-sm font-medium">{fileName}</div><div className="text-xs text-muted-foreground">{rows.length} filas · {headers.length} columnas</div></>
              : <><Upload className="size-7 text-muted-foreground" /><div className="text-sm font-medium">Arrastrá el Excel/CSV de la lista o hacé click</div><div className="text-xs text-muted-foreground">PDF: exportalo a Excel/CSV primero</div></>}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          </label>

          {headers.length > 0 && !preview && (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Mapeo de columnas</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {CAMPOS.map((c) => (
                    <div key={c.key} className="space-y-1"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</Label>
                      <Select value={mapeo[c.key] ?? NONE} onValueChange={(v) => setMapeo((m) => ({ ...m, [c.key]: v }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value={NONE}>— sin mapear —</SelectItem>{headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={analizar} disabled={busy} size="lg">{busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Analizar {rows.length} filas</Button>
            </>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Kpi label="Filas" value={preview.total} />
                <Kpi label="Matcheados" value={preview.matcheados} tone="ok" />
                <Kpi label="Sin match" value={preview.sin_match} tone={preview.sin_match > 0 ? 'warn' : undefined} />
              </div>
              <div className="flex flex-wrap gap-2">
                {!done ? <Button onClick={confirmar} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirmar e importar</Button>
                  : <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Importada</span>}
                <Button variant="outline" onClick={() => exportExcel('lista-precios-preview', preview.preview.map((p: any) => ({ SKU: p.sku ?? '', EAN: p.codigo ?? '', Descripcion: p.descripcion ?? '', Precio: p.precio, Match: p.producto_id ? p.via : 'sin match' })))}><Download className="size-4" /> Excel</Button>
                {done && <Button variant="ghost" onClick={onClose}>Cerrar</Button>}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2">Match</th></tr></thead>
                  <tbody>
                    {preview.preview.slice(0, 200).map((p: any, i: number) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono text-xs">{p.sku ?? '—'}</td>
                        <td className="px-3 py-1.5">{p.descripcion ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.precio}</td>
                        <td className="px-3 py-1.5">{p.producto_id ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">{p.via}</span> : <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">sin match</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const c = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
  return <div className="rounded-xl border bg-card p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={cn('mt-1 text-2xl font-semibold tabular-nums', c)}>{(value ?? 0).toLocaleString('es-AR')}</div></div>
}
