'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Sparkles, Check, Download, X } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { EnCola, SinPoder, Resumen } from '@/lib/descripciones/lectura'

export function DescripcionesClient({ enCola, noSePuede, resumen, canales }: {
  enCola: EnCola[] | null
  noSePuede: SinPoder[] | null
  resumen: Resumen | null
  canales: { id: string; nombre: string }[] | null
}) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [lote, setLote] = useState<string | null>(null)
  const [sacadas, setSacadas] = useState<Set<string>>(new Set())

  const propuestas = (enCola ?? []).filter((p) => p.estado === 'propuesta')
  const sinDescribir = (enCola ?? []).filter((p) => p.estado === 'sin_describir')

  async function generar() {
    setGenerando(true)
    try {
      const r = await fetch('/api/descripciones/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuantas: 20 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo generar.')
      setLote(j.lote); setSacadas(new Set())
      toast.success(`${j.generadas} propuestas`, { description: j.que_paso, duration: 9000 })
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.', { duration: 10000 })
    } finally { setGenerando(false) }
  }

  async function confirmar() {
    if (!lote) return
    setConfirmando(true)
    try {
      const r = await fetch('/api/descripciones/aprobar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lote, sacar: [...sacadas] }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo confirmar.')
      toast.success(`${j.aprobadas} aprobadas`, { description: j.que_paso, duration: 10000 })
      setLote(null); setSacadas(new Set())
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setConfirmando(false) }
  }

  if (enCola === null) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-sm leading-snug">
          <b>No se pudo leer la cola.</b> Esto no significa que no haya nada para describir:
          significa que la consulta falló y no se sabe.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── DÓNDE ESTAMOS ──────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-card p-4">
        {resumen === null ? (
          <p className="text-sm text-muted-foreground">No se pudo contar cuántas faltan.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {resumen.aprobadas.toLocaleString('es-AR')}
              </span>
              <span className="text-sm text-muted-foreground">
                aprobadas de {resumen.productos_publicados.toLocaleString('es-AR')} productos publicados
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (resumen.aprobadas / Math.max(resumen.productos_publicados, 1)) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              Faltan <b>{resumen.sin_describir.toLocaleString('es-AR')}</b>.
              {resumen.propuestas > 0 && <> Hay <b>{resumen.propuestas}</b> esperando confirmación.</>}
              {resumen.no_se_pueden > 0 && <> <b>{resumen.no_se_pueden}</b> no se pudieron describir.</>}
              {resumen.rechazadas > 0 && <> <b>{resumen.rechazadas}</b> quedaron rechazadas.</>}
              {resumen.sin_cruzar_con_el_catalogo > 0 && (
                <> Y <b>{resumen.sin_cruzar_con_el_catalogo}</b> publicaciones no cruzan con ningún
                  producto del catálogo, así que no se pueden describir desde acá.</>
              )}
            </p>
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5" disabled={generando || !sinDescribir.length}
            onClick={generar}>
            {generando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Generar 20 propuestas
          </Button>
          {(canales ?? []).map((c) => (
            <Button key={c.id} size="sm" variant="outline" className="gap-1.5" asChild>
              <a href={`/api/descripciones/exportar?canal=${encodeURIComponent(c.id)}`}>
                <Download className="size-3.5" /> Exportar {c.nombre}
              </a>
            </Button>
          ))}
        </div>

        <p className="mt-3 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
          <b>La descripción dice qué es el producto, no para qué sirve.</b> Eso vale igual en
          perfumería: «hidrata la piel» está prohibido lo mismo que «alivia el dolor», porque una
          regla con excepciones no se cumple. La base revisa cada una antes de aprobarla y no se
          puede saltear.
        </p>
      </section>

      {/* ── F.2 · EL LOTE, PARA LEER Y CONFIRMAR ───────────────────────── */}
      {!!propuestas.length && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">
              {propuestas.length} propuestas para confirmar
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              Se leen y se confirman juntas. Lo que esté mal, se saca del lote con la cruz: nada
              sale al canal sin pasar por acá.
            </p>
          </div>

          <ul className="space-y-2">
            {propuestas.map((p) => {
              const fuera = sacadas.has(p.producto_id)
              return (
                <li key={p.producto_id}
                  className={`rounded-lg border p-3 ${fuera ? 'opacity-40' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{p.nombre_canal}</span>
                        {p.sku && <code className="text-[10px] text-muted-foreground">{p.sku}</code>}
                        {Number(p.unidades_3m) > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {Math.round(Number(p.unidades_3m))} en 3 meses
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-snug">{p.texto}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        En SIFACO: <code>{p.nombre_sifaco}</code>
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8 shrink-0"
                      onClick={() => setSacadas((s) => {
                        const n = new Set(s)
                        fuera ? n.delete(p.producto_id) : n.add(p.producto_id)
                        return n
                      })}>
                      {fuera ? <Check className="size-4" /> : <X className="size-4" />}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          <Button size="lg" className="w-full gap-1.5" disabled={confirmando || !lote}
            onClick={confirmar}>
            {confirmando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirmar {propuestas.length - sacadas.size} descripciones
            {sacadas.size > 0 && ` (${sacadas.size} afuera)`}
          </Button>
          {!lote && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Estas propuestas son de una generación anterior. Generá un lote nuevo para poder
              confirmarlas: el lote es lo que une lo que se leyó con lo que se aprueba.
            </p>
          )}
        </section>
      )}

      {/* ── F.4 · LO QUE NO SE PUDO DESCRIBIR ──────────────────────────── */}
      {noSePuede === null ? (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">
            No se pudo leer qué quedó sin describir.
          </AlertDescription>
        </Alert>
      ) : !!noSePuede.length && (
        <section className="rounded-lg border border-dashed bg-muted/30 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {noSePuede.length} que no se pudieron describir
          </h2>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Quedan sin descripción a propósito. Inventar qué es un producto cuyo nombre está
            cortado a 30 caracteres es peor que dejarlo vacío.
          </p>
          <ul className="mt-2 space-y-1.5">
            {noSePuede.slice(0, 30).map((p) => (
              <li key={p.producto_id} className="text-xs leading-snug">
                <b>{p.nombre_canal ?? p.nombre_sifaco}</b>
                {p.por_que_no && <span className="text-muted-foreground"> — {p.por_que_no}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── F.3 · LA COLA ──────────────────────────────────────────────── */}
      {!!sinDescribir.length && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Los próximos de la cola</h2>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            Por lo que más se vende. El pedido decía «los más vistos» y no hay registro de vistas
            en el canal: un producto muy visto que no se vende sería el que más necesita una
            descripción, y eso todavía no se puede distinguir.
          </p>
          <ul className="mt-2 divide-y">
            {sinDescribir.slice(0, 15).map((p) => (
              <li key={p.producto_id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs">
                <span className="font-medium">{p.nombre_canal}</span>
                <code className="text-[10px] text-muted-foreground">{p.nombre_sifaco}</code>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {Number(p.unidades_3m) > 0
                    ? `${Math.round(Number(p.unidades_3m))} unidades`
                    : p.plata_parada ? `${formatARS(p.plata_parada)} parados` : 'sin venta ni stock'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
