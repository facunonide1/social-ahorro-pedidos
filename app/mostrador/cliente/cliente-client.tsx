'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, UserPlus, Package, Check } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type Fila = {
  id: string; nombre: string; dni: string | null; telefono: string | null
  ultima_compra: string | null; n_compras_12m: number | null
  total_gastado_12m: number | null; sucursal_habitual: string | null
  pedidos_esperando: number; es_demo: boolean
}

export function ClienteClient({ puedeCrear }: { puedeCrear: boolean }) {
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [ficha, setFicha] = useState<any>(null)
  const [alta, setAlta] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', dni: '' })
  const [busy, setBusy] = useState(false)

  const buscar = useCallback(async (texto: string) => {
    if (texto.trim().length < 2) { setFilas(null); return }
    setBuscando(true)
    try {
      const r = await fetch('/api/mostrador/cliente', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'buscar', q: texto.trim() }),
      })
      const j = await r.json()
      setFilas(j.filas ?? [])
    } finally { setBuscando(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void buscar(q) }, 250)
    return () => clearTimeout(t)
  }, [q, buscar])

  async function abrir(id: string) {
    const r = await fetch('/api/mostrador/cliente', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'ficha', cliente_id: id }),
    })
    const j = await r.json()
    if (!r.ok) { toast.error(j?.error ?? 'No se pudo abrir.'); return }
    setFicha(j.cliente)
  }

  async function crear() {
    if (!nuevo.nombre.trim()) { toast.error('Falta el nombre.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/mostrador/cliente', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'alta', ...nuevo }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo.')
      toast.success(j.ya_existia ? 'Ya estaba cargado.' : 'Cliente cargado.', {
        description: j.aviso ?? undefined,
      })
      setAlta(false); setNuevo({ nombre: '', telefono: '', dni: '' })
      await abrir(j.id)
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  // ── E.3 · LA FICHA ─────────────────────────────────────────────────────
  if (ficha) {
    const esperando = (ficha.esperando ?? []) as any[]
    return (
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-2 border-b p-3">
          <Button size="icon" variant="ghost" onClick={() => setFicha(null)} className="size-10 shrink-0">
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{ficha.nombre}</div>
            <div className="text-xs text-muted-foreground">
              {[ficha.telefono, ficha.dni].filter(Boolean).join(' · ') || 'sin teléfono ni DNI'}
            </div>
          </div>
        </header>

        <div className="space-y-4 p-3">
          {/* Lo primero: si tiene algo esperando. */}
          {esperando.length > 0 && (
            <section className="space-y-2 rounded-lg border border-foreground/40 p-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Package className="size-4" /> Tiene {esperando.length} pedido(s) esperando
              </h2>
              {esperando.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>#{o.numero ?? '—'}</span>
                  <Badge variant="outline" className="text-[10px]">{o.estado}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {o.forma_entrega === 'retiro_local' ? `retira en ${o.sucursal}` : 'envío'}
                  </span>
                  <span className="ml-auto tabular-nums">{formatARS(Number(o.total ?? 0))}</span>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-1.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lo que se sabe
            </h2>
            <dl className="space-y-1 text-sm">
              <Dato k="Última compra" v={ficha.ultima_compra ?? 'ninguna registrada'} />
              <Dato k="Compras en 12 meses" v={String(ficha.n_compras_12m ?? 0)} />
              {ficha.dias_sin_venir != null && (
                <Dato k="Días sin venir" v={String(ficha.dias_sin_venir)} />
              )}
            </dl>

            {/* E.3 · «le toca reponer», por la frecuencia de SUS compras. */}
            {ficha.le_toca_reponer === true && (
              <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs leading-snug">
                Vuelve cada {ficha.frecuencia_dias} días y hace {ficha.dias_sin_venir} que no
                viene. <b>Le podría tocar reponer.</b> Es por la frecuencia de sus compras, no por
                lo que compra: el sistema no sabe qué toma ni lo guarda.
              </p>
            )}
            {ficha.le_toca_reponer === null && ficha.por_que_no_se_sabe && (
              <p className="text-xs leading-snug text-muted-foreground">
                No se puede decir si le toca volver: {ficha.por_que_no_se_sabe}.
              </p>
            )}
          </section>

          {ficha.ultima && (
            <section className="space-y-1.5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Qué compró la última vez
              </h2>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{ficha.ultima.fecha}</span>
                  <span className="ml-auto tabular-nums">
                    {formatARS(Number(ficha.ultima.monto ?? 0))}
                  </span>
                </div>
                {Array.isArray(ficha.ultima.productos) && ficha.ultima.productos.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {ficha.ultima.productos.slice(0, 8).map((p: any, i: number) => (
                      <li key={i}>{p?.nombre ?? p?.sku ?? JSON.stringify(p)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Qué compró es un hecho comercial. <b>Por qué lo compró no está en el sistema</b> y
                no se puede cargar.
              </p>
            </section>
          )}

          {ficha.es_demo && (
            <p className="rounded border border-dashed p-2.5 text-xs leading-snug text-muted-foreground">
              Este cliente es de demostración: no compró nada de verdad.
            </p>
          )}

          <Button size="lg" variant="outline" className="h-12 w-full" asChild>
            <Link href="/mostrador">Volver al mostrador</Link>
          </Button>
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
        <div className="font-medium">El cliente</div>
      </header>

      <div className="space-y-4 p-3">
        <Input className="h-14 text-base" value={q} autoFocus inputMode="search"
          onChange={(e) => setQ(e.target.value)}
          placeholder="DNI, teléfono o nombre" />

        {buscando && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Buscando…
          </div>
        )}

        {filas && filas.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {filas.map((c) => (
              <li key={c.id}>
                <button onClick={() => abrir(c.id)}
                  className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{c.nombre}</span>
                      {c.pedidos_esperando > 0 && (
                        <Badge variant="default" className="text-[10px]">
                          {c.pedidos_esperando} esperando
                        </Badge>
                      )}
                      {c.es_demo && (
                        <Badge variant="outline" className="text-[10px]">demo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[c.telefono, c.dni, c.sucursal_habitual].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {c.ultima_compra ?? 'sin compras'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {filas && filas.length === 0 && q.trim().length >= 2 && (
          <div className="space-y-2 rounded-lg border border-dashed p-4">
            <p className="text-sm">No hay ningún cliente que coincida con «{q.trim()}».</p>
            {puedeCrear && (
              <Button size="lg" className="h-12 w-full" onClick={() => {
                setAlta(true)
                // Si escribió un nombre, ya va cargado; si escribió números,
                // van al teléfono. Diez segundos quiere decir diez segundos.
                const soloNumeros = /^[\d\s-]+$/.test(q.trim())
                setNuevo({
                  nombre: soloNumeros ? '' : q.trim(),
                  telefono: soloNumeros ? q.trim() : '',
                  dni: '',
                })
              }}>
                <UserPlus className="size-5" /> Cargarlo
              </Button>
            )}
          </div>
        )}

        {/* ── E.2 · ALTA EN DIEZ SEGUNDOS ──────────────────────────────── */}
        {alta && (
          <section className="space-y-2 rounded-lg border p-3">
            <h2 className="text-sm font-semibold">Cargar el cliente</h2>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Nombre
                </Label>
                <Input className="h-12 text-base" value={nuevo.nombre} autoFocus
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Teléfono
                </Label>
                <Input className="h-12 text-base" inputMode="tel" value={nuevo.telefono}
                  onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Con el nombre alcanza. El DNI, el email y el resto se completan después — pedirle
              todo a alguien que está esperando es la razón por la que nadie carga clientes.
            </p>
            <Button size="lg" className="h-12 w-full" disabled={busy} onClick={crear}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              Cargar
            </Button>
          </section>
        )}
      </div>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd>{v}</dd>
    </div>
  )
}
