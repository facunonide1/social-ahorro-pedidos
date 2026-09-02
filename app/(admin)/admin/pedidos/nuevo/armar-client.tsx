'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, Trash2, ShieldAlert, Tag, UserPlus, Check } from 'lucide-react'
import { toast } from 'sonner'

import type { ProductoParaPedido } from '@/app/api/pedidos/buscar-productos/route'
import type { ClienteParaPedido } from '@/app/api/pedidos/buscar-clientes/route'
import { CANALES, CANAL_LABELS, CANAL_PENDIENTE } from '@/lib/pedidos/canales'
import { FORMA_ENTREGA_LABELS, FORMA_ENTREGA_PENDIENTE, type FormaEntrega, type OrderOrigin } from '@/lib/types'
import { formatARS } from '@/lib/utils/format'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Sucursal = { id: string; nombre: string; codigo: string | null; es_ecommerce: boolean }

type Renglon = {
  producto_id: string
  sku: string | null
  nombre: string
  cantidad: number
  precio_lista: number
  /** Precio final por unidad. Con oferta aplicada si hay. */
  precio: number
  descuento_pct: number | null
}

/** Hook de búsqueda con debounce contra un endpoint que filtra en el servidor. */
function useBusqueda<T>(url: string, minimo = 2) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const t = q.trim()
    if (t.length < minimo) { setItems([]); setCargando(false); return }
    setCargando(true)
    const abort = new AbortController()
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`${url}?q=${encodeURIComponent(t)}`, { signal: abort.signal })
        setItems(r.ok ? await r.json() : [])
      } catch { /* abortada */ } finally { setCargando(false) }
    }, 250)
    return () => { clearTimeout(h); abort.abort() }
  }, [q, url, minimo])

  return { q, setQ, items, cargando, limpiar: () => { setQ(''); setItems([]) } }
}

