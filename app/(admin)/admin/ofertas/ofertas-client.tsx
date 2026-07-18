'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Download, Search, Tag, Check, X, Send, Trash2, Upload, ChevronDown, ChevronRight, CalendarClock, Square, TimerReset } from 'lucide-react'
import { toast } from 'sonner'

import { exportExcel, exportCsv } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export type ProdLite = { id: string; sku: string | null; nombre: string; precio: number; costo: number; codigo_barras?: string | null }
export type CampLite = { id: string; nombre: string; estado: string }
export type SucLite = { id: string; nombre: string }
export type OfertaRow = {
  id: string; codigo: string | null; nombre: string; tipo: string; valor: number | null; nProductos: number
  rubro: string | null; canales: string[]; vigenciaTipo: string; fechaInicio: string | null; fechaFin: string | null
  origen: string; estado: string; propuestaPor: string; publicadaCuponera: boolean; etiqueta?: string | null
}
export type Prefill = { producto: ProdLite; desc: number | null } | null
const ETIQUETA_LABEL: Record<string, string> = { vendio: 'Vendió', regalo_margen: 'Regaló margen', neutra: 'Neutra' }
const ETIQUETA_VARIANT: Record<string, any> = { vendio: 'success', regalo_margen: 'destructive', neutra: 'outline' }

export const TIPO_LABEL: Record<string, string> = {
  porcentaje_descuento: '% descuento', precio_fijo: 'Precio fijo', '2x1': '2x1', nxm: 'NxM', combo: 'Combo',
  segunda_unidad_pct: '2ª unidad %', descuento_por_cantidad: 'Por cantidad', combo_dinamico: 'Combo dinámico', oferta_cruzada: 'Cruzada',
}
const ORIGEN_LABEL: Record<string, string> = { oferta_drogueria: 'Droguería', liquidacion_propia: 'Liquidación', campania_fecha: 'Campaña' }
const ESTADO_VARIANT: Record<string, any> = { borrador: 'outline', pendiente_aprobacion: 'warning', aprobada: 'info', activa: 'success', pausada: 'warning', finalizada: 'outline', rechazada: 'destructive' }
const TABS = [['activas', 'Activas'], ['programadas', 'Programadas'], ['borradores', 'Borradores'], ['pendientes', 'Pendientes'], ['finalizadas', 'Finalizadas']] as const

/** ¿La oferta vence en las próximas 48hs? */
function porVencer(o: OfertaRow): boolean {
  if (!['activa', 'aprobada'].includes(o.estado) || o.vigenciaTipo !== 'con_fecha' || !o.fechaFin) return false
  const fin = new Date(`${o.fechaFin}T23:59:59-03:00`).getTime()
  const ahora = Date.now()
  return fin >= ahora && fin - ahora <= 48 * 3600 * 1000
}

