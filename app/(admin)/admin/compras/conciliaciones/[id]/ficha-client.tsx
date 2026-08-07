'use client'

import Link from 'next/link'
import { AlertTriangle, Camera, Check, Download, FileText, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { exportExcel } from '@/lib/utils/export-excel'
import { formatARS } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { FilaConciliacion, ResultadoConciliacion } from '@/lib/documentos/conciliar'

type OrdenLite = { id: string; codigo: string | null; total: number; fecha: string }
type DocLite = { id: string; rol: string; numero: string; fecha: string | null; total: number }
type ReclamoLite = { id: string; estado: string; motivo: string; monto: number | null }

const TIPO_LABEL: Record<string, string> = {
  cantidad_faltante: 'Faltante',
  facturado_de_mas: 'Facturado de más',
  precio_distinto: 'Precio distinto',
}

export function FichaConciliacion({
  conciliacionId,
  estado,
  resumen,
  filas,
  totales,
  falta,
  ordenes,
  documentos,
  reclamos,
  motivoCierre,
  nota,
}: {
  conciliacionId: string
  estado: ResultadoConciliacion['estado'] | string
  resumen: string
  filas: FilaConciliacion[]
  totales: ResultadoConciliacion['totales']
  falta: string[]
  ordenes: OrdenLite[]
  documentos: DocLite[]
  reclamos: ReclamoLite[]
  motivoCierre: string | null
  nota: string | null
}) {
  const conDiferencia = filas.filter((f) => f.diferencias.length || f.noComparable)
  const cuadran = filas.length - conDiferencia.length

  return (
    <div className="space-y-4">
      {/* El resumen en palabras: quien abre esto tiene que poder decidir si
          vale la pena reclamar sin abrir los tres papeles. */}
      <div
        className={cn(
          'rounded-lg px-4 py-3 text-sm',
          estado === 'con_diferencias'
            ? 'border border-amber-500/30 bg-amber-500/5'
            : estado === 'conciliada'
              ? 'border border-emerald-500/30 bg-emerald-500/5'
              : 'border border-border bg-muted/40',
        )}
      >
        <div className="flex items-start gap-2">
          {estado === 'con_diferencias' ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : estado === 'conciliada' ? (
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <p className="flex-1">{resumen}</p>
        </div>
        {(motivoCierre || nota) && (
          <p className="mt-2 border-t border-current/15 pt-2 text-xs text-muted-foreground">
            {motivoCierre ?? nota}
          </p>
        )}
      </div>

      {/* Los tres papeles */}
      <div className="grid gap-3 md:grid-cols-3">
        <Papeles titulo="Orden de compra" icono={<Package className="size-4" />} vacio="Compra directa: sin orden.">
          {ordenes.map((o) => (
            <Link key={o.id} href={`/admin/compras/ordenes`} className="block hover:underline">
              <span className="font-mono text-xs">{o.codigo ?? 'sin código'}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{o.fecha} · {formatARS(o.total)}</span>
            </Link>
          ))}
        </Papeles>

        <Papeles titulo="Remitos" icono={<FileText className="size-4" />} vacio="Sin remito cargado.">
          {documentos.filter((d) => d.rol === 'remito').map((d) => (
            <Link key={d.id} href={`/admin/finanzas/documentos/${d.id}`} className="block hover:underline">
              <span className="font-mono text-xs">{d.numero}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{d.fecha}</span>
              <Camera className="ml-1 inline size-3 text-primary" />
            </Link>
          ))}
        </Papeles>

        <Papeles titulo="Facturas" icono={<FileText className="size-4" />} vacio="Sin factura cargada.">
          {documentos.filter((d) => d.rol === 'factura' || d.rol === 'nota_credito').map((d) => (
            <Link key={d.id} href={`/admin/finanzas/documentos/${d.id}`} className="block hover:underline">
              <span className="font-mono text-xs">{d.numero}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{d.fecha} · {formatARS(d.total)}</span>
              {d.rol === 'nota_credito' && <Badge variant="secondary" className="ml-1 font-normal">NC</Badge>}
              <Camera className="ml-1 inline size-3 text-primary" />
            </Link>
          ))}
        </Papeles>
      </div>

      {!!reclamos.length && (
        <div className="rounded-lg border border-border px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reclamos abiertos</div>
          <div className="mt-2 space-y-1 text-sm">
            {reclamos.map((r) => (
              <Link key={r.id} href={`/admin/compras/devoluciones/${r.id}`} className="flex items-center gap-2 hover:underline">
                <Badge variant="outline" className="font-normal">{r.estado.replace(/_/g, ' ')}</Badge>
                <span className="text-muted-foreground">{r.motivo.replace(/_/g, ' ')}</span>
                {r.monto != null && <span className="ml-auto font-mono tabular-nums">{formatARS(r.monto)}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tabla línea por línea */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {filas.length} producto{filas.length === 1 ? '' : 's'}
          </span>
          {cuadran > 0 && <span className="text-[11px] text-muted-foreground">{cuadran} cuadran</span>}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            disabled={!filas.length}
            onClick={() => exportExcel(`conciliacion-${conciliacionId.slice(0, 8)}`, filas.map((f) => ({
              SKU: f.sku,
              Producto: f.nombre,
              Pedido: f.pedido ?? '',
              Recibido: f.recibido ?? '',
              Facturado: f.facturado ?? '',
              'Neto pactado': f.netoPactado ?? '',
              'Neto facturado': f.netoFacturado ?? '',
              Diferencias: f.diferencias.map((d) => `${TIPO_LABEL[d.tipo]}: ${d.monto}`).join(' · '),
              'No comparable': f.noComparable ? 'sí' : '',
            })))}
          >
            <Download className="size-3.5" /> Excel
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-normal">SKU</th>
              <th className="px-3 py-2 font-normal">Producto</th>
              <th className="px-3 py-2 text-right font-normal">Pedido</th>
              <th className="px-3 py-2 text-right font-normal">Recibido</th>
              <th className="px-3 py-2 text-right font-normal">Facturado</th>
              <th className="px-3 py-2 text-right font-normal">Neto pactado</th>
              <th className="px-3 py-2 text-right font-normal">Neto facturado</th>
              <th className="px-3 py-2 font-normal">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const tiene = f.diferencias.length > 0 || f.noComparable
              return (
                <tr key={f.itemId} className={cn('border-t border-border', tiene ? 'bg-amber-500/5' : 'text-muted-foreground')}>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    <Link href={`/admin/compras/costos/${f.itemId}`} className="hover:underline">{f.sku}</Link>
                  </td>
                  <td className="px-3 py-1.5">{f.nombre}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.pedido ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.recibido ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.facturado ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{f.netoPactado != null ? formatARS(f.netoPactado) : '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{f.netoFacturado != null ? formatARS(f.netoFacturado) : '—'}</td>
                  <td className="px-3 py-1.5">
                    {f.noComparable ? (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        no comparable · falta cuántas unidades trae «{f.unidadDocumento}»
                      </span>
                    ) : f.diferencias.length ? (
                      <div className="space-y-0.5">
                        {f.diferencias.map((d, i) => (
                          <div key={i} className="text-[11px]">
                            <span className="rounded-full bg-muted px-1.5 py-0.5">{TIPO_LABEL[d.tipo]}</span>
                            <span className="ml-1.5 font-mono tabular-nums">{formatARS(d.monto)}</span>
                            {d.pct != null && <span className="ml-1 text-muted-foreground">({d.pct > 0 ? '+' : ''}{d.pct}%)</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px]">cuadra</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {totales.total !== 0 && (
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5 text-xs">
            {totales.cantidadFaltante !== 0 && <span>Faltante: <b className="tabular-nums">{formatARS(totales.cantidadFaltante)}</b></span>}
            {totales.facturadoDeMas !== 0 && <span>Facturado de más: <b className="tabular-nums">{formatARS(totales.facturadoDeMas)}</b></span>}
            {totales.precioDistinto !== 0 && <span>Precio: <b className="tabular-nums">{formatARS(totales.precioDistinto)}</b></span>}
            <span className="ml-auto font-medium">Total: <b className="tabular-nums">{formatARS(totales.total)}</b></span>
          </div>
        )}
      </div>
    </div>
  )
}

function Papeles({
  titulo,
  icono,
  vacio,
  children,
}: {
  titulo: string
  icono: React.ReactNode
  vacio: string
  children: React.ReactNode
}) {
  const hay = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icono} {titulo}
      </div>
      <div className="mt-2 space-y-1">
        {hay ? children : <p className="text-xs text-muted-foreground">{vacio}</p>}
      </div>
    </div>
  )
}
