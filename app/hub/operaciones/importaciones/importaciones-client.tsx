'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle2, Download, History, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { parseSpreadsheet, exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const NONE = '__none__'
const CAMPOS = [
  { key: 'sku', label: 'SKU', req: false },
  { key: 'ean', label: 'EAN / cód. barras', req: false },
  { key: 'nombre', label: 'Nombre', req: false },
  { key: 'stock_nuevo', label: 'Stock actual', req: true },
  { key: 'cantidad_vendida', label: 'Cantidad vendida (opcional)', req: false },
] as const

type Sucursal = { id: string; nombre: string; codigo: string | null }
type ItemAnalizado = {
  fila: number; sku: string | null; ean: string | null; nombre_origen: string | null
  producto_id: string | null; nombre_match: string | null
  stock_anterior: number | null; stock_nuevo: number; diferencia: number
  cantidad_vendida_declarada: number | null; interpretado_como: string
}

function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `h${(h >>> 0).toString(16)}`
}
function autoMap(headers: string[]): Record<string, string> {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const find = (...keys: string[]) => headers.find((h) => keys.some((k) => n(h).includes(k))) ?? NONE
  return {
    sku: find('sku', 'codigointerno', 'codigo'),
    ean: find('ean', 'barras', 'codigobarras'),
    nombre: find('nombre', 'descripcion', 'producto', 'articulo'),
    stock_nuevo: find('stock', 'existencia', 'cantidad'),
    cantidad_vendida: find('vendid', 'venta'),
  }
}

