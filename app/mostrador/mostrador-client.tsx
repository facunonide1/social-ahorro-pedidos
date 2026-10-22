'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ScanLine, Mic, Loader2, AlertTriangle, Info, X } from 'lucide-react'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Suc = { id: string; nombre: string; codigo: string }
type Estado = {
  productos: number; sin_costo: number; con_costo: number
  con_vencimiento: number; con_ventas: number; stock_leido_at: string | null
} | null

export type Fila = {
  producto_id: string
  sku: string
  nombre: string
  nombre_comercial: string | null
  laboratorio: string | null
  presentacion: string | null
  droga_principal: string | null
  precio: number | null
  stock: number
  disponible: number
  requiere_receta: boolean
  condicion_venta: string | null
  marca_pedida: boolean
  en_oferta: boolean
  dias_para_vencer: number | null
  motivos: string[]
  no_se_sabe: string[]
  margen_pct?: number | null
  meses_cobertura?: number | null
}

/**
 * EL MOSTRADOR.
 *
 * ── LA LÍNEA QUE NO SE CRUZA, EN LA PANTALLA ────────────────────────────────
 *
 * Esta pantalla busca PRODUCTOS. Si alguien escribe un síntoma, no va a
 * encontrar nada y el sistema va a decir lo único que corresponde: que eso lo
 * contesta el farmacéutico. Esa respuesta está escrita una vez
 * (`RESPUESTA_CLINICA`) y se usa siempre.
 *
 * ── F.2 Y F.3 · ESCANEAR Y DICTAR ANTES QUE TIPEAR ──────────────────────────
 *
 * Las manos están ocupadas: el producto en una y el teléfono en la otra. El
 * escáner escribe en el campo y manda Enter; el dictado usa el reconocimiento
 * de voz del navegador, que no manda nada a ningún servidor nuestro.
 *
 * Si el navegador no lo soporta, el botón no aparece. Un botón que no hace
 * nada es peor que no tener botón.
 */

/**
 * §1 · La respuesta cuando la pregunta es clínica. Se escribe una vez.
 *
 * No es una negativa: es decir quién contesta eso. La diferencia importa
 * porque el empleado necesita una salida, no un «no».
 */
const RESPUESTA_CLINICA =
  'Eso lo contesta el farmacéutico. El sistema te dice qué producto hay, qué ' +
  'composición tiene y a qué precio; qué conviene tomar es una indicación ' +
  'profesional y no sale de una pantalla.'

/**
 * Palabras que delatan una pregunta clínica, no una búsqueda de producto.
 *
 * No es un filtro de seguridad —no hay nada que filtrar, el sistema no puede
 * contestar eso igual— es para contestar algo útil en vez de «sin resultados».
 */
const SENAL_CLINICA = /\b(dolor|duele|fiebre|tos|garganta|diarrea|vomit|mareo|alergia|picaz|infecci|anti ?biotic|embaraz|lactanci|presion|diabet|insomnio|ansiedad|para que sirve|puedo tomar|me recetaron|sirve para|que tomo|que le doy|que me recomend)/i

