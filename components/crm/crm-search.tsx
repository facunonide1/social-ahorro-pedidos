'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Banknote,
  Building2,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  PackageCheck,
  Plus,
  Search,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { OrderStatusBadge } from '@/components/crm/order-status-badge'
import type { SearchResult } from '@/app/api/search/route'

type Variant = 'header' | 'button-only'

type QuickAction = {
  id: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string
}

const ACCIONES_RAPIDAS: QuickAction[] = [
  { id: 'a-nuevo-pedido', label: 'Nuevo pedido', href: '/pedidos/nuevo', icon: Plus, keywords: 'crear pedido orden' },
  { id: 'a-nuevo-prov', label: 'Nuevo proveedor', href: '/hub/proveedores/nuevo', icon: Building2, keywords: 'alta proveedor' },
  { id: 'a-nueva-factura', label: 'Cargar factura', href: '/hub/facturas/nueva', icon: FileText, keywords: 'nueva factura proveedor' },
  { id: 'a-nuevo-pago', label: 'Registrar pago', href: '/hub/pagos/nuevo', icon: Banknote, keywords: 'orden de pago op' },
  { id: 'a-nueva-recepcion', label: 'Nueva recepción', href: '/hub/recepciones/nueva', icon: PackageCheck, keywords: 'recibir mercaderia' },
]

const NAVEGACION: QuickAction[] = [
  { id: 'n-dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { id: 'n-pedidos', label: 'Pedidos', href: '/pedidos', icon: ClipboardList },
  { id: 'n-clientes', label: 'Clientes', href: '/clientes', icon: Users },
  { id: 'n-repartidor', label: 'Repartidor', href: '/repartidor', icon: Truck },
  { id: 'n-hub', label: 'Admin Hub', href: '/hub', icon: Home },
  { id: 'n-proveedores', label: 'Proveedores', href: '/hub/proveedores', icon: Building2 },
  { id: 'n-facturas', label: 'Facturas', href: '/hub/facturas', icon: FileText },
  { id: 'n-pagos', label: 'Pagos', href: '/hub/pagos', icon: Banknote },
  { id: 'n-recepciones', label: 'Recepciones', href: '/hub/recepciones', icon: PackageCheck },
  { id: 'n-sucursales', label: 'Sucursales', href: '/hub/sucursales', icon: Home },
  { id: 'n-usuarios', label: 'Usuarios', href: '/hub/usuarios', icon: UserCog },
  { id: 'n-config', label: 'Configuración', href: '/admin/configuracion', icon: UserCog, keywords: 'preferencias settings' },
]

export function CrmSearch({ variant = 'header' }: { variant?: Variant }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [data, setData] = useState<SearchResult>({ orders: [], customers: [], proveedores: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      setQ('')
      setData({ orders: [], customers: [], proveedores: [] })
    }
  }, [open])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setData({ orders: [], customers: [], proveedores: [] })
      return
    }
    setLoading(true)
    const abort = new AbortController()
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: abort.signal,
        })
        if (!res.ok) return
        const json: SearchResult = await res.json()
        setData(json)
      } catch {
        /* abort/red */
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(handle)
      abort.abort()
    }
  }, [q])

  function goto(url: string) {
    setOpen(false)
    router.push(url)
  }

  const hasResults =
    data.orders.length > 0 || data.customers.length > 0 || data.proveedores.length > 0
  const showHelp = q.trim().length < 2 && !loading
  const emptyResults = q.trim().length >= 2 && !loading && !hasResults

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden h-9 w-56 shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/40 lg:flex"
          aria-label="Buscar pedidos, clientes o proveedores"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate whitespace-nowrap">Buscar…</span>
          <kbd className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <Search className="size-3.5" />
          <span className="hidden md:inline">Buscar</span>
          <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline">
            ⌘K
          </kbd>
        </Button>
      )}
      {variant === 'header' && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 lg:hidden"
          aria-label="Buscar"
          onClick={() => setOpen(true)}
        >
          <Search className="size-4" />
        </Button>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Pedido, cliente, proveedor, o acción…"
        />
        <CommandList>
          {emptyResults && (
            <CommandEmpty>Sin resultados para &ldquo;{q}&rdquo;.</CommandEmpty>
          )}
          {loading && q.trim().length >= 2 && <CommandEmpty>Buscando…</CommandEmpty>}

          {data.orders.length > 0 && (
            <CommandGroup heading="Pedidos">
              {data.orders.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`order-${o.id} ${o.codigo} ${o.customer_name ?? ''}`}
                  onSelect={() => goto(`/pedidos/${o.id}`)}
                  className="flex items-center gap-3"
                >
                  <span className="min-w-[110px] font-bold tabular-nums">{o.codigo}</span>
                  <span className="flex-1 truncate">{o.customer_name || '—'}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="font-semibold tabular-nums">
                    ${Number(o.total).toLocaleString('es-AR')}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data.orders.length > 0 && data.customers.length > 0 && <CommandSeparator />}

          {data.customers.length > 0 && (
            <CommandGroup heading="Clientes">
              {data.customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer-${c.id} ${c.name ?? ''} ${c.dni ?? ''} ${c.phone ?? ''} ${c.email ?? ''}`}
                  onSelect={() => goto(`/clientes/${c.id}`)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{c.name || '(sin nombre)'}</span>
                  <span className="text-xs text-muted-foreground">
                    {[c.dni ? `DNI ${c.dni}` : null, c.phone, c.email]
                      .filter(Boolean)
                      .join(' · ') || 'sin contacto'}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data.orders.length > 0 || data.customers.length > 0) &&
            data.proveedores.length > 0 && <CommandSeparator />}

          {data.proveedores.length > 0 && (
            <CommandGroup heading="Proveedores">
              {data.proveedores.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`prov-${p.id} ${p.razon_social} ${p.nombre_comercial ?? ''} ${p.cuit}`}
                  onSelect={() => goto(`/hub/proveedores/${p.id}`)}
                  className="flex items-center gap-3"
                >
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.razon_social}</div>
                    {p.nombre_comercial && (
                      <div className="truncate text-xs text-muted-foreground">
                        {p.nombre_comercial}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.cuit}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(hasResults || showHelp) && <CommandSeparator />}

          <CommandGroup heading="Acciones rápidas">
            {ACCIONES_RAPIDAS.map((a) => {
              const Icon = a.icon
              return (
                <CommandItem
                  key={a.id}
                  value={`${a.id} ${a.label} ${a.keywords ?? ''}`}
                  onSelect={() => goto(a.href)}
                  className="flex items-center gap-2"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{a.label}</span>
                  <ArrowRight className="ml-auto size-3 text-muted-foreground" />
                </CommandItem>
              )
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navegación">
            {NAVEGACION.map((n) => {
              const Icon = n.icon
              return (
                <CommandItem
                  key={n.id}
                  value={`${n.id} ${n.label} ${n.keywords ?? ''}`}
                  onSelect={() => goto(n.href)}
                  className="flex items-center gap-2"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{n.label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
