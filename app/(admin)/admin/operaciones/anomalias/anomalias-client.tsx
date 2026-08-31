'use client'

import { useMemo, useState } from 'react'
import { Download, Search, AlertTriangle, RotateCcw } from 'lucide-react'

import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TODOS = '__todos__'

const TITULO: Record<string, string> = {
  descuento_imposible: 'Descuento imposible',
  oferta_bajo_costo: 'Oferta bajo costo',
  precio_lista_bajo_costo: 'Precio de lista bajo costo',
  producto_duplicado: 'Producto duplicado',
  sin_costo_cargado: 'Sin costo cargado',
  descuento_sin_vencimiento: 'Descuento sin vencimiento',
}

/**
 * QUÉ PASA Y QUÉ HACER, en castellano y con los números.
 *
 * No «error de validación»: «con -60% queda en $360 y cuesta $906, vendiendo
 * 254 por mes». Una fila que no dice qué hacer obliga a que alguien abra SIFACO
 * y lo deduzca, y eso es exactamente lo que este sistema vino a sacar.
 */
function explicar(tipo: string, e: any): string {
  const n = (v: any) => (v === null || v === undefined ? null : Number(v))
  switch (tipo) {
    case 'descuento_imposible':
      return `El descuento de ${e.descuento}${e.forma === '$' ? ' pesos' : '%'} sobre un precio de ${formatARS(n(e.precio_lista) ?? 0)} deja el precio en ${formatARS(n(e.precio_con_descuento) ?? 0)}. ${e.que_pasa ?? ''} Hay ${n(e.stock) ?? 0} unidades.`
    case 'oferta_bajo_costo':
      return `Con -${e.descuento}${e.forma === '$' ? ' pesos' : '%'} queda en ${formatARS(n(e.precio_con_descuento) ?? 0)} y cuesta ${formatARS(n(e.costo) ?? 0)}, vendiendo ${e.vende_mes} por mes. Se pierden ${formatARS(n(e.pierde_por_unidad) ?? 0)} en cada uno.`
    case 'precio_lista_bajo_costo':
      return `El precio de lista es ${formatARS(n(e.precio) ?? 0)} y el costo ${formatARS(n(e.costo) ?? 0)}: pierde ${formatARS(n(e.pierde_por_unidad) ?? 0)} por unidad sin descuento de por medio, vendiendo ${e.vende_mes} por mes.`
    case 'producto_duplicado':
      return e.rol === 'el que se queda'
        ? `Hay ${e.versiones} versiones con este mismo nombre. Ésta es la que más vendió (${e.este_vendio} en los meses cerrados): es la que se queda.`
        : `Hay ${e.versiones} versiones con este mismo nombre y ésta no es la que más vendió (${e.este_vendio}). Tiene ${n(e.stock) ?? 0} unidades por ${formatARS((n(e.stock) ?? 0) * (n(e.precio) ?? 0))} paradas.${e.ambiguo ? ' OJO: las dos versiones venden y las dos tienen stock — esto lo decide una persona.' : ''}`
    case 'sin_costo_cargado':
      return `Tiene ${n(e.stock) ?? 0} unidades a ${formatARS(n(e.precio) ?? 0)} y ${e.caso === 'costo igual al precio' ? 'el costo está cargado igual al precio, que es lo mismo que no tenerlo' : 'no tiene costo cargado'}. Sin costo no hay margen, y sin margen cualquier decisión de oferta es a ciegas.`
    case 'descuento_sin_vencimiento':
      return `Tiene ${e.descuento}${e.forma === '$' ? ' pesos' : '%'} de descuento ${e.caso}. Un descuento permanente no es una oferta: es el precio.`
    default:
      return JSON.stringify(e)
  }
}

function queHacer(tipo: string, e: any): string {
  if (e?.que_hacer) return String(e.que_hacer)
  if (tipo === 'producto_duplicado') {
    return e.rol === 'el que se queda' ? 'Nada: es la versión buena.' : 'Dar de baja esta versión EN SIFACO, después de mover el stock.'
  }
  if (tipo === 'sin_costo_cargado') return 'Cargar el costo EN SIFACO.'
  if (tipo === 'precio_lista_bajo_costo') return 'Revisar el precio o el costo EN SIFACO.'
  return 'Corregirlo en SIFACO.'
}