export function ImportacionesClient({
  sucursales, imports, configs,
}: {
  sucursales: Sucursal[]
  imports: any[]
  configs: any[]
}) {
  const [tab, setTab] = useState<'stock' | 'vencimientos' | 'historial'>('stock')
  const sucName = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? id.slice(0, 6)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {([['stock', 'Importar stock'], ['vencimientos', 'Importar vencimientos'], ['historial', 'Historial']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'stock' && <ImportarStock sucursales={sucursales} configs={configs} />}
      {tab === 'vencimientos' && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Importador de vencimientos (T4) — próximamente. Cargará lotes con fecha de vencimiento.
        </div>
      )}
      {tab === 'historial' && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Sucursal</th><th className="px-3 py-2">Archivo</th><th className="px-3 py-2">Filas</th><th className="px-3 py-2">Ventas u.</th><th className="px-3 py-2">Discrep.</th><th className="px-3 py-2">Estado</th></tr>
            </thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2">{i.fecha}</td>
                  <td className="px-3 py-2">{sucName(i.sucursal_id)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{i.archivo_nombre}</td>
                  <td className="px-3 py-2 tabular-nums">{i.filas_total}</td>
                  <td className="px-3 py-2 tabular-nums">{i.ventas_detectadas}</td>
                  <td className="px-3 py-2 tabular-nums">{i.discrepancias}</td>
                  <td className="px-3 py-2">{i.estado}</td>
                </tr>
              ))}
              {imports.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground"><History className="mx-auto mb-2 size-6" />Sin importaciones todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ImportarStock({ sucursales, configs }: { sucursales: Sucursal[]; configs: any[] }) {
  const router = useRouter()
  const hoy = new Date().toISOString().slice(0, 10)
  const [sucId, setSucId] = useState(sucursales[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoy)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapeo, setMapeo] = useState<Record<string, string>>({})
  const [items, setItems] = useState<ItemAnalizado[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmado, setConfirmado] = useState<any>(null)

  const configStock = configs.find((c) => c.tipo === 'stock')

  async function onFile(file: File) {
    try {
      const { headers: h, rows: r } = await parseSpreadsheet(file)
      if (h.length === 0) { toast.error('El archivo no tiene encabezados.'); return }
      setFileName(file.name); setHeaders(h); setRows(r)
      setMapeo(configStock?.mapeo_columnas && Object.keys(configStock.mapeo_columnas).length ? configStock.mapeo_columnas : autoMap(h))
      setItems(null); setConfirmado(null)
    } catch { toast.error('No se pudo leer el archivo.') }
  }

  function buildFilas() {
    const idx = (col: string) => headers.indexOf(col)
    const num = (v: string) => { const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
    return rows.map((r, i) => {
      const get = (k: string) => { const c = mapeo[k]; return c && c !== NONE ? (r[idx(c)] ?? '').trim() : '' }
      return {
        fila: i + 2, sku: get('sku') || null, ean: get('ean') || null, nombre: get('nombre') || null,
        stock_nuevo: num(get('stock_nuevo')),
        cantidad_vendida: mapeo.cantidad_vendida && mapeo.cantidad_vendida !== NONE ? num(get('cantidad_vendida')) : null,
      }
    })
  }

  async function analizar() {
    if (!sucId) { toast.error('Elegí la sucursal.'); return }
    if (mapeo.stock_nuevo === NONE || !mapeo.stock_nuevo) { toast.error('Mapeá la columna de stock actual.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/inventario/import-stock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'analizar', sucursalId: sucId, filas: buildFilas() }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      setItems(j.items)
    } catch (e: any) { toast.error(e?.message ?? 'Error al analizar') } finally { setBusy(false) }
  }

  async function confirmar() {
    if (!items) return
    setBusy(true)
    try {
      const h = hash(`${sucId}|${fecha}|${JSON.stringify(rows)}`)
      const r = await fetch('/api/inventario/import-stock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'confirmar', sucursalId: sucId, fecha, archivo: fileName, hash: h, mapeo, items, guardarMapeo: !configStock, nombreMapeo: 'Mapeo SIFACO' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Error')
      if (j.yaProcesado) { toast.message('Este archivo ya fue importado antes.'); }
      else toast.success(`Importado: ${j.ventas} u. vendidas, ${j.sinMatch} sin match.`)
      setConfirmado(j); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error al confirmar') } finally { setBusy(false) }
  }

  const kpis = useMemo(() => {
    if (!items) return null
    return {
      productos: items.length,
      ventas: items.filter((i) => i.interpretado_como === 'venta' || i.interpretado_como === 'discrepancia').reduce((a, i) => a + Math.abs(i.diferencia), 0),
      sinMatch: items.filter((i) => i.interpretado_como === 'no_encontrado').length,
      discrepancias: items.filter((i) => i.interpretado_como === 'discrepancia').length,
    }
  }, [items])

  function exportar() {
    if (!items) return
    exportExcel(`import-stock-${fecha}`, items.map((i) => ({
      SKU: i.sku ?? '', EAN: i.ean ?? '', Producto: i.nombre_match ?? i.nombre_origen ?? '',
      Ayer: i.stock_anterior ?? '', Hoy: i.stock_nuevo, Diferencia: i.diferencia, Interpretado: i.interpretado_como,
    })), { sheet: 'Import' })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal</Label>
          <Select value={sucId} onValueChange={setSucId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Sucursal" /></SelectTrigger>
            <SelectContent>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.codigo ? `${s.codigo} · ` : ''}{s.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fecha</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      <label className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50', fileName && 'border-primary/40 bg-nora-bg')}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}>
        {fileName ? (<><FileSpreadsheet className="size-7 text-primary" /><div className="text-sm font-medium">{fileName}</div><div className="text-xs text-muted-foreground">{rows.length} filas · {headers.length} columnas · click para cambiar</div></>)
          : (<><Upload className="size-7 text-muted-foreground" /><div className="text-sm font-medium">Arrastrá el Excel/CSV de stock o hacé click</div><div className="text-xs text-muted-foreground">Un archivo por sucursal</div></>)}
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </label>

      {headers.length > 0 && !items && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold">Mapeo de columnas</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS.map((c) => (
                <div key={c.key} className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}{c.req && <span className="text-destructive"> *</span>}</Label>
                  <Select value={mapeo[c.key] ?? NONE} onValueChange={(v) => setMapeo((m) => ({ ...m, [c.key]: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>— sin mapear —</SelectItem>{headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </section>
          <Button onClick={analizar} disabled={busy} size="lg">{busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Analizar {rows.length} filas</Button>
        </>
      )}

      {items && kpis && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Productos" value={kpis.productos} />
            <Kpi label="Ventas detectadas (u.)" value={kpis.ventas} tone="ok" />
            <Kpi label="Sin match" value={kpis.sinMatch} tone={kpis.sinMatch > 0 ? 'warn' : undefined} />
            <Kpi label="Discrepancias" value={kpis.discrepancias} tone={kpis.discrepancias > 0 ? 'bad' : undefined} />
          </div>

          <div className="flex flex-wrap gap-2">
            {!confirmado ? (
              <Button onClick={confirmar} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Confirmar y registrar ventas</Button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Registrado</span>
            )}
            <Button variant="outline" onClick={exportar}><Download className="size-4" /> Exportar Excel</Button>
            <Button variant="ghost" onClick={() => { setItems(null); setConfirmado(null) }}>Volver</Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Ayer</th><th className="px-3 py-2 text-right">Hoy</th><th className="px-3 py-2">Interpretado</th></tr>
              </thead>
              <tbody>
                {items.slice(0, 300).map((i) => (
                  <tr key={i.fila} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{i.sku ?? '—'}</td>
                    <td className="px-3 py-1.5">{i.nombre_match ?? <span className="text-muted-foreground">{i.nombre_origen ?? '—'}</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.stock_anterior ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.stock_nuevo}</td>
                    <td className="px-3 py-1.5"><InterpBadge item={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', c)}>{value.toLocaleString('es-AR')}</div>
    </div>
  )
}

function InterpBadge({ item }: { item: ItemAnalizado }) {
  const t = item.interpretado_como
  if (t === 'venta') return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">{Math.abs(item.diferencia)} ventas</span>
  if (t === 'ingreso') return <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-600 dark:text-sky-400">+{item.diferencia} ingreso</span>
  if (t === 'discrepancia') return <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-600 dark:text-rose-400"><AlertTriangle className="size-3" />declaró {item.cantidad_vendida_declarada} faltan {Math.abs(item.diferencia) - (item.cantidad_vendida_declarada ?? 0)}</span>
  if (t === 'no_encontrado') return <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">sin match</span>
  return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">sin cambio</span>
}