export function ArmarPedidoClient({ sucursales }: { sucursales: Sucursal[] }) {
  const router = useRouter()

  const [canal, setCanal] = useState<OrderOrigin>('whatsapp')
  const [cliente, setCliente] = useState<ClienteParaPedido | null>(null)
  const [nuevoCliente, setNuevoCliente] = useState<{ nombre: string; telefono: string; dni: string; email: string } | null>(null)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [sucursalId, setSucursalId] = useState('')
  const [forma, setForma] = useState<FormaEntrega | ''>('')
  const [envio, setEnvio] = useState(0)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const bc = useBusqueda<ClienteParaPedido>('/api/pedidos/buscar-clientes')
  const bp = useBusqueda<ProductoParaPedido>('/api/pedidos/buscar-productos')

  const subtotal = renglones.reduce((a, r) => a + r.precio_lista * r.cantidad, 0)
  const conOferta = renglones.reduce((a, r) => a + r.precio * r.cantidad, 0)
  const ahorro = subtotal - conOferta
  const total = conOferta + envio

  const hayCliente = !!cliente || !!(nuevoCliente?.nombre || nuevoCliente?.telefono)
  const puedeConfirmar = hayCliente && renglones.length > 0 && !!sucursalId && !!forma && !guardando

  function agregar(p: ProductoParaPedido) {
    if (!p.se_puede_vender) return
    if (p.precio === null) return
    setRenglones((rs) => {
      const i = rs.findIndex((r) => r.producto_id === p.producto_id)
      if (i >= 0) {
        const copia = [...rs]
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 }
        return copia
      }
      return [...rs, {
        producto_id: p.producto_id,
        sku: p.sku,
        nombre: p.nombre,
        cantidad: 1,
        precio_lista: p.precio!,
        // La oferta se aplica sola. NORA no crea ni modifica ofertas acá.
        precio: p.oferta_precio ?? p.precio!,
        descuento_pct: p.oferta_precio ? (p.oferta_descuento_pct ?? null) : null,
      }]
    })
    bp.limpiar()
  }

  async function confirmar() {
    setGuardando(true)
    try {
      const r = await fetch('/api/pedidos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal, sucursal_id: sucursalId, forma_entrega: forma,
          cliente_id: cliente?.id ?? null,
          cliente_nuevo: cliente ? null : nuevoCliente,
          renglones, envio, notas,
        }),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error ?? 'No se pudo crear el pedido'); return }
      toast.success(`Pedido ${j.codigo} creado`)
      router.push('/admin/pedidos/tablero')
    } finally { setGuardando(false) }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* ── EL CANAL ES UN CAMPO ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Por dónde entró</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {CANALES.map((c) => (
                <button key={c} type="button" onClick={() => setCanal(c)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    canal === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent/50'}`}>
                  {CANAL_LABELS[c]}
                </button>
              ))}
            </div>
            {CANAL_PENDIENTE[canal] && (
              <p className="text-xs text-muted-foreground">{CANAL_PENDIENTE[canal]}</p>
            )}
          </CardContent>
        </Card>

        {/* ── B.1 · EL CLIENTE PRIMERO ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">El cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cliente ? (
              <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{cliente.nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {[cliente.telefono, cliente.dni && `DNI ${cliente.dni}`, cliente.email].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {cliente.n_compras_12m > 0
                      ? <>{cliente.n_compras_12m} compras en 12 meses{cliente.ultima_compra && <> · última el {cliente.ultima_compra}</>}</>
                      : 'Sin compras registradas en los últimos 12 meses.'}
                  </div>
                  {cliente.notas && <p className="mt-1 text-xs italic text-muted-foreground">{cliente.notas}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCliente(null)}>Cambiar</Button>
              </div>
            ) : nuevoCliente ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo l="Nombre" v={nuevoCliente.nombre} on={(v) => setNuevoCliente({ ...nuevoCliente, nombre: v })} />
                  <Campo l="Teléfono" v={nuevoCliente.telefono} on={(v) => setNuevoCliente({ ...nuevoCliente, telefono: v })} />
                  <Campo l="DNI" v={nuevoCliente.dni} on={(v) => setNuevoCliente({ ...nuevoCliente, dni: v })} />
                  <Campo l="Mail" v={nuevoCliente.email} on={(v) => setNuevoCliente({ ...nuevoCliente, email: v })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Se busca por DNI, teléfono o mail antes de crearlo. Si ya existe, el pedido va a su ficha:
                  un cliente que compra por tres canales es un cliente.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setNuevoCliente(null)}>Buscar uno existente</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Teléfono, DNI, nombre o mail…"
                    value={bc.q} onChange={(e) => bc.setQ(e.target.value)} />
                  {bc.cargando && <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                {bc.items.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setCliente(c); bc.limpiar() }}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.telefono, c.dni && `DNI ${c.dni}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Check className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {bc.q.trim().length >= 2 && !bc.cargando && bc.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin resultados.</p>
                )}
                <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => setNuevoCliente({ nombre: bc.q.trim(), telefono: '', dni: '', email: '' })}>
                  <UserPlus className="size-3.5" /> Cliente nuevo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── B.2 · PRODUCTOS, CON EL STOCK A LA VISTA ─────────────────── */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Los productos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Nombre, SKU o código de barras…"
                value={bp.q} onChange={(e) => bp.setQ(e.target.value)} />
              {bp.cargando && <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>

            {bp.items.length > 0 && (
              <div className="max-h-[380px] divide-y divide-border overflow-y-auto rounded-md border border-border">
                {bp.items.map((p) => <ResultadoProducto key={p.producto_id} p={p} onAdd={() => agregar(p)} />)}
              </div>
            )}
            {bp.q.trim().length >= 2 && !bp.cargando && bp.items.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ningún producto del maestro coincide. Si estás seguro de que existe en SIFACO,
                puede ser que el archivo del maestro haya salido incompleto — está documentado
                en docs/EL-MAESTRO-ESTA-INCOMPLETO.md.
              </p>
            )}

            {renglones.length > 0 && (
              <div className="divide-y divide-border rounded-md border border-border">
                {renglones.map((r, i) => (
                  <div key={r.producto_id} className="flex items-center gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.sku && <>SKU {r.sku} · </>}
                        {r.descuento_pct != null ? (
                          <><s>{formatARS(r.precio_lista)}</s> {formatARS(r.precio)} c/u
                            <Badge variant="outline" className="ml-1 text-[10px]">−{r.descuento_pct.toFixed(0)}%</Badge></>
                        ) : <>{formatARS(r.precio)} c/u</>}
                      </div>
                    </div>
                    <Input type="number" min={1} value={r.cantidad} className="w-16 text-center"
                      onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value) || 1)
                        setRenglones((rs) => rs.map((x, j) => j === i ? { ...x, cantidad: n } : x))
                      }} />
                    <span className="w-24 text-right text-sm font-semibold tabular-nums">
                      {formatARS(r.precio * r.cantidad)}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── B.4 y B.5 · EL TOTAL Y LO OBLIGATORIO ──────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">De dónde sale</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sucursal *</Label>
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">Elegir…</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}{s.codigo ? ` (${s.codigo})` : ''}{s.es_ecommerce ? ' · ecommerce' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Se elige a mano. NORA no la puede deducir del stock: el que tiene es el total de las
                cuatro sucursales, sin apertura por local.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Forma de entrega *</Label>
              <select value={forma} onChange={(e) => setForma(e.target.value as FormaEntrega)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">Elegir…</option>
                {(Object.keys(FORMA_ENTREGA_LABELS) as FormaEntrega[]).map((f) => (
                  <option key={f} value={f}>{FORMA_ENTREGA_LABELS[f]}</option>
                ))}
              </select>
              {forma && FORMA_ENTREGA_PENDIENTE[forma] && (
                <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                  {FORMA_ENTREGA_PENDIENTE[forma]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Envío</Label>
              <Input type="number" min={0} value={envio} onChange={(e) => setEnvio(Number(e.target.value) || 0)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notas</Label>
              <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">El total</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Linea l="Subtotal (precio de lista)" v={formatARS(subtotal)} />
            {ahorro > 0 && <Linea l="Ofertas aplicadas" v={`− ${formatARS(ahorro)}`} verde />}
            <Linea l="Envío" v={formatARS(envio)} />
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span><span className="tabular-nums">{formatARS(total)}</span>
            </div>

            {!puedeConfirmar && (
              <p className="pt-2 text-[11px] leading-snug text-muted-foreground">
                Falta{' '}
                {[!hayCliente && 'el cliente', renglones.length === 0 && 'algún producto',
                  !sucursalId && 'la sucursal', !forma && 'la forma de entrega']
                  .filter(Boolean).join(', ')}.
              </p>
            )}

            <Button className="mt-3 w-full" disabled={!puedeConfirmar} onClick={confirmar}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : 'Confirmar el pedido'}
            </Button>
          </CardContent>
        </Card>

        <Alert>
          <AlertDescription className="text-xs leading-snug">
            El stock que se muestra es la foto del archivo diario de SIFACO. Entre archivo y archivo
            el mostrador vende y NORA no se entera.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}

/* ── UN RESULTADO DE BÚSQUEDA ────────────────────────────────────────── */

function ResultadoProducto({ p, onAdd }: { p: ProductoParaPedido; onAdd: () => void }) {
  const sinPrecio = p.precio === null
  const bloqueado = !p.se_puede_vender || sinPrecio

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${bloqueado ? 'bg-muted/40' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{p.nombre}</span>
          {!p.se_puede_vender && (
            <Badge variant="destructive" className="shrink-0 gap-1 text-[10px]">
              <ShieldAlert className="size-3" /> requiere receta
            </Badge>
          )}
          {p.oferta_precio != null && (
            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
              <Tag className="size-3" /> oferta
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          {p.sku && <span>SKU {p.sku}</span>}
          {/* Stock null es "no lo pude leer"; 0 es "lo miré y no hay". */}
          <span>{p.stock === null ? 'stock sin dato' : `stock ${p.stock.toLocaleString('es-AR')}`}</span>
          {p.laboratorio && <span>{p.laboratorio}</span>}
        </div>
        {!p.se_puede_vender && p.por_que && (
          <p className="mt-1 text-[11px] leading-snug text-destructive">
            {p.por_que}. No se ofrece ni se vende por canal abierto — es la regla 9 y no es una
            decisión comercial.
          </p>
        )}
        {sinPrecio && p.se_puede_vender && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            SIFACO no declara precio de venta para este producto. No se puede agregar sin precio.
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        {sinPrecio ? (
          <div className="text-xs text-muted-foreground">sin precio</div>
        ) : p.oferta_precio != null ? (
          <div className="text-sm font-semibold tabular-nums">
            <s className="mr-1 text-xs font-normal text-muted-foreground">{formatARS(p.precio!)}</s>
            {formatARS(p.oferta_precio)}
          </div>
        ) : (
          <div className="text-sm font-semibold tabular-nums">{formatARS(p.precio!)}</div>
        )}
        <Button size="sm" variant={bloqueado ? 'ghost' : 'outline'} disabled={bloqueado}
          className="mt-1 h-7 px-2 text-xs" onClick={onAdd}>
          Agregar
        </Button>
      </div>
    </div>
  )
}

function Linea({ l, v, verde }: { l: string; v: string; verde?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{l}</span>
      <span className={`tabular-nums ${verde ? 'text-success' : ''}`}>{v}</span>
    </div>
  )
}

function Campo({ l, v, on }: { l: string; v: string; on: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} />
    </div>
  )
}
