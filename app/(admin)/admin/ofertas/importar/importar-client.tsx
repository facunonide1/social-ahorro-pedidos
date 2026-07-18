'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, Check } from 'lucide-react'
import { toast } from 'sonner'

import { parseSpreadsheet } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'

type Fila = { sku?: string; ean?: string; precio?: string; desde?: string; hasta?: string; nombre?: string; nombre_producto?: string }

/** Detecta el índice de columna por palabras clave en el header. */
function idx(headers: string[], claves: string[]): number {
  return headers.findIndex((h) => { const n = h.toLowerCase(); return claves.some((c) => n.includes(c)) })
}

export function ImportarOfertasClient() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[]>([])
  const [archivo, setArchivo] = useState<string>('')
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    try {
      const { headers, rows } = await parseSpreadsheet(file)
      const iSku = idx(headers, ['sku', 'codigo', 'código']), iEan = idx(headers, ['ean', 'barra']), iPrecio = idx(headers, ['precio', 'importe'])
      const iDesde = idx(headers, ['desde', 'inicio', 'vig_desde']), iHasta = idx(headers, ['hasta', 'fin', 'vig_hasta'])
      const iNombre = idx(headers, ['oferta', 'nombre_oferta']), iProd = idx(headers, ['producto', 'descrip', 'detalle'])
      const parsed: Fila[] = rows.map((r) => ({
        sku: iSku >= 0 ? r[iSku] : undefined, ean: iEan >= 0 ? r[iEan] : undefined, precio: iPrecio >= 0 ? r[iPrecio] : undefined,
        desde: iDesde >= 0 ? r[iDesde] : undefined, hasta: iHasta >= 0 ? r[iHasta] : undefined,
        nombre: iNombre >= 0 ? r[iNombre] : undefined, nombre_producto: iProd >= 0 ? r[iProd] : undefined,
      })).filter((f) => f.sku || f.ean || f.nombre_producto)
      if (!parsed.length) { toast.error('No detecté columnas de SKU/EAN. Revisá el archivo.'); return }
      setFilas(parsed); setArchivo(file.name)
      toast.success(`${parsed.length} fila(s) leídas de ${file.name}.`)
    } catch { toast.error('No pude leer el archivo.') }
  }

  async function importar() {
    setBusy(true)
    try {
      const r = await fetch('/api/ofertas/importar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filas }) })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`${j.ofertas_creadas} oferta(s) borrador con ${j.items} ítem(s).${j.sin_match ? ` ${j.sin_match} sin match → cola.` : ''}`, { duration: 7000 })
      router.push('/admin/ofertas')
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center hover:border-primary/50">
        <FileSpreadsheet className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">{archivo || 'Elegí un archivo .xlsx o .csv'}</span>
        <span className="text-xs text-muted-foreground">Columnas: SKU o EAN · precio · desde · hasta · (nombre opcional)</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </label>

      {filas.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">EAN</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Oferta</th></tr></thead>
              <tbody>
                {filas.slice(0, 50).map((f, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{f.sku ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{f.ean ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{f.nombre_producto ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.precio ?? '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{f.desde ?? '?'} → {f.hasta ?? '?'}</td>
                    <td className="px-3 py-1.5 text-xs">{f.nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filas.length > 50 && <p className="text-xs text-muted-foreground">Mostrando 50 de {filas.length}.</p>}
          <Button size="lg" disabled={busy} onClick={importar}><Check className="size-4" /> {busy ? 'Importando…' : `Crear ${filas.length} oferta(s) en borrador`}</Button>
          <p className="text-[11px] text-muted-foreground">Se crean como BORRADOR y pasan por aprobación normal. Nunca se activan directo.</p>
        </>
      )}
    </div>
  )
}