export function OfertasClient({ ofertas, rol, productos, campanias, sucursales, prefill }: { ofertas: OfertaRow[]; rol: string; productos: ProdLite[]; campanias: CampLite[]; sucursales: SucLite[]; prefill?: Prefill }) {
  const router = useRouter()
  const [tab, setTab] = useState<string>('activas')
  const [q, setQ] = useState('')
  const [crear, setCrear] = useState(!!prefill)
  const aprobador = ['super_admin', 'gerente'].includes(rol)
  const gestor = ['super_admin', 'gerente', 'administrativo'].includes(rol)

  const filtered = useMemo(() => ofertas.filter((o) => {
    const t = tab === 'activas' ? o.estado === 'activa'
      : tab === 'programadas' ? o.estado === 'aprobada'
      : tab === 'borradores' ? o.estado === 'borrador' || o.estado === 'rechazada'
      : tab === 'pendientes' ? o.estado === 'pendiente_aprobacion'
      : o.estado === 'finalizada'
    if (!t) return false
    if (q.trim() && !`${o.nombre} ${o.codigo ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  }), [ofertas, tab, q])

  async function accion(body: any, ok: string) {
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(ok); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  async function exportarSifaco(o: OfertaRow) {
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'export_aplicacion', id: o.id }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      if (!j.filas?.length) { toast.error('La oferta no tiene productos con precio.'); return }
      const filas = j.filas.map((f: any) => ({ SKU: f.sku, EAN: f.ean, Producto: f.producto, Precio: f.precio, Desde: f.fecha_inicio, Hasta: f.fecha_fin, Oferta: f.oferta }))
      exportExcel(j.nombre, filas); exportCsv(j.nombre, filas)
      toast.success('Export SIFACO generado (.xlsx + .csv).')
    } catch (e: any) { toast.error(e?.message ?? 'Error') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 border-b border-border">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn('border-b-2 px-3 py-2 text-sm font-medium transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>)}
        </div>
        <div className="ml-auto flex gap-2">
          {gestor && <Button asChild variant="outline" size="sm"><Link href="/admin/ofertas/importar"><Upload className="size-4" /> Importar</Link></Button>}
          <Button variant="outline" size="sm" onClick={() => exportExcel('ofertas', filtered.map((o) => ({ Codigo: o.codigo, Nombre: o.nombre, Tipo: TIPO_LABEL[o.tipo] ?? o.tipo, Productos: o.nProductos, Rubro: o.rubro, Canales: o.canales.join('+'), Origen: ORIGEN_LABEL[o.origen] ?? o.origen, Estado: o.estado })))}><Download className="size-4" /> Excel</Button>
          {gestor && <Button size="sm" onClick={() => setCrear(true)}><Plus className="size-4" /> Crear oferta</Button>}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-9 pl-8" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <Tag className="size-7 text-muted-foreground" /><div className="text-sm text-muted-foreground">Sin ofertas en esta vista.</div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => {
            const pv = porVencer(o)
            return (
            <div key={o.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/ofertas/${o.id}`} className="font-medium hover:underline">{o.nombre}</Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={ESTADO_VARIANT[o.estado] ?? 'outline'} className="font-normal">{o.estado.replace(/_/g, ' ')}</Badge>
                  {pv && <Badge variant="warning" className="font-normal"><CalendarClock className="mr-1 size-3" />por vencer</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="secondary" className="font-normal">{TIPO_LABEL[o.tipo] ?? o.tipo}{o.valor != null ? ` ${o.valor}` : ''}</Badge>
                <Badge variant="outline" className="font-normal">{ORIGEN_LABEL[o.origen] ?? o.origen}</Badge>
                {o.propuestaPor === 'nora' && <Badge variant="info" className="font-normal">NORA</Badge>}
                {o.publicadaCuponera && <Badge variant="success" className="font-normal">cuponera</Badge>}
                {o.estado === 'finalizada' && o.etiqueta && <Badge variant={ETIQUETA_VARIANT[o.etiqueta] ?? 'outline'} className="font-normal">{ETIQUETA_LABEL[o.etiqueta] ?? o.etiqueta}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{o.nProductos} producto(s) · {o.canales.join(', ') || 'sin canal'} · {o.vigenciaTipo === 'con_fecha' ? `${o.fechaInicio ?? '?'}→${o.fechaFin ?? '?'}` : o.vigenciaTipo}</div>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {gestor && (o.estado === 'borrador' || o.estado === 'rechazada') && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => accion({ accion: 'enviar_aprobacion', id: o.id }, 'Enviada a aprobación.')}><Send className="size-3.5" /> A aprobación</Button>}
                {aprobador && o.estado === 'pendiente_aprobacion' && <>
                  <Button size="sm" className="h-7 text-xs" onClick={() => accion({ accion: 'aprobar', id: o.id }, 'Aprobada — tareas y avisos disparados.')}><Check className="size-3.5" /> Aprobar</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600" onClick={() => { const m = prompt('Motivo del rechazo:'); if (m != null) accion({ accion: 'rechazar', id: o.id, motivo: m }, 'Rechazada.') }}><X className="size-3.5" /></Button>
                </>}
                {gestor && ['activa', 'aprobada'].includes(o.estado) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportarSifaco(o)}><Download className="size-3.5" /> SIFACO</Button>}
                {gestor && pv && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const d = prompt('Extender hasta (aaaa-mm-dd):', o.fechaFin ?? ''); if (d) accion({ accion: 'extender', id: o.id, fecha_fin: d }, 'Extendida — vuelve a aprobación.') }}><TimerReset className="size-3.5" /> Extender</Button>}
                {gestor && ['activa', 'aprobada', 'pausada'].includes(o.estado) && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { if (confirm('¿Finalizar la oferta? Dispara descartelado, despublicación y reversión SIFACO.')) accion({ accion: 'finalizar', id: o.id }, 'Finalizada — ciclo de cierre disparado.') }}><Square className="size-3.5" /> {pv ? 'Dejar vencer' : 'Finalizar'}</Button>}
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link href={`/admin/ofertas/${o.id}`}>Ver</Link></Button>
              </div>
            </div>
          )})}
        </div>
      )}

      {crear && <CrearOferta productos={productos} campanias={campanias} sucursales={sucursales} prefill={prefill ?? null} onClose={() => setCrear(false)} />}
    </div>
  )
}

