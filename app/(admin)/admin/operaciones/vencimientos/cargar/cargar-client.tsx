'use client'

import { useRef, useState } from 'react'
import { ScanLine, Plus, Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

type Fila = {
  producto_id: string; sucursal_id: string; sucursal: string
  sku: string; nombre: string; codigo_barras: string | null
  stock: number; vende_3m: number; plata: number; prioridad: number
}
type Lote = { numero_lote: string; fecha: string; cantidad: string }

/**
 * ── POR QUÉ ESTA PANTALLA ES ASÍ ────────────────────────────────────────────
 *
 * Se usa parado en el depósito, con una mano, y a veces con mala señal. Todo
 * lo que se pudo sacar, se sacó: no hay filtros, no hay tabla, no hay
 * paginación. Hay un producto adelante y dos campos.
 *
 * El código de barras se escanea. En un depósito, buscar «amoxicilina 500» en
 * una lista de 48.000 con el teclado del celular es lo que hace que la tarea
 * no se haga nunca.
 */
export function CargarVencimientosClient({ avance, lista, sucursales, miSucursal }: {
  avance: { objetivo: number; cargados: number; pendientes: number; productos_mirados: number; productos_con_stock: number } | null
  lista: Fila[]
  sucursales: { id: string; nombre: string }[]
  miSucursal: string | null
}) {
  const [i, setI] = useState(0)
  const [lotes, setLotes] = useState<Lote[]>([{ numero_lote: '', fecha: '', cantidad: '' }])
  const [guardando, setGuardando] = useState(false)
  const [hechos, setHechos] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const inputBusqueda = useRef<HTMLInputElement>(null)

  const actual = lista[i]
  const cargados = (avance?.cargados ?? 0) + hechos

  // El escáner de códigos de barras del celular escribe en el campo y manda
  // Enter: no hace falta nada más que escuchar eso.
  function escanear(codigo: string) {
    const k = codigo.trim()
    if (!k) return
    const j = lista.findIndex((f) => f.codigo_barras === k || f.sku === k)
    if (j < 0) {
      toast.error('Ese código no está en la lista de los 200', {
        description: 'Puede ser un producto que no rota o que ya tiene la fecha cargada.',
      })
      return
    }
    setI(j); setLotes([{ numero_lote: '', fecha: '', cantidad: '' }])
    setBusqueda('')
    toast.success(lista[j].nombre)
  }

  async function guardar() {
    if (!actual) return
    const validos = lotes.filter((l) => l.fecha && Number(l.cantidad) > 0)
    if (!validos.length) {
      toast.error('Falta la fecha o la cantidad', {
        description: 'Una fecha sin cantidad no sirve: no se sabe cuánto vence.',
      })
      return
    }
    setGuardando(true)
    try {
      const r = await fetch('/api/vencimientos/cargar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: actual.producto_id,
          sucursal_id: miSucursal ?? actual.sucursal_id,
          lotes: validos.map((l) => ({
            numero_lote: l.numero_lote || null, fecha_vencimiento: l.fecha, cantidad: Number(l.cantidad),
          })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar.')
      setHechos((h) => h + 1)
      toast.success(`${j.cargados} lote(s) cargados`)
      setLotes([{ numero_lote: '', fecha: '', cantidad: '' }])
      setI((x) => Math.min(x + 1, lista.length - 1))
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setGuardando(false) }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* ── C.3 · EL CONTADOR DE AVANCE ─────────────────────────────────── */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{cargados}</span>
          <span className="text-sm text-muted-foreground">de {avance?.objetivo ?? 200}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (cargados / (avance?.objetivo ?? 200)) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          No hacen falta las {(avance?.productos_con_stock ?? 0).toLocaleString('es-AR')} fechas.
          Con estos 200 —los que más rotan y más plata tienen parada— Vigía ya puede avisar.
          {(avance?.productos_mirados ?? 0) > 0 && (
            <> Hoy mira <b>{avance?.productos_mirados}</b> productos.</>
          )}
        </p>
      </section>

      {/* ── C.2 · ESCANEAR ──────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="absolute left-2 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={inputBusqueda} value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') escanear(busqueda) }}
            inputMode="numeric" placeholder="Escaneá el código de barras"
            className="h-12 pl-9 text-base" />
        </div>
        <Button size="lg" variant="outline" onClick={() => escanear(busqueda)} className="h-12">
          Buscar
        </Button>
      </div>

      {!actual ? (
        <Alert>
          <Check className="size-4" />
          <AlertDescription className="text-sm leading-snug">
            <b>No queda ninguno de los 200 sin cargar.</b> Vigía ya tiene con qué trabajar. Lo que
            entre de ahora en más se carga con la tarea diaria, al recibir la mercadería.
          </AlertDescription>
        </Alert>
      ) : (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <div className="text-xs text-muted-foreground">
              {i + 1} de {lista.length} · {actual.sucursal}
            </div>
            <h2 className="mt-0.5 text-lg font-semibold leading-tight">{actual.nombre}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <code>{actual.sku}</code>
              {actual.codigo_barras && <code>{actual.codigo_barras}</code>}
              <Badge variant="outline" className="text-[10px]">{actual.stock} en stock</Badge>
              <span>vende {actual.vende_3m} cada 3 meses · {formatARS(actual.plata)} parados</span>
            </div>
          </div>

          {/* C.2 · varios lotes del mismo producto, seguidos */}
          <div className="space-y-2">
            {lotes.map((l, k) => (
              <div key={k} className="flex gap-2">
                <Input value={l.fecha} type="date"
                  onChange={(e) => setLotes((p) => p.map((x, j) => j === k ? { ...x, fecha: e.target.value } : x))}
                  className="h-12 flex-1 text-base" />
                <Input value={l.cantidad} type="number" inputMode="numeric" placeholder="cant."
                  onChange={(e) => setLotes((p) => p.map((x, j) => j === k ? { ...x, cantidad: e.target.value } : x))}
                  className="h-12 w-24 text-base" />
                {lotes.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-12 w-10"
                    onClick={() => setLotes((p) => p.filter((_, j) => j !== k))}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1"
              onClick={() => setLotes((p) => [...p, { numero_lote: '', fecha: '', cantidad: '' }])}>
              <Plus className="size-3.5" /> Otro lote de este producto
            </Button>
          </div>

          <div className="flex gap-2">
            <Button size="lg" className="h-12 flex-1" disabled={guardando} onClick={guardar}>
              {guardando ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              Guardar y seguir
            </Button>
            <Button size="lg" variant="outline" className="h-12"
              onClick={() => { setI((x) => Math.min(x + 1, lista.length - 1)); setLotes([{ numero_lote: '', fecha: '', cantidad: '' }]) }}>
              Saltear
            </Button>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            Si un producto no tiene fecha visible, salteálo. Una fecha inventada es peor que
            ninguna: Vigía avisaría de algo que no vence, y la próxima vez nadie le va a creer.
          </p>
        </section>
      )}
    </div>
  )
}
