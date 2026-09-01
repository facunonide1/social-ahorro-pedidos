'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Download, Loader2, AlertTriangle } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TODOS = '__todos__'

const ROTACION_LABEL: Record<string, string> = {
  ya_se_vende_solo: 'Ya se vende solo',
  intermedio: 'Intermedio',
  dormido: 'Dormido',
}
const ROTACION_QUE_SIGNIFICA: Record<string, string> = {
  ya_se_vende_solo: 'margen regalado: se vendería igual sin el descuento',
  intermedio: 'ni una cosa ni la otra',
  dormido: 'para esto sirve una oferta',
}
const VIGENCIA_LABEL: Record<string, string> = {
  sin_fecha: 'Sin fecha de fin',
  vigente: 'Vigente',
  vence_pronto: 'Vence pronto',
  vencida: 'Vencida',
  futura: 'Todavía no arrancó',
}

export function OfertasSifacoClient({
  grupos, vigencias, ultimaImportacion,
}: {
  grupos: any[]
  vigencias: any[]
  ultimaImportacion: { archivo_nombre: string; fecha_archivo: string | null; cargado_at: string } | null
}) {
  const sb = useMemo(() => createClient(), [])
  const [q, setQ] = useState('')
  const [vigencia, setVigencia] = useState(TODOS)
  const [rotacion, setRotacion] = useState(TODOS)
  const [publicable, setPublicable] = useState(TODOS)
  const [orden, setOrden] = useState('margen')
  const [filas, setFilas] = useState<any[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    const t = setTimeout(async () => {
      // La búsqueda va EN LA BASE: no se traen las 16.383 filas al navegador.
      const { data, error } = await sb.rpc('ofertas_buscar', {
        p_q: q || null,
        p_vigencia: vigencia === TODOS ? null : vigencia,
        p_rotacion: rotacion === TODOS ? null : rotacion,
        p_publicable: publicable === TODOS ? null : publicable === 'si',
        p_orden: orden,
        p_limite: 100,
      })
      if (!vivo) return
      if (!error && data) {
        setFilas((data as any).filas ?? [])
        setTotal(Number((data as any).total ?? 0))
      }
      setCargando(false)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [sb, q, vigencia, rotacion, publicable, orden])

  const totalEntregado = grupos.reduce((a, g) => a + Number(g.margen_entregado_mes ?? 0), 0)
  const regalado = grupos.find((g) => g.rotacion === 'ya_se_vende_solo')

  return (
    <div className="space-y-4">
      {/* ── LO PRIMERO QUE SE VE ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="text-sm">
          Se entregan <b>{formatARS(totalEntregado)} de margen por mes</b> en descuentos. De eso,{' '}
          <b className="text-amber-700 dark:text-amber-400">
            {formatARS(Number(regalado?.margen_entregado_mes ?? 0))}
          </b>{' '}
          van a {Number(regalado?.ofertas ?? 0).toLocaleString('es-AR')} productos que{' '}
          <b>ya se venden solos</b> — se venderían igual sin el descuento.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {['ya_se_vende_solo', 'intermedio', 'dormido'].map((r) => {
          const g = grupos.find((x) => x.rotacion === r)
          return (
            <div key={r} className="rounded-lg border p-3">
              <div className="text-sm font-semibold">{ROTACION_LABEL[r]}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatARS(Number(g?.margen_entregado_mes ?? 0))}
                <span className="ml-1 text-xs font-normal text-muted-foreground">por mes</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {Number(g?.ofertas ?? 0).toLocaleString('es-AR')} ofertas ·{' '}
                {Number(g?.publicables ?? 0).toLocaleString('es-AR')} publicables
              </div>
              <div className="mt-1 text-xs italic text-muted-foreground">{ROTACION_QUE_SIGNIFICA[r]}</div>
            </div>
          )
        })}
      </div>

      {vigencias.some((v) => v.vigencia === 'sin_fecha') && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <b>
              {Number(vigencias.find((v) => v.vigencia === 'sin_fecha')?.ofertas ?? 0).toLocaleString('es-AR')}{' '}
              descuentos no tienen fecha de fin
            </b>{' '}
            —{Number(vigencias.find((v) => v.vigencia === 'sin_fecha')?.escritas_2070 ?? 0)} de ellos vencen el
            1/1/2070, que es «nunca» escrito de la única forma que el sistema permitía—. Un descuento
            permanente no es una oferta: es el precio.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Buscar y filtrar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-8"
            placeholder="Buscar por nombre, SKU o código de barras…" />
        </div>
        <Filtro value={vigencia} onChange={setVigencia} ph="Vigencia"
          ops={Object.entries(VIGENCIA_LABEL).map(([v, l]) => ({ v, l }))} />
        <Filtro value={rotacion} onChange={setRotacion} ph="Rotación"
          ops={Object.entries(ROTACION_LABEL).map(([v, l]) => ({ v, l }))} />
        <Filtro value={publicable} onChange={setPublicable} ph="Publicable"
          ops={[{ v: 'si', l: 'Publicable' }, { v: 'no', l: 'No publicable' }]} />
        <Filtro value={orden} onChange={setOrden} ph="Ordenar" conTodos={false}
          ops={[{ v: 'margen', l: 'Margen entregado' }, { v: 'venta', l: 'Más vendidos' },
                { v: 'descuento', l: 'Mayor descuento' }, { v: 'stock', l: 'Más stock' }]} />
        <Button variant="outline" size="sm" disabled={!filas.length}
          onClick={() => exportExcel('ofertas-sifaco', filas.map(filaExport))}>
          <Download className="size-4" /> Exportar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {cargando ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> buscando…</span> : (
          <>
            {filas.length.toLocaleString('es-AR')} de {(total ?? 0).toLocaleString('es-AR')} ofertas
            {(total ?? 0) > filas.length && ' — afiná la búsqueda para ver el resto'}
            {ultimaImportacion?.fecha_archivo && (
              <> · datos del archivo de SIFACO del{' '}
                <b>{new Date(ultimaImportacion.fecha_archivo + 'T00:00:00').toLocaleDateString('es-AR')}</b></>
            )}
          </>
        )}
      </div>

      <div className="space-y-2">
        {filas.map((o) => (
          <div key={o.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{o.codigo}</span>
              <span className="font-medium">{o.producto ?? o.descrip}</span>
              <Badge variant="secondary" className="font-normal">
                -{o.valor}{o.tip_sifaco === '$' ? ' pesos' : '%'}
                {o.forma && o.forma !== 'directo' && ` · ${o.forma.replace('_', ' ')}`}
              </Badge>
              {o.es_controlado && (
                <Badge variant="outline" className="border-rose-500/40 text-[10px] text-rose-600 dark:text-rose-400">
                  {o.lista_controlado ?? 'controlado'}
                </Badge>
              )}
              {o.problemas > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                  {o.problemas} problema{o.problemas > 1 ? 's' : ''}
                </Badge>
              )}
              {Number(o.margen_entregado_mes) > 0 && (
                <span className="ml-auto text-sm font-semibold tabular-nums">
                  {formatARS(Number(o.margen_entregado_mes))}<span className="text-xs font-normal text-muted-foreground">/mes</span>
                </span>
              )}
            </div>
            <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <span>Lista {o.precio_lista != null ? formatARS(Number(o.precio_lista)) : '—'} → <b className="text-foreground">{o.precio_con_descuento != null ? formatARS(Number(o.precio_con_descuento)) : 'no se puede calcular'}</b></span>
              <span>Costo {o.costo ? formatARS(Number(o.costo)) : 'sin cargar'}{o.margen_pct != null && ` · margen ${o.margen_pct}%`}</span>
              <span>Stock {Number(o.stock ?? 0).toLocaleString('es-AR')} · vende {o.vende_mes}/mes</span>
              <span>{VIGENCIA_LABEL[o.vigencia]} · {ROTACION_LABEL[o.rotacion]}</span>
            </div>
            {!o.publicable && (
              <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                No publicable: {o.por_que_no_publicable}
              </div>
            )}
          </div>
        ))}
        {!cargando && !filas.length && (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Ninguna oferta con esos filtros.
          </div>
        )}
      </div>
    </div>
  )
}

/** Regla de oro 6: con SKU y código de barras. */
function filaExport(o: any) {
  return {
    SKU: o.codigo,
    'Código de barras': o.barras ?? '',
    Producto: o.producto ?? o.descrip,
    Laboratorio: o.laboratorio ?? '',
    Descuento: o.valor,
    Forma: o.forma ?? 'sin declarar',
    'Descuento efectivo %': o.descuento_efectivo_pct ?? 'no se puede calcular',
    'Precio lista': o.precio_lista ?? '',
    'Precio con descuento': o.precio_con_descuento ?? '',
    Costo: o.costo ?? '',
    'Margen %': o.margen_pct ?? '',
    Stock: o.stock ?? 0,
    'Vende por mes': o.vende_mes,
    'Margen entregado por mes': o.margen_entregado_mes,
    Vigencia: VIGENCIA_LABEL[o.vigencia] ?? o.vigencia,
    Rotación: ROTACION_LABEL[o.rotacion] ?? o.rotacion,
    Publicable: o.publicable ? 'Sí' : `No — ${o.por_que_no_publicable}`,
    'Condición de venta': o.condicion_venta ?? '',
    Controlado: o.es_controlado ? (o.lista_controlado ?? 'Sí') : '',
  }
}

function Filtro({ value, onChange, ph, ops, conTodos = true }: {
  value: string; onChange: (v: string) => void; ph: string
  ops: { v: string; l: string }[]; conTodos?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[170px] text-xs"><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>
        {conTodos && <SelectItem value={TODOS}>{ph}: todas</SelectItem>}
        {ops.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