export function AnomaliasClient({
  filas, porTipo, total, abiertas, truncado, mostrados, huboImportacion,
}: {
  filas: any[]
  porTipo: any[]
  total: number
  abiertas: number
  truncado: boolean
  mostrados: number
  huboImportacion: boolean
}) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState(TODOS)

  const vista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return filas.filter((f) => {
      if (tipo !== TODOS && f.tipo !== tipo) return false
      if (!t) return true
      const e = f.evidencia ?? {}
      return `${e.sku ?? ''} ${e.nombre ?? ''}`.toLowerCase().includes(t)
    })
  }, [filas, q, tipo])

  // D.5 · Un vacío honesto: cero porque no se importó nada NO es cero porque
  // está todo bien, y son dos pantallas distintas.
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed py-14 text-center">
        <div className="text-base font-semibold">
          {huboImportacion ? 'No hay anomalías abiertas' : 'Todavía no se importó ningún archivo de SIFACO'}
        </div>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {huboImportacion
            ? 'Las seis reglas corrieron sobre la última importación y no encontraron nada.'
            : 'Esto no quiere decir que esté todo bien: quiere decir que no hay nada contra qué mirar. Importá el maestro y el archivo de ofertas desde Operaciones → Maestro de SIFACO.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {porTipo.map((t) => (
          <div key={t.tipo} className="rounded-lg border p-3">
            <div className="text-sm font-medium">{TITULO[t.tipo] ?? t.tipo}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {Number(t.abiertas ?? 0).toLocaleString('es-AR')}
              {Number(t.reaparecieron ?? 0) > 0 && (
                <span className="ml-2 text-xs font-normal text-rose-600 dark:text-rose-400">
                  +{t.reaparecieron} reaparecieron
                </span>
              )}
            </div>
            {Number(t.plata_abierta ?? 0) > 0 && (
              <div className="text-xs text-muted-foreground">{formatARS(Number(t.plata_abierta))} en juego</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU o nombre…" className="h-9 pl-8" />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-[230px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los tipos</SelectItem>
            {porTipo.map((t) => <SelectItem key={t.tipo} value={t.tipo}>{TITULO[t.tipo] ?? t.tipo}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* Regla de oro 6: con SKU. Y con lo que hace falta para trabajarlo. */}
        <Button variant="outline" size="sm" disabled={!vista.length}
          onClick={() => exportExcel('anomalias-sifaco', vista.map((f) => ({
            Tipo: TITULO[f.tipo] ?? f.tipo,
            SKU: f.evidencia?.sku ?? '',
            Producto: f.evidencia?.nombre ?? '',
            'Plata en juego': Math.round(Number(f.plata_en_juego ?? 0)),
            'Qué pasa': explicar(f.tipo, f.evidencia ?? {}),
            'Qué hacer': queHacer(f.tipo, f.evidencia ?? {}),
            Estado: f.estado,
            'Veces que reapareció': f.veces_reaparecio ?? 0,
          })))}>
          <Download className="size-4" /> Exportar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {vista.length.toLocaleString('es-AR')} de {mostrados.toLocaleString('es-AR')} ·{' '}
        {abiertas.toLocaleString('es-AR')} abiertas de {total.toLocaleString('es-AR')} en total
        {truncado && (
          <span className="text-amber-600 dark:text-amber-400">
            {' '}— la pantalla trae las primeras {mostrados.toLocaleString('es-AR')} por plata en juego. Usá el buscador.
          </span>
        )}
      </div>

      <div className="space-y-2">
        {vista.slice(0, 400).map((f) => {
          const e = f.evidencia ?? {}
          return (
            <div key={f.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">{TITULO[f.tipo] ?? f.tipo}</Badge>
                {f.estado === 'reaparecio' && (
                  <Badge variant="outline" className="gap-1 border-rose-500/40 text-rose-600 dark:text-rose-400">
                    <RotateCcw className="size-3" /> reapareció {f.veces_reaparecio > 1 ? `${f.veces_reaparecio} veces` : ''}
                  </Badge>
                )}
                {e.ambiguo && (
                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3" /> lo decide una persona
                  </Badge>
                )}
                <span className="font-mono text-xs text-muted-foreground">{e.sku}</span>
                <span className="font-medium">{e.nombre}</span>
                {Number(f.plata_en_juego) > 0 && (
                  <span className="ml-auto tabular-nums text-sm font-semibold">{formatARS(Number(f.plata_en_juego))}</span>
                )}
              </div>
              <p className="mt-1.5 text-sm">{explicar(f.tipo, e)}</p>
              <p className="mt-1 text-xs text-muted-foreground"><b>Qué hacer:</b> {queHacer(f.tipo, e)}</p>
            </div>
          )
        })}
      </div>

      {vista.length > 400 && (
        <Alert>
          <AlertDescription>
            Se muestran las primeras 400 de {vista.length.toLocaleString('es-AR')}, ordenadas por plata en
            juego. Exportá para verlas todas.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
