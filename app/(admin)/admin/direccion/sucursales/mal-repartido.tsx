'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { MalRepartido } from '@/lib/direccion/lectura'

/**
 * D.4 · LO MAL REPARTIDO, CON EL BOTÓN DE TRANSFERIR.
 *
 * ── POR QUÉ SE AGRUPA POR PAR ORIGEN→DESTINO ────────────────────────────────
 *
 * Porque una transferencia es un viaje. Diez renglones de Guzmán a Tesei son
 * un remito; diez renglones hacia cuatro sucursales distintas son cuatro
 * viajes, y marcarlos juntos armaría una transferencia imposible.
 *
 * ── Y POR QUÉ «PREPARAR» Y NO «TRANSFERIR» ──────────────────────────────────
 *
 * La transferencia nace en `pendiente_salida`: no mueve stock todavía. Alguien
 * la tiene que confirmar físicamente en el depósito, con las tres fotos que
 * pide el flujo desde la v0.93. El botón prepara el viaje, no lo hace.
 */
export function MalRepartidoClient({ filas }: { filas: MalRepartido[] | null }) {
  const router = useRouter()
  const [par, setPar] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)

  // Agrupado por par origen→destino: una transferencia es un viaje.
  const pares = useMemo(() => {
    const m = new Map<string, { origen_id: string; origen: string; destino_id: string; destino: string; items: MalRepartido[]; plata: number }>()
    for (const f of filas ?? []) {
      const k = `${f.origen_id}->${f.destino_id}`
      if (!m.has(k)) {
        m.set(k, {
          origen_id: f.origen_id, origen: f.origen,
          destino_id: f.destino_id, destino: f.destino,
          items: [], plata: 0,
        })
      }
      const g = m.get(k)!
      g.items.push(f)
      g.plata += Number(f.plata_que_no_hay_que_gastar ?? 0)
    }
    return [...m.entries()]
      .map(([k, v]) => ({ k, ...v }))
      .sort((a, b) => b.plata - a.plata)
  }, [filas])

  const abierto = pares.find((p) => p.k === par) ?? null

  async function preparar() {
    if (!abierto || !marcados.size) return
    setEnviando(true)
    try {
      const items = abierto.items
        .filter((i) => marcados.has(i.producto_id))
        .map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.transferir) }))

      const r = await fetch('/api/operaciones/transferencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'crear',
          origen: abierto.origen_id, destino: abierto.destino_id,
          items,
          notas:
            `Armada desde la comparación entre sucursales: ${items.length} productos que faltan en ` +
            `${abierto.destino} y sobran en ${abierto.origen}. No haberlos comprado ahorra ` +
            `${formatARS(abierto.items.filter((i) => marcados.has(i.producto_id)).reduce((a, i) => a + Number(i.plata_que_no_hay_que_gastar ?? 0), 0), 0)}.`,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo preparar la transferencia.')
      toast.success('Transferencia preparada', {
        description:
          'Quedó en pendiente de salida: no movió stock. La confirma el depósito con las fotos de siempre.',
        duration: 12_000,
      })
      setPar(null); setMarcados(new Set())
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setEnviando(false) }
  }

  function exportar() {
    if (!filas?.length) return
    exportExcel('mal-repartido', filas.map((f) => ({
      SKU: f.sku ?? '',
      Producto: f.nombre,
      Origen: f.origen,
      'Sobran en el origen': f.sobran_en_origen,
      Destino: f.destino,
      'Faltan en el destino': f.faltan_en_destino,
      Transferir: f.transferir,
      'Plata que no hay que gastar': f.plata_que_no_hay_que_gastar ?? 'no se sabe: sin costo',
      'El origen no lo vende': f.el_origen_no_lo_vende ? 'si' : 'no',
    })))
  }

  if (filas === null) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
        <b>No se pudo leer lo mal repartido.</b> La consulta falló: no significa que esté todo
        bien repartido.
      </p>
    )
  }

  if (!filas.length) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm leading-snug text-muted-foreground">
        <b>No hay nada que convenga mover.</b> Este cero es de verdad: se miró y no hay.
      </p>
    )
  }

  const total = filas[0]
  const sinCosto = filas.filter((f) => f.sin_costo).length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            plata que no hay que gastar
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatARS(total.cuanta_plata_en_total, 0)}
          </p>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          en <b>{total.de_cuantos_es_este.toLocaleString('es-AR')}</b> movimientos posibles entre{' '}
          {pares.length} pares de sucursales. Se muestran los{' '}
          {filas.length.toLocaleString('es-AR')} de más plata.
          {sinCosto > 0 && (
            <>
              {' '}
              <b>{sinCosto}</b> no se pueden valuar porque el producto no tiene costo: van al
              final, y su plata es null y no cero.
            </>
          )}
        </p>
        <Button size="sm" variant="outline" onClick={exportar} className="ml-auto h-7 text-xs">
          <Download className="mr-1 size-3" />
          Exportar .xlsx con SKU
        </Button>
      </div>

      <div className="divide-y rounded-lg border">
        {pares.map((p) => (
          <div key={p.k} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
            <span className="font-medium">
              {p.origen} → {p.destino}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {p.items.length.toLocaleString('es-AR')} productos
            </span>
            <span className="font-semibold tabular-nums">{formatARS(p.plata, 0)}</span>
            <Button
              size="sm" className="ml-auto h-7 text-xs"
              onClick={() => {
                setPar(p.k)
                // Marcados por defecto los que se pueden valuar: los que no
                // tienen costo requieren una decisión aparte.
                setMarcados(new Set(p.items.filter((i) => !i.sin_costo).map((i) => i.producto_id)))
              }}
            >
              <Truck className="mr-1 size-3" />
              Preparar la transferencia
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!abierto} onOpenChange={(o) => !o && setPar(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {abierto?.origen} → {abierto?.destino}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              Queda en <b>pendiente de salida</b>: no mueve stock. La confirma el depósito con las
              tres fotos de siempre. Esto prepara el viaje, no lo hace.
            </DialogDescription>
          </DialogHeader>

          {abierto && (
            <>
              <p className="rounded border bg-muted/40 p-2.5 text-xs tabular-nums">
                {marcados.size} de {abierto.items.length} productos ·{' '}
                <b>
                  {formatARS(
                    abierto.items
                      .filter((i) => marcados.has(i.producto_id))
                      .reduce((a, i) => a + Number(i.plata_que_no_hay_que_gastar ?? 0), 0),
                    0,
                  )}
                </b>{' '}
                que no hay que gastar
              </p>

              <div className="divide-y rounded border">
                {abierto.items.slice(0, 200).map((i) => (
                  <label
                    key={i.producto_id}
                    className="flex cursor-pointer items-start gap-2 px-2.5 py-2 text-xs hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={marcados.has(i.producto_id)}
                      onChange={() =>
                        setMarcados((s) => {
                          const n = new Set(s)
                          n.has(i.producto_id) ? n.delete(i.producto_id) : n.add(i.producto_id)
                          return n
                        })
                      }
                      className="mt-0.5 size-3.5 shrink-0 accent-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {i.sku ?? 'sin SKU'}
                        </span>{' '}
                        {i.nombre}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        mover <b className="tabular-nums">{i.transferir}</b> · faltan{' '}
                        {i.faltan_en_destino} · sobran {i.sobran_en_origen}
                        {i.el_origen_no_lo_vende && ' · el origen no lo vende'}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {i.sin_costo ? (
                        <Badge variant="outline" className="text-[10px]">sin costo</Badge>
                      ) : (
                        formatARS(i.plata_que_no_hay_que_gastar ?? 0, 0)
                      )}
                    </span>
                  </label>
                ))}
                {abierto.items.length > 200 && (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    Se muestran los 200 de más plata de {abierto.items.length}. Los demás no entran
                    en esta transferencia: <b>se marca lo que se ve</b>, no lo que no se vio.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setPar(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={preparar} disabled={enviando || !marcados.size}>
                  {enviando && <Loader2 className="mr-1 size-3 animate-spin" />}
                  Preparar {marcados.size} productos
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
