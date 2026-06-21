'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Download, Plus, Trash2, Loader2, Eye, FileDown, Wand2, ArrowUp, ArrowDown, Lock, Clock, X,
} from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel } from '@/lib/utils/export-excel'
import { Icon } from '@/components/icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  FRECUENCIA_LABEL, type AccionExport, type PerfilDatos, type EntidadExport,
  type ColumnaExport, type QueryDefinicion, type FrecuenciaDatos,
} from '@/lib/types/centro-datos'

type Suc = { id: string; nombre: string }

const ENTIDADES: { value: EntidadExport; label: string }[] = [
  { value: 'productos', label: 'Productos (catálogo)' },
  { value: 'ofertas', label: 'Ofertas activas' },
  { value: 'stock', label: 'Stock' },
  { value: 'dif_stock', label: 'Diferencias de stock' },
  { value: 'ventas', label: 'Ventas (últimos 7 días)' },
]

const CAMPOS_POR_ENTIDAD: Record<EntidadExport, { campo: string; header: string }[]> = {
  productos: [{ campo: 'sku', header: 'CODIGO' }, { campo: 'nombre', header: 'DESCRIP' }, { campo: 'precio', header: 'PRECIO' }, { campo: 'rubro', header: 'RUBRO' }, { campo: 'laboratorio', header: 'NOM_LAB' }, { campo: 'estado', header: 'ESTADO' }],
  ofertas: [{ campo: 'sku', header: 'CODIGO' }, { campo: 'nombre', header: 'DESCRIP' }, { campo: 'precio', header: 'PRECIO' }, { campo: 'nom_promo', header: 'NOM_PROMO' }, { campo: 'def_promo', header: 'DEF_PROMO' }, { campo: 'estado', header: 'ESTADO' }],
  stock: [{ campo: 'sku', header: 'CODIGO' }, { campo: 'nombre', header: 'DESCRIP' }, { campo: 'stock', header: 'STOCK' }, { campo: 'rubro', header: 'RUBRO' }],
  dif_stock: [{ campo: 'sku', header: 'CODIGO' }, { campo: 'stock', header: 'STOCK' }],
  ventas: [{ campo: 'sku', header: 'CODIGO' }, { campo: 'nombre', header: 'DESCRIP' }, { campo: 'cantidad', header: 'CANT' }, { campo: 'monto', header: 'IMPORTE' }],
}

function descargarCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function ExportarClient({ acciones, perfilesFormato, sucursales, rubros }: { acciones: AccionExport[]; perfilesFormato: PerfilDatos[]; sucursales: Suc[]; rubros: string[] }) {
  const router = useRouter()
  const [constructor, setConstructor] = useState<AccionExport | 'nueva' | null>(null)
  const [preview, setPreview] = useState<{ accion: AccionExport; filas: any[]; csv: string; filename: string; total: number; formato: string } | null>(null)
  const [cargando, setCargando] = useState<string | null>(null)

  async function previsualizar(a: AccionExport) {
    setCargando(a.id)
    try {
      const r = await fetch('/api/centro-datos/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion_id: a.id, preview: true }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      setPreview({ accion: a, filas: j.filas, csv: j.csv, filename: j.filename, total: j.total, formato: j.formato })
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setCargando(null) }
  }

  async function generar(a: AccionExport) {
    setCargando(a.id)
    try {
      const r = await fetch('/api/centro-datos/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion_id: a.id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      if (j.formato === 'xlsx' || j.formato === 'xls') exportExcel(j.filename.replace(/\.\w+$/, ''), j.filas)
      else descargarCsv(j.csv, j.filename)
      toast.success(`${j.total} filas exportadas`); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setCargando(null); setPreview(null) }
  }

  async function eliminar(a: AccionExport) {
    if (a.es_sistema) { toast.error('No se puede eliminar una acción de sistema'); return }
    if (!confirm(`¿Eliminar la acción "${a.nombre}"?`)) return
    const r = await fetch(`/api/centro-datos/acciones?id=${a.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Acción eliminada'); router.refresh() } else { toast.error('No se pudo eliminar') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{acciones.length} acciones de exportación</div>
        <Button size="sm" onClick={() => setConstructor('nueva')}><Plus className="size-4" /> Nueva acción</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {acciones.map((a) => (
          <div key={a.id} className="group flex flex-col rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="rounded-lg bg-muted/50 p-2 text-primary"><Icon name={a.icono ?? 'Download'} className="size-5" /></div>
              <div className="flex items-center gap-1">
                {a.es_sistema ? <Badge variant="outline" className="text-[10px]">SIFACO</Badge> : (
                  <>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setConstructor(a)}><Wand2 className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => eliminar(a)}><Trash2 className="size-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 font-medium">{a.nombre}</div>
            <div className="mt-1 flex-1 text-sm text-muted-foreground">{a.descripcion}</div>
            {a.frecuencia !== 'manual' && <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" /> {FRECUENCIA_LABEL[a.frecuencia]}</div>}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" disabled={cargando === a.id} onClick={() => previsualizar(a)}>
                {cargando === a.id ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Vista previa
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{preview?.accion.nombre}</DialogTitle></DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{preview.total} filas · formato {preview.formato.toUpperCase()} · {preview.filename}</div>
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left text-xs">
                    <tr>{preview.filas[0] ? Object.keys(preview.filas[0]).map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>) : <th className="px-3 py-2">—</th>}</tr>
                  </thead>
                  <tbody>
                    {preview.filas.slice(0, 50).map((f, i) => (
                      <tr key={i} className="border-t border-border/60">{Object.values(f).map((v, j) => <td key={j} className="px-3 py-1.5">{String(v ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.total === 0 && <div className="text-sm text-amber-600">No hay datos para exportar con estos filtros.</div>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>Cerrar</Button>
                <Button disabled={preview.total === 0 || cargando === preview.accion.id} onClick={() => generar(preview.accion)}>
                  {cargando === preview.accion.id ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Descargar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Constructor */}
      {constructor && (
        <ConstructorSheet
          accion={constructor === 'nueva' ? null : constructor}
          perfilesFormato={perfilesFormato} sucursales={sucursales} rubros={rubros}
          onClose={() => setConstructor(null)}
          onSaved={() => { setConstructor(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function ConstructorSheet({ accion, perfilesFormato, sucursales, rubros, onClose, onSaved }: {
  accion: AccionExport | null; perfilesFormato: PerfilDatos[]; sucursales: Suc[]; rubros: string[]; onClose: () => void; onSaved: () => void
}) {
  const def = accion?.query_definicion
  const [nombre, setNombre] = useState(accion?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(accion?.descripcion ?? '')
  const [entidad, setEntidad] = useState<EntidadExport>(def?.entidad ?? 'productos')
  const [columnas, setColumnas] = useState<ColumnaExport[]>(def?.columnas ?? CAMPOS_POR_ENTIDAD['productos'].slice(0, 3).map((c, i) => ({ ...c, orden: i })))
  const [rubro, setRubro] = useState<string>((def?.filtros?.rubro as string) ?? '')
  const [sucursal, setSucursal] = useState<string>((def?.filtros?.sucursal_id as string) ?? '')
  const [soloActivos, setSoloActivos] = useState<boolean>(def?.filtros?.solo_activos !== false)
  const [sinVentaDias, setSinVentaDias] = useState<string>(def?.filtros?.sin_venta_dias ? String(def.filtros.sin_venta_dias) : '')
  const [perfilFormato, setPerfilFormato] = useState<string>(accion?.perfil_formato_id ?? perfilesFormato[0]?.id ?? '')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaDatos>(accion?.frecuencia ?? 'manual')
  const [guardando, setGuardando] = useState(false)
  const [previewRows, setPreviewRows] = useState<any[] | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const disponibles = useMemo(() => CAMPOS_POR_ENTIDAD[entidad].filter((c) => !columnas.some((x) => x.campo === c.campo)), [entidad, columnas])

  function cambiarEntidad(e: EntidadExport) {
    setEntidad(e)
    setColumnas(CAMPOS_POR_ENTIDAD[e].slice(0, 3).map((c, i) => ({ ...c, orden: i })))
  }
  function addCol(campo: string, header: string) { setColumnas((cs) => [...cs, { campo, header, orden: cs.length }]) }
  function delCol(campo: string) { setColumnas((cs) => cs.filter((c) => c.campo !== campo).map((c, i) => ({ ...c, orden: i }))) }
  function mover(i: number, dir: -1 | 1) {
    setColumnas((cs) => { const a = [...cs]; const j = i + dir; if (j < 0 || j >= a.length) return cs;[a[i], a[j]] = [a[j], a[i]]; return a.map((c, k) => ({ ...c, orden: k })) })
  }
  function setHeader(campo: string, header: string) { setColumnas((cs) => cs.map((c) => c.campo === campo ? { ...c, header } : c)) }

  function definicion(): QueryDefinicion {
    const filtros: QueryDefinicion['filtros'] = { solo_activos: soloActivos }
    if (rubro) filtros!.rubro = rubro
    if (sucursal) filtros!.sucursal_id = sucursal
    if (sinVentaDias) filtros!.sin_venta_dias = Number(sinVentaDias)
    return { entidad, filtros, columnas }
  }

  async function previsualizar() {
    if (!columnas.length) { toast.error('Agregá al menos una columna'); return }
    setPreviewing(true)
    try {
      const perfil = perfilesFormato.find((p) => p.id === perfilFormato)
      const r = await fetch('/api/centro-datos/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ definicion: definicion(), opciones: perfil?.opciones ?? {}, preview: true, nombre: nombre || 'preview' }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      setPreviewRows(j.filas ?? [])
      toast.success(`${j.total} filas`)
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setPreviewing(false) }
  }

  async function guardar() {
    if (!nombre.trim()) { toast.error('Poné un nombre'); return }
    if (!columnas.length) { toast.error('Agregá al menos una columna'); return }
    setGuardando(true)
    try {
      const r = await fetch('/api/centro-datos/acciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: accion?.id, nombre, descripcion, query_definicion: definicion(), perfil_formato_id: perfilFormato || null, frecuencia, icono: 'FileDown' }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success('Acción guardada'); onSaved()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setGuardando(false) }
  }

  const necesitaSucursal = entidad === 'stock' || entidad === 'dif_stock' || entidad === 'ventas'

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{accion ? `Editar: ${accion.nombre}` : 'Constructor de exportación'}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label className="text-xs">Nombre *</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Ofertas de la semana" /></div>
            <div className="sm:col-span-2"><Label className="text-xs">Descripción</Label><Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Qué exportar</Label>
              <Select value={entidad} onValueChange={(v) => cambiarEntidad(v as EntidadExport)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENTIDADES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formato de salida</Label>
              <Select value={perfilFormato} onValueChange={setPerfilFormato}>
                <SelectTrigger><SelectValue placeholder="Formato SIFACO" /></SelectTrigger>
                <SelectContent>{perfilesFormato.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre} ({p.formato.toUpperCase()})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Filtros</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Rubro</Label>
                <Select value={rubro || '__all__'} onValueChange={(v) => setRubro(v === '__all__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent><SelectItem value="__all__">Todos</SelectItem>{rubros.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {necesitaSucursal && (
                <div>
                  <Label className="text-xs">Sucursal {entidad === 'dif_stock' ? '(vacío = consolidado)' : ''}</Label>
                  <Select value={sucursal || '__all__'} onValueChange={(v) => setSucursal(v === '__all__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent><SelectItem value="__all__">{entidad === 'dif_stock' ? 'Consolidado' : 'Todas'}</SelectItem>{sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">Sin venta hace (días)</Label>
                <Input type="number" value={sinVentaDias} onChange={(e) => setSinVentaDias(e.target.value)} placeholder="Ej: 60" />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => setSoloActivos((v) => !v)} className="flex items-center gap-2 text-sm">
                  <span className={`flex size-4 items-center justify-center rounded border ${soloActivos ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{soloActivos && '✓'}</span>
                  Solo activos
                </button>
              </div>
            </div>
          </div>

          {/* Columnas */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between"><div className="text-sm font-medium">Columnas (orden de salida)</div></div>
            <div className="mt-2 space-y-1.5">
              {columnas.map((c, i) => (
                <div key={c.campo} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muted-foreground disabled:opacity-30"><ArrowUp className="size-3" /></button>
                    <button onClick={() => mover(i, 1)} disabled={i === columnas.length - 1} className="text-muted-foreground disabled:opacity-30"><ArrowDown className="size-3" /></button>
                  </div>
                  <Badge variant="secondary" className="font-mono text-[10px]">{c.campo}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Input value={c.header} onChange={(e) => setHeader(c.campo, e.target.value)} className="h-8 flex-1 font-mono text-xs" />
                  <Button variant="ghost" size="icon" className="size-7 text-red-500" onClick={() => delCol(c.campo)}><X className="size-3.5" /></Button>
                </div>
              ))}
            </div>
            {disponibles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {disponibles.map((c) => (
                  <button key={c.campo} onClick={() => addCol(c.campo, c.header)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs hover:border-primary/50 hover:bg-muted/30">
                    <Plus className="size-3" /> {c.header}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Programar (mejora 9) */}
          <div>
            <Label className="text-xs">Programar (con fallback de botón manual)</Label>
            <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as FrecuenciaDatos)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(['manual', 'diaria', 'semanal'] as FrecuenciaDatos[]).map((f) => <SelectItem key={f} value={f}>{FRECUENCIA_LABEL[f]}</SelectItem>)}</SelectContent>
            </Select>
            {frecuencia !== 'manual' && <p className="mt-1 text-[11px] text-muted-foreground">En plan Hobby las exportaciones programadas se generan con el botón manual; con Pro corren por cron.</p>}
          </div>

          {/* Preview inline */}
          {previewRows && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs">{previewRows.length} filas (muestra)</div>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left"><tr>{previewRows[0] ? Object.keys(previewRows[0]).map((h) => <th key={h} className="px-2 py-1">{h}</th>) : <th className="px-2 py-1">sin datos</th>}</tr></thead>
                  <tbody>{previewRows.slice(0, 20).map((f, i) => <tr key={i} className="border-t border-border/60">{Object.values(f).map((v, j) => <td key={j} className="px-2 py-1">{String(v ?? '')}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={previewing} onClick={previsualizar}>{previewing ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Previsualizar</Button>
            <Button disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Guardar acción</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