export function MostradorClient({
  sucursales, miSucursal, verPlata, estado, fotoDelStock,
}: {
  sucursales: Suc[]; miSucursal: string | null; verPlata: boolean
  estado: Estado; fotoDelStock: string
}) {
  const [sucursal, setSucursal] = useState(miSucursal ?? sucursales[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [tardo, setTardo] = useState<number | null>(null)
  const [clinica, setClinica] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const ultimo = useRef(0)

  const hayDictado = typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  const correr = useCallback(async (texto: string, codigo?: string) => {
    const t = texto.trim()
    if (!t && !codigo) { setFilas(null); setClinica(false); return }

    // §1 · si la pregunta es clínica, no se busca: se contesta quién contesta.
    if (!codigo && SENAL_CLINICA.test(t)) {
      setClinica(true); setFilas(null); setTardo(null)
      return
    }
    setClinica(false)

    const pedido = ++ultimo.current
    setBuscando(true); setError(null)
    const t0 = performance.now()
    try {
      const r = await fetch('/api/mostrador', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: t, codigo: codigo ?? null, sucursal_id: sucursal }),
      })
      const j = await r.json()
      // Si ya salió otra búsqueda, esta respuesta llegó tarde y se tira: en el
      // mostrador se tipea rápido y la respuesta vieja pisando la nueva es
      // peor que no responder.
      if (pedido !== ultimo.current) return
      if (!r.ok) { setError(j?.error ?? 'No se pudo buscar.'); setFilas([]); return }
      setFilas(j.filas ?? [])
      setTardo(Math.round(performance.now() - t0))
    } catch {
      if (pedido === ultimo.current) setError('No se pudo buscar. ¿Hay internet?')
    } finally {
      if (pedido === ultimo.current) setBuscando(false)
    }
  }, [sucursal])

  // Se busca mientras se escribe, con un freno corto: en el mostrador nadie
  // aprieta Enter.
  useEffect(() => {
    const t = setTimeout(() => { void correr(q) }, 250)
    return () => clearTimeout(t)
  }, [q, correr])

  function dictar() {
    const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'es-AR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const texto = e.results?.[0]?.[0]?.transcript ?? ''
      if (texto) setQ(texto)
    }
    rec.start()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {/* ── EL CAMPO, ARRIBA Y GRANDE ─────────────────────────────────── */}
      <header className="sticky top-0 z-10 space-y-2 border-b bg-background/95 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <ScanLine className="absolute left-2.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={campo} value={q} autoFocus
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // El escáner escribe y manda Enter: eso es un código, no un texto.
                if (e.key === 'Enter' && q.trim()) void correr(q, q.trim())
              }}
              placeholder="Qué piden: nombre, marca, droga o código"
              className="h-14 pl-9 pr-9 text-base"
            />
            {q && (
              <button onClick={() => { setQ(''); campo.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="size-5" />
              </button>
            )}
          </div>
          {hayDictado && (
            <Button size="lg" variant="outline" className="h-14 w-14 shrink-0" onClick={dictar}
              aria-label="Dictar">
              <Mic className="size-5" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {!miSucursal && sucursales.length > 1 ? (
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
              className="rounded border bg-background px-1.5 py-0.5">
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          ) : (
            <span>{sucursales.find((s) => s.id === sucursal)?.nombre ?? 'sin sucursal'}</span>
          )}
          {/* C.6 · el stock es una foto diaria, y se dice siempre. */}
          <span>{fotoDelStock}</span>
          {tardo != null && <span>{tardo} ms</span>}
        </div>
      </header>

      <main className="flex-1 p-3">
        {/* §1 · LA PREGUNTA CLÍNICA ────────────────────────────────────── */}
        {clinica && (
          <div className="space-y-3 border-l-2 border-foreground/60 bg-muted/40 p-4">
            <p className="text-sm font-medium">{RESPUESTA_CLINICA}</p>
            <Button asChild size="lg" className="h-12 w-full">
              <Link href="/mostrador/farmaceutico">Llamar al farmacéutico</Link>
            </Button>
            <p className="text-xs leading-snug text-muted-foreground">
              Si lo que buscás es un producto, escribí el nombre, la marca o la droga. Por
              ejemplo: «ibuprofeno 600».
            </p>
          </div>
        )}

        {error && (
          <p className="flex gap-2 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}

        {buscando && !filas && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Buscando…
          </div>
        )}

        {filas && filas.length === 0 && !clinica && q.trim() && (
          <div className="space-y-3 rounded-lg border border-dashed p-4">
            <p className="text-sm">
              <b>No hay nada que se parezca a «{q.trim()}».</b>
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              Puede ser que no esté en el catálogo, que esté escrito distinto, o que sea un
              controlado —esos no salen en la lista general y se buscan escaneando el envase.
            </p>
            {/* D.1 · registrar el faltante cuesta un toque, y el texto ya está escrito. */}
            <Button asChild size="lg" className="h-12 w-full">
              <Link href={`/mostrador/faltante?q=${encodeURIComponent(q.trim())}`}>
                Registrar que lo pidieron y no hay
              </Link>
            </Button>
          </div>
        )}

        {filas && filas.length > 0 && (
          <ul className="divide-y">
            {filas.map((f) => <ItemProducto key={f.producto_id} f={f} verPlata={verPlata} />)}
          </ul>
        )}

        {/* A.5 · lo que el orden no pudo usar, dicho una vez abajo. */}
        {filas && filas.length > 0 && estado && (
          <div className="mt-4 flex gap-2 border-t pt-3 text-[11px] leading-snug text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <div className="space-y-0.5">
              {estado.con_vencimiento === 0 ? (
                <p>
                  <b>Nadie cargó fechas de vencimiento todavía</b>, así que «vence pronto» —que es
                  lo primero que debería ordenar la lista— no está ordenando nada. Se cargan desde
                  Operaciones → Vencimientos.
                </p>
              ) : (
                <p>Hay fecha de vencimiento cargada en {estado.con_vencimiento.toLocaleString('es-AR')} productos.</p>
              )}
              <p>
                {estado.sin_costo.toLocaleString('es-AR')} de {estado.productos.toLocaleString('es-AR')} productos
                no tienen costo cargado: a esos no se los puede ordenar por margen y no se asume que sea cero.
              </p>
            </div>
          </div>
        )}

        {!q.trim() && !clinica && (
          <div className="space-y-4 p-2">
            <p className="text-sm leading-snug text-muted-foreground">
              Escribí lo que piden, o escaneá el envase. Funciona con el nombre, la marca o la
              droga, y tolera cómo se escribe de verdad: «ibu», «ibuprofeno 600», «ibupirac».
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" className="h-12" asChild>
                <Link href="/mostrador/faltante">Registrar un faltante</Link>
              </Button>
              <Button variant="outline" size="lg" className="h-12" asChild>
                <Link href="/mostrador/cliente">Buscar un cliente</Link>
              </Button>
              <Button variant="outline" size="lg" className="col-span-2 h-12" asChild>
                <Link href="/mostrador/farmaceutico">Llamar al farmacéutico</Link>
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Lo que el sistema <b>no</b> contesta: qué tomar, cuánto, por cuántos días, si se puede
              combinar con otra cosa, ni nada sobre una persona. Eso lo contesta el farmacéutico.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function ItemProducto({ f, verPlata }: { f: Fila; verPlata: boolean }) {
  const sinStock = f.disponible <= 0
  return (
    <li className="py-3">
      <Link href={`/mostrador/${f.producto_id}`} className="block space-y-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium leading-tight">{f.nombre}</span>
              {f.marca_pedida && (
                <Badge variant="outline" className="text-[10px]">la que pidieron</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {[f.presentacion, f.laboratorio].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-semibold tabular-nums">
              {f.precio != null ? formatARS(f.precio) : 'sin precio'}
            </div>
            {f.en_oferta && <div className="text-[10px] text-muted-foreground">en oferta</div>}
          </div>
        </div>

        {/* A.3 · si requiere receta, lo dice ANTES de ofrecerlo. */}
        {f.requiere_receta && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="size-3.5" /> Requiere receta
          </p>
        )}

        {/* A.4 · el motivo, siempre a la vista. */}
        <p className={`text-xs leading-snug ${sinStock ? 'text-muted-foreground' : ''}`}>
          {f.motivos.join(' · ')}
        </p>

        {f.no_se_sabe.length > 0 && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {f.no_se_sabe.join('; ')}
          </p>
        )}

        {sinStock && (
          <p className="text-xs font-medium">
            No hay acá — ver en las otras sucursales →
          </p>
        )}
      </Link>
    </li>
  )
}
