'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronsLeft,
  ChevronsRight,
  ExternalLink as ExtLinkIcon,
  Star,
  StarOff,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

import { useUIStore } from '@/lib/stores/ui-store'
import { NAVEGACION_DEPARTAMENTAL } from '@/lib/constants/navegacion'
import { DEPARTAMENTOS_INFO } from '@/lib/constants/departamentos'
import type { Departamento } from '@/lib/types/admin'
import type { SubmenuItem, DepartamentoNav } from '@/lib/constants/navegacion'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Icon } from '@/components/icon'
import { cn } from '@/lib/utils'

export function Sidebar({ deptActivo }: { deptActivo: Departamento }) {
  const pathname = usePathname() || ''
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const recientes = useUIStore((s) => s.recientes)
  const favoritos = useUIStore((s) => s.favoritos)
  const isFavorito = useUIStore((s) => s.isFavorito)
  const addFavorito = useUIStore((s) => s.addFavorito)
  const removeFavorito = useUIStore((s) => s.removeFavorito)
  const pushReciente = useUIStore((s) => s.pushReciente)
  const isHydrated = useUIStore((s) => s.isHydrated)

  const dept = NAVEGACION_DEPARTAMENTAL[deptActivo]

  // Tracking de recientes basado en pathname (universal: cubre links,
  // URL directa, browser back).
  useEffect(() => {
    if (!isHydrated || !pathname.startsWith('/admin')) return
    const item = findItemByPath(pathname)
    if (item) pushReciente(item.path, item.label)
  }, [pathname, isHydrated, pushReciente])

  // Sidebar oculto cuando estamos en ejecutivo y no hay submenús accesibles
  // (todos los items son placeholder/fase2 — el dashboard ejecutivo está en /admin).
  // Lo mantenemos visible siempre por simplicidad; los items no-activos están
  // disabled-styled.

  const itemsFav = favoritos
    .map((p) => findItemByPath(p))
    .filter((i): i is SubmenuItem => Boolean(i))
  const itemsRec = recientes.slice(0, 5)

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        role="navigation"
        aria-label={`Navegación ${dept.label}`}
        className={cn(
          'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {/* Header del depto */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md text-white',
              dept.color,
            )}
            aria-hidden
          >
            <Icon name={dept.icon} className="size-4" />
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{dept.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {DEPARTAMENTOS_INFO[deptActivo].descripcion}
              </div>
            </div>
          )}
        </div>

        {/* Recientes */}
        {!collapsed && itemsRec.length > 0 && (
          <SidebarSection title="Recientes" icon={<Clock className="size-3" />}>
            <ul className="flex flex-col gap-0.5">
              {itemsRec.map((r) => (
                <li key={r.path}>
                  <Link
                    href={r.path}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                    <span className="truncate">{r.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </SidebarSection>
        )}

        {/* Favoritos */}
        {!collapsed && itemsFav.length > 0 && (
          <SidebarSection title="Favoritos" icon={<Star className="size-3" />}>
            <ul className="flex flex-col gap-0.5">
              {itemsFav.map((f) => (
                <li key={f.path}>
                  <Link
                    href={f.path}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    <Icon name={f.icon} className="size-3" />
                    <span className="truncate">{f.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </SidebarSection>
        )}

        {/* Submenú del depto activo */}
        <nav className="flex-1 overflow-y-auto p-2" aria-label={`Secciones de ${dept.label}`}>
          {!collapsed && itemsFav.length === 0 && itemsRec.length === 0 && (
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {dept.label}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {dept.submenu.map((it) => (
              <SidebarItem
                key={it.path}
                item={it}
                pathname={pathname}
                collapsed={collapsed}
                fav={isFavorito(it.path)}
                onFav={() => isFavorito(it.path) ? removeFavorito(it.path) : addFavorito(it.path)}
                onNavigate={() => pushReciente(it.path, it.label)}
              />
            ))}
          </ul>
        </nav>

        {/* Toggle colapsar */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn('h-8 w-full justify-start text-xs text-muted-foreground', collapsed && 'justify-center')}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && <span>Colapsar</span>}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  )
}

function SidebarSection({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border px-2 py-2">
      <div className="mb-1 flex items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function SidebarItem({
  item,
  pathname,
  collapsed,
  fav,
  onFav,
  onNavigate,
}: {
  item: SubmenuItem
  pathname: string
  collapsed: boolean
  fav: boolean
  onFav: () => void
  onNavigate: () => void
}) {
  const isExterno = item.estado === 'externo'
  const isFase2   = item.estado === 'fase2'
  const isPlace   = item.estado === 'placeholder'
  const disabled  = isFase2 || isPlace

  const isActive = !disabled && !isExterno && (
    pathname === item.path || pathname.startsWith(item.path + '/')
  )

  const cls = cn(
    'group relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors',
    isActive
      ? 'bg-accent text-accent-foreground'
      : 'text-foreground hover:bg-accent/60',
    disabled && 'cursor-default text-muted-foreground/70 hover:bg-transparent',
    collapsed && 'justify-center px-0',
  )

  const inner = (
    <>
      <Icon name={item.icon} className="size-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge && (
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {/* TODO: resolver badge dinámico desde un selector */}
              ·
            </span>
          )}
          {isExterno && <ExtLinkIcon className="size-3 opacity-60" />}
          {isFase2 && (
            <span className="ml-auto rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
              Pronto
            </span>
          )}
        </>
      )}
    </>
  )

  // Render según tipo
  let node: React.ReactNode

  if (isExterno) {
    node = (
      <a href={item.path} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    )
  } else if (disabled) {
    node = (
      <button
        type="button"
        className={cls}
        onClick={() =>
          toast.message(item.label, {
            description: isFase2 ? 'Disponible en fase 2.' : 'En construcción.',
          })
        }
      >
        {inner}
      </button>
    )
  } else {
    node = (
      <Link
        href={item.path}
        className={cls}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
      >
        {inner}
      </Link>
    )
  }

  // Wrap con tooltip si está colapsado
  const wrappedNode = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{node as React.ReactElement}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : node

  return (
    <li className="relative">
      {wrappedNode}
      {!collapsed && !disabled && !isExterno && (
        <button
          type="button"
          aria-label={fav ? `Quitar ${item.label} de favoritos` : `Marcar ${item.label} como favorito`}
          onClick={onFav}
          className={cn(
            'absolute right-1 top-1.5 rounded-sm p-1 text-muted-foreground/0 transition-all hover:bg-accent hover:text-foreground group-hover:text-muted-foreground/60',
            fav && 'text-yellow-500 group-hover:text-yellow-500',
          )}
        >
          {fav ? <Star className="size-3 fill-current" /> : <StarOff className="size-3" />}
        </button>
      )}
    </li>
  )
}

/** Busca un item de cualquier depto por su path (para favoritos / recientes). */
function findItemByPath(path: string): SubmenuItem | null {
  for (const dept of Object.values(NAVEGACION_DEPARTAMENTAL) as DepartamentoNav[]) {
    const found = dept.submenu.find((s) => s.path === path)
    if (found) return found
  }
  return null
}
