'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileSignature, Loader2, PenLine, X } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { Lote, LoteItem } from '@/lib/canales/lectura'

/**
 * A.4 · LOS LOTES, CON SU FIRMA.
 *
 * ── LAS TRES COSAS QUE ESTA PANTALLA NO HACE ────────────────────────────────
 *
 * 1. **No publica.** NORA no tiene credenciales de escritura en PedidosYa ni
 *    en WooCommerce. El lote firmado se exporta a .xlsx con el SKU (regla de
 *    oro 6) y lo carga una persona en el portal de la plataforma.
 * 2. **No firma sola.** Ni por tope de monto, ni por nivel de agente, ni
 *    porque el lote sea chico. La firma es de una persona, siempre.
 * 3. **No borra lo que se saca.** Un renglón sacado del lote queda con
 *    `sacado = true` y su motivo: así se puede ver qué se decidió no hacer,
 *    que es la mitad de la decisión.
 */
export function LotesClient({ lotes, items }: {
  lotes: Lote[] | null
  items: Record<string, LoteItem[]>
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<Lote | null>(null)
  const [sacar, setSacar] = useState<Set<string>>(new Set())
  const [firmando, setFirmando] = useState(false)

  async function firmar() {
    if (!abierto) return
    setFirmando(true)
    try {
      const r = await fetch('/api/canales/lote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'firmar', lote: abierto.id, sacar: [...sacar] }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo firmar.')
      toast.success('Lote firmado', {
        description: j.que_pasa_ahora ?? 'Ahora se exporta y lo carga una persona en la plataforma.',
        duration: 12_000,
      })
      setAbierto(null); setSacar(new Set())
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setFirmando(false) }
  }

  function exportar(l: Lote) {
    const fs = (items[l.id] ?? []).filter((i) => !i.sacado)
    if (!fs.length) { toast.error('El lote no tiene renglones para exportar.'); return }
    exportExcel(`lote-${l.accion}-${l.canal_id}`, fs.map((i) => ({
      SKU: i.sku ?? '',
      Producto: i.nombre,
      'Precio sugerido': i.precio_sugerido ?? '',
      'Plata en juego': i.plata ?? '',
      'Por qué': i.por_que ?? '',
    })))
  }

  if (lotes === null) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
        <b>No se pudieron leer los lotes.</b> No es que no haya: la consulta falló.
      </p>
    )
  }

  if (!lotes.length) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
        <b>No hay ningún lote armado.</b> Este cero es de verdad: se miró y no hay. Los lotes se
        arman marcando productos y poniendo el motivo, desde las pantallas que listan qué conviene
        publicar y qué conviene bajar.
      </p>
    )
  }

  const deLote = abierto ? (items[abierto.id] ?? []) : []
  const quedan = deLote.filter((i) => !i.sacado && !sacar.has(i.producto_id))
  const plataQueQueda = quedan.reduce((a, i) => a + Number(i.plata ?? 0), 0)

  return (
    <>
      <div className="divide-y rounded-lg border">
        {lotes.map((l) => {
          const fs = items[l.id] ?? []
          const activos = fs.filter((i) => !i.sacado)
          const sacados = fs.filter((i) => i.sacado)
          const firmado = !!l.firmado_at

          return (
            <div key={l.id} className="space-y-2 px-3 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={l.accion === 'despublicar' ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {l.accion}
                </Badge>
                <span className="font-medium">{l.canal_id}</span>
                <span className="tabular-nums">
                  {activos.length.toLocaleString('es-AR')} productos
                </span>
                {l.plata_estimada !== null && (
                  <span className="font-semibold tabular-nums">
                    {formatARS(l.plata_estimada, 0)}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px]">{l.estado}</Badge>
                {!!sacados.length && (
                  <span className="text-muted-foreground">
                    {sacados.length} sacados y guardados con su motivo
                  </span>
                )}
              </div>

              {l.motivo && <p className="leading-snug">{l.motivo}</p>}

              {l.como_se_calculo && (
                <p className="leading-snug text-muted-foreground">{l.como_se_calculo}</p>
              )}

              <p className="text-[11px] text-muted-foreground">
                Armado{' '}
                {new Date(l.armado_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                {firmado ? (
                  <>
                    {' '}· <b>firmado</b>{' '}
                    {new Date(l.firmado_at!).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </>
                ) : (
                  <> · sin firmar: todavía no se puede cargar en la plataforma</>
                )}
              </p>

              <div className="flex flex-wrap gap-2 pt-0.5">
                {!firmado ? (
                  <Button
                    size="sm" className="h-7 text-xs"
                    onClick={() => { setAbierto(l); setSacar(new Set()) }}
                  >
                    <PenLine className="mr-1 size-3" />
                    Revisar y firmar
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => exportar(l)}
                  >
                    <Download className="mr-1 size-3" />
                    Exportar .xlsx con SKU
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── LA FIRMA ─────────────────────────────────────────────────── */}
      <Dialog open={!!abierto} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="size-4" />
              Firmar el lote de {abierto?.accion}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug">
              Queda con tu nombre y la fecha. <b>Firmar no publica nada:</b> después se exporta a
              .xlsx y lo carga una persona en el portal de la plataforma. Lo que saques acá no se
              borra — queda registrado con su motivo.
            </DialogDescription>
          </DialogHeader>

          {abierto && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 rounded border bg-muted/40 p-2.5 text-xs">
                <span>
                  quedan <b className="tabular-nums">{quedan.length.toLocaleString('es-AR')}</b> de{' '}
                  {deLote.filter((i) => !i.sacado).length.toLocaleString('es-AR')}
                </span>
                <span>
                  plata <b className="tabular-nums">{formatARS(plataQueQueda, 0)}</b>
                </span>
                {!!sacar.size && (
                  <span className="text-muted-foreground">
                    {sacar.size} marcados para sacar
                  </span>
                )}
              </div>

              <div className="divide-y rounded border">
                {deLote.filter((i) => !i.sacado).slice(0, 400).map((i) => {
                  const fuera = sacar.has(i.producto_id)
                  return (
                    <div
                      key={i.producto_id}
                      className={`flex items-start gap-2 px-2.5 py-2 text-xs ${fuera ? 'opacity-40' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSacar((s) => {
                            const n = new Set(s)
                            n.has(i.producto_id) ? n.delete(i.producto_id) : n.add(i.producto_id)
                            return n
                          })
                        }
                        className="mt-0.5 shrink-0 rounded border p-0.5 hover:bg-muted"
                        title={fuera ? 'Volver a incluirlo' : 'Sacarlo del lote'}
                      >
                        <X className="size-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {i.sku ?? 'sin SKU'}
                          </span>{' '}
                          {i.nombre}
                        </p>
                        {i.por_que && (
                          <p className="leading-snug text-muted-foreground">{i.por_que}</p>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {i.plata === null ? '—' : formatARS(i.plata, 0)}
                      </span>
                    </div>
                  )
                })}
                {deLote.filter((i) => !i.sacado).length > 400 && (
                  <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    Se muestran los 400 de más plata de{' '}
                    {deLote.filter((i) => !i.sacado).length.toLocaleString('es-AR')}. Los demás
                    entran en la firma igual: <b>firmar es firmar el lote entero</b>, no la página
                    visible.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAbierto(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={firmar} disabled={firmando || !quedan.length}>
                  {firmando && <Loader2 className="mr-1 size-3 animate-spin" />}
                  Firmar {quedan.length.toLocaleString('es-AR')} renglones
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
