'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Check, UserX, Repeat, Truck } from 'lucide-react'
import { toast } from 'sonner'

import { encolar } from '@/lib/mostrador/offline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Suc = { id: string; nombre: string }
type Prod = { producto_id: string; nombre: string; sku: string } | null

/**
 * D.1 · UN TOQUE.
 *
 * El texto ya viene escrito de la búsqueda. Lo único que falta es qué pasó, y
 * eso son tres botones grandes.
 *
 * ── POR QUÉ LOS TRES Y NO DOS ───────────────────────────────────────────────
 *
 * «Se fue» y «se llevó otra cosa» son dos hechos distintos y hoy los dos se
 * veían igual: como una venta perdida. Si se llevó otra cosa, la venta no se
 * perdió — cambió de producto, y eso cambia qué hay que comprar.
 *
 * El tercero —«le ofrecí traerlo»— cierra el circuito con el bloque C.
 */

const DESENLACES = [
  {
    clave: 'se_fue', titulo: 'Se fue', icono: UserX,
    que_es: 'No se le pudo ofrecer nada. Esta es la venta que se perdió de verdad.',
  },
  {
    clave: 'se_llevo_otra', titulo: 'Se llevó otra cosa', icono: Repeat,
    que_es: 'Le ofreciste un equivalente y lo aceptó. La venta no se perdió: cambió de producto.',
  },
  {
    clave: 'se_le_ofrecio_traer', titulo: 'Le ofrecí traerlo', icono: Truck,
    que_es: 'Quedó un pedido o una transferencia.',
  },
] as const

export function FaltanteClient({ textoInicial, producto, sucursales, miSucursal }: {
  textoInicial: string; producto: Prod; sucursales: Suc[]; miSucursal: string | null
}) {
  const [texto, setTexto] = useState(textoInicial || producto?.nombre || '')
  const [sucursal, setSucursal] = useState(miSucursal ?? sucursales[0]?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [hecho, setHecho] = useState<any>(null)

  async function registrar(desenlace: string) {
    if (!texto.trim() && !producto) { toast.error('Falta qué pidieron.'); return }
    setBusy(desenlace)

    const cuerpo = {
      texto: texto.trim(), producto_id: producto?.producto_id ?? null,
      sucursal_id: sucursal, desenlace,
    }

    // F.5 · Sin conexión se encola. Es lo único que se puede registrar sin
    // servidor sin prometerle nada a nadie: si se perdiera, se perdería un
    // dato; si se perdiera un pedido, se perdería un cliente.
    if (!navigator.onLine) {
      try {
        await encolar({ tipo: 'faltante', cuerpo })
        setHecho({
          se_matcheo: !!producto,
          que_significa:
            'Quedó guardado en el dispositivo. Se va a mandar solo cuando vuelva internet: ' +
            'no hace falta acordarse.',
        })
      } catch {
        toast.error('No se pudo guardar en el dispositivo.')
      } finally { setBusy(null) }
      return
    }

    try {
      const r = await fetch('/api/mostrador/faltante', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo registrar.')
      setHecho(j)
    } catch (e: any) {
      // Se cayó la red en el medio: se encola en vez de perderlo.
      try {
        await encolar({ tipo: 'faltante', cuerpo })
        setHecho({
          se_matcheo: !!producto,
          que_significa:
            'No se pudo mandar ahora, así que quedó guardado en el dispositivo y se va a ' +
            'sincronizar solo. No se perdió.',
        })
      } catch {
        toast.error(e?.message ?? 'Falló.')
      }
    } finally { setBusy(null) }
  }

  if (hecho) {
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Registrado.</p>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {hecho.que_significa}
              </p>
            </div>
          </div>
          {!hecho.se_matcheo && (
            <p className="border-l-2 border-foreground/40 pl-3 text-xs leading-snug text-muted-foreground">
              Esto no está en el catálogo, así que se guardó el texto tal cual lo escribiste. Es la
              información que más sirve: dice qué marcas no se trabajan y la gente igual pide.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button size="lg" variant="outline" className="h-12"
              onClick={() => { setHecho(null); setTexto('') }}>
              Registrar otro
            </Button>
            <Button size="lg" className="h-12" asChild>
              <Link href="/mostrador">Volver</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b p-3">
        <Button size="icon" variant="ghost" asChild className="size-10 shrink-0">
          <Link href="/mostrador" aria-label="Volver"><ArrowLeft className="size-5" /></Link>
        </Button>
        <div className="font-medium">Me lo pidieron y no había</div>
      </header>

      <div className="space-y-5 p-3">
        <section className="space-y-2">
          {producto ? (
            <div className="rounded-lg border p-3">
              <div className="font-medium leading-tight">{producto.nombre}</div>
              <div className="text-xs text-muted-foreground">{producto.sku}</div>
              <Badge variant="outline" className="mt-1 text-[10px]">está en el catálogo</Badge>
            </div>
          ) : (
            <>
              <Input className="h-14 text-base" value={texto} autoFocus
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Qué pidieron, como te lo dijeron" />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Escribilo como te lo dijeron, aunque no sea el nombre exacto. Si no está en el
                catálogo, el texto tal cual es justo lo que sirve.
              </p>
            </>
          )}

          {!miSucursal && sucursales.length > 1 && (
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
              className="h-12 w-full rounded border bg-background px-2 text-base">
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">¿Qué pasó?</h2>
          {DESENLACES.map((d) => {
            const Icono = d.icono
            return (
              <button key={d.clave} disabled={!!busy} onClick={() => registrar(d.clave)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/40 disabled:opacity-50">
                {busy === d.clave
                  ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" />
                  : <Icono className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.titulo}</div>
                  <div className="text-xs leading-snug text-muted-foreground">{d.que_es}</div>
                </div>
              </button>
            )
          })}
        </section>

        <p className="border-l-2 border-foreground/60 bg-muted/30 p-3 text-xs leading-snug text-muted-foreground">
          Se guarda <b>qué producto pidieron</b>, en qué sucursal, a qué hora y qué pasó. Nada de
          quién lo pidió ni para qué: eso no entra al sistema y no hay dónde ponerlo.
        </p>
      </div>
    </div>
  )
}