function CrearOferta({ productos, campanias, sucursales, prefill, onClose }: { productos: ProdLite[]; campanias: CampLite[]; sucursales: SucLite[]; prefill: Prefill; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: prefill ? `Liquidación ${prefill.producto.nombre}` : '', tipo: 'porcentaje_descuento', valor: prefill?.desc != null ? String(prefill.desc) : '', nx: '', ny: '', rubro: 'farmacia', vigencia_tipo: 'con_fecha', fecha_inicio: '', fecha_fin: '', campania_id: '', limite_por_cliente: '', b2b: false, destacar_mostrador: false })
  const [canales, setCanales] = useState<string[]>(['cartel', 'cuponera'])
  const [sel, setSel] = useState<ProdLite[]>(prefill ? [prefill.producto] : [])
  const [sucSel, setSucSel] = useState<string[]>(sucursales.map((s) => s.id))
  const [precios, setPrecios] = useState<Record<string, string>>({})
  const [verPrecios, setVerPrecios] = useState(false)
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<ProdLite[]>([])
  const [buscando, setBuscando] = useState(false)
  const [busy, setBusy] = useState(false)
  const [altaBusy, setAltaBusy] = useState(false)
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }
  function toggleCanal(c: string) { setCanales((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]) }
  function toggleSuc(id: string) { setSucSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) }

  const debRef = useRef<any>(null)
  useEffect(() => {
    const t = q.trim()
    if (debRef.current) clearTimeout(debRef.current)
    if (t.length < 2) { setMatches([]); setBuscando(false); return }
    setBuscando(true)
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ofertas/buscar-producto?q=${encodeURIComponent(t)}`)
        const j = await r.json()
        const ids = new Set(sel.map((s) => s.id))
        setMatches((Array.isArray(j) ? j : []).filter((p: any) => !ids.has(p.id)).map((p: any) => ({ id: p.id, sku: p.sku, nombre: p.nombre, codigo_barras: p.codigo_barras, precio: Number(p.precio_sugerido ?? 0), costo: 0 })))
      } catch { setMatches([]) } finally { setBuscando(false) }
    }, 250)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [q, sel])

  async function altaProducto(nombre: string) {
    setAltaBusy(true)
    try {
      const sku = prompt(`SKU (CODIGO SIFACO) de «${nombre}» — opcional:`) ?? ''
      const ean = prompt('Código de barras (EAN) — opcional:') ?? ''
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'alta_producto', nombre, sku: sku.trim() || null, ean: ean.trim() || null }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      setSel((s) => [...s, { id: j.producto.id, sku: j.producto.sku, nombre: j.producto.nombre, precio: 0, costo: 0 }])
      setQ(''); toast.success(`«${j.producto.nombre}» dado de alta y agregado.`)
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo dar de alta.') } finally { setAltaBusy(false) }
  }

  async function submit() {
    if (!f.nombre.trim()) { toast.error('Poné un nombre.'); return }
    if (!sel.length) { toast.error('Agregá al menos un producto.'); return }
    if (!sucSel.length) { toast.error('Elegí al menos una sucursal.'); return }
    setBusy(true)
    try {
      const items = sel.map((s) => ({ producto_id: s.id, precio_oferta: precios[s.id] ? Number(precios[s.id]) : null }))
      const r = await fetch('/api/ofertas', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accion: 'crear', nombre: f.nombre, tipo: f.tipo, valor: f.valor ? Number(f.valor) : null,
          nx: f.nx ? Number(f.nx) : null, ny: f.ny ? Number(f.ny) : null,
          productos_ids: sel.map((s) => s.id), items, sucursales_ids: sucSel, rubro: f.rubro, canales, vigencia_tipo: f.vigencia_tipo,
          fecha_inicio: f.vigencia_tipo === 'con_fecha' ? (f.fecha_inicio || null) : null, fecha_fin: f.vigencia_tipo === 'con_fecha' ? (f.fecha_fin || null) : null,
          campania_id: f.campania_id || null, origen: 'liquidacion_propia', propuesta_por: 'usuario',
          origen_ref: prefill ? { motivo: 'por_vencer', desde: 'vencimientos' } : null,
          limite_por_cliente: f.limite_por_cliente ? Number(f.limite_por_cliente) : null, b2b: f.b2b, destacar_mostrador: f.destacar_mostrador,
        }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Oferta ${j.codigo} creada (borrador).`)
      if (Array.isArray(j.conflictos) && j.conflictos.length) {
        toast.warning(`Ojo: se solapa con ${j.conflictos.length} oferta(s): ${j.conflictos.map((c: any) => c.nombre).slice(0, 3).join(', ')}. Revisá el calendario.`, { duration: 8000 })
      }
      onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  const necesitaValor = ['porcentaje_descuento', 'precio_fijo', 'segunda_unidad_pct'].includes(f.tipo)
  const necesitaNxM = f.tipo === 'nxm'
  const todasSuc = sucSel.length === sucursales.length

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Crear oferta</SheetTitle></SheetHeader>
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Nombre *"><Input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. 2x1 en protección solar" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo"><Select value={f.tipo} onValueChange={(v) => set('tipo', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIPO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Rubro"><Select value={f.rubro} onValueChange={(v) => set('rubro', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['farmacia', 'perfumeria', 'supermercado'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          {necesitaValor && <Field label={f.tipo === 'precio_fijo' ? 'Precio fijo' : '% / valor'}><Input type="number" value={f.valor} onChange={(e) => set('valor', e.target.value)} /></Field>}
          {necesitaNxM && <div className="grid grid-cols-2 gap-3"><Field label="Lleva (N)"><Input type="number" value={f.nx} onChange={(e) => set('nx', e.target.value)} /></Field><Field label="Paga (M)"><Input type="number" value={f.ny} onChange={(e) => set('ny', e.target.value)} /></Field></div>}

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Productos</Label>
            {sel.map((p) => <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm"><span className="min-w-0"><span className="truncate">{p.nombre}</span> <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>{p.precio > 0 && <span className="ml-1 text-[10px] text-muted-foreground">· actual ${p.precio.toLocaleString('es-AR')}</span>}</span><Button size="sm" variant="ghost" className="h-6 px-2 text-rose-600" onClick={() => setSel((s) => s.filter((x) => x.id !== p.id))}><Trash2 className="size-3.5" /></Button></div>)}
            <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU, nombre o código de barras…" className="pl-8" /></div>
            {q.trim().length >= 2 && (
              <div className="rounded-md border border-border">
                {buscando && <div className="px-3 py-1.5 text-xs text-muted-foreground">Buscando…</div>}
                {!buscando && matches.length === 0 && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <span>Sin coincidencias para "{q.trim()}".</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={altaBusy} onClick={() => altaProducto(q.trim())}><Plus className="size-3.5" /> Dar de alta «{q.trim()}»</Button>
                  </div>
                )}
                {matches.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setSel((s) => [...s, m]); setQ('') }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent">
                    <span className="min-w-0 truncate">{m.nombre}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                      {m.codigo_barras && <span className="font-mono">EAN {m.codigo_barras}</span>}
                      <span className="font-mono">{m.sku}</span>
                      {m.precio > 0 && <span>${m.precio.toLocaleString('es-AR')}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {sel.length > 0 && (
              <button type="button" onClick={() => setVerPrecios((v) => !v)} className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground hover:text-foreground">
                {verPrecios ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Precio por producto (opcional)
              </button>
            )}
            {verPrecios && sel.map((p) => (
              <div key={p.id} className="flex items-center gap-2 pl-4 text-sm">
                <span className="min-w-0 flex-1 truncate text-xs">{p.nombre}</span>
                <Input type="number" value={precios[p.id] ?? ''} onChange={(e) => setPrecios((pr) => ({ ...pr, [p.id]: e.target.value }))} placeholder="precio oferta" className="h-8 w-32" />
              </div>
            ))}
          </div>

          <Field label="Sucursales participantes">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSucSel(todasSuc ? [] : sucursales.map((s) => s.id))} className={cn('rounded-full border px-3 py-1 text-xs', todasSuc ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>Todas</button>
              {sucursales.map((s) => (
                <button key={s.id} type="button" onClick={() => toggleSuc(s.id)} className={cn('rounded-full border px-3 py-1 text-xs', sucSel.includes(s.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{s.nombre}</button>
              ))}
            </div>
          </Field>

          <Field label="Canales">
            <div className="flex flex-wrap gap-2">
              {[['cartel', 'Cartel local'], ['cuponera', 'Cuponera'], ['web', 'Web/redes']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => toggleCanal(v)} className={cn('rounded-full border px-3 py-1 text-xs', canales.includes(v) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{l}</button>
              ))}
            </div>
          </Field>

          <Field label="Vigencia"><Select value={f.vigencia_tipo} onValueChange={(v) => set('vigencia_tipo', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['con_fecha', 'Con fecha'], ['permanente', 'Permanente'], ['hasta_agotar', 'Hasta agotar stock']].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
          {f.vigencia_tipo === 'con_fecha' && <div className="grid grid-cols-2 gap-3"><Field label="Desde"><Input type="date" value={f.fecha_inicio} onChange={(e) => set('fecha_inicio', e.target.value)} /></Field><Field label="Hasta"><Input type="date" value={f.fecha_fin} onChange={(e) => set('fecha_fin', e.target.value)} /></Field></div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Campaña (opcional)"><Select value={f.campania_id || '__none__'} onValueChange={(v) => set('campania_id', v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Sin campaña" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sin campaña</SelectItem>{campanias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Límite por cliente"><Input type="number" value={f.limite_por_cliente} onChange={(e) => set('limite_por_cliente', e.target.value)} placeholder="opcional" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.b2b} onChange={(e) => set('b2b', e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> Variante B2B (mayorista)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.destacar_mostrador} onChange={(e) => set('destacar_mostrador', e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" /> ⭐ Destacar en el mostrador matinal</label>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-1">{busy ? 'Creando…' : 'Crear borrador'}</Button>
          <p className="text-[11px] text-muted-foreground">Se crea como borrador. Al aprobarse se disparan tareas en las sucursales participantes, se publica a los canales y se avisa al equipo.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
}
