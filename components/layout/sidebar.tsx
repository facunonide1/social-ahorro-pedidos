'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronsLeft,
  ChevronsRight,
  Star,
  StarOff,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

import { useUIStore } from '@/lib/stores/ui-store'
import { usePermissions } from '@/lib/hooks/use-permissions'
import {
  navegacionParaUsuario,
  navItemPorHref,
  type NavItem,
} from '@/lib/constants/navegacion'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Icon } from '@/components/icon'
import { cn } from '@/lib/utils'

/**
 * Sidebar de NORA HQ (F6.5.T3) — 8 pilares agrupados, filtrados por rol.
 *
 * Reemplaza el modelo "departamento activo → submenú". Muestra todos los
 * grupos accesibles, con favoritos/recientes arriba y colapso persistido.
 * Los contadores de badge se pasan por `badgeCounts` (slot listo; 0 = oculto).
 */
export function Sidebar({
  badgeCounts: badgeCountsProp = {},
}: {
  badgeCounts?: Record<string, number>
}) {
  const pathname = usePathname() || ''
  const { rol, permisosCustom } = usePermissions()
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>(badgeCountsProp)

  // Contadores dinámicos de badges (mis pendientes, verificaciones, aprobaciones).
  useEffect(() => {
    let alive = true
    fetch('/api/admin/badge-counts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j && typeof j === 'object') setBadgeCounts(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [pathname])
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleSidebar)
  const recientes = useUIStore((s) => s.recientes)
  const favoritos = useUIStore((s) => s.favoritos)
  const isFavorito = useUIStore((s) => s.isFavorito)
  const addFavorito = useUIStore((s) => s.addFavorito)
  const removeFavorito = useUIStore((s) => s.removeFavorito)
  const pushReciente = useUIStore((s) => s.pushReciente)
  const isHydrated = useUIStore((s) => s.isHydrated)

  const grupos = navegacionParaUsuario(rol, permisosCustom)

  useEffect(() => {
    if (!isHydrated) return
    const item = navItemPorHref(pathname)
    if (item) pushReciente(item.href, item.label)
  }, [pathname, isHydrated, pushReciente])

  const itemsFav = favoritos
    .map((p) => navItemPorHref(p))
    .filter((i): i is NavItem => Boolean(i))
  const itemsRec = recientes.slice(0, 4)

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        role="navigation"
        aria-label="Navegación NORA HQ"
        className={cn(
          'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Pilares">
          {/* Recientes */}
          {!collapsed && itemsRec.length > 0 && (
            <SidebarSection title="Recientes" icon={<Clock className="size-3" />}>
              {itemsRec.map((r) => (
                <Link
                  key={r.path}
                  href={r.path}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  <span className="truncate">{r.label}</span>
                </Link>
              ))}
            </SidebarSection>
          )}

          {/* Favoritos */}
          {!collapsed && itemsFav.length > 0 && (
            <SidebarSection title="Favoritos" icon={<Star className="size-3" />}>
              {itemsFav.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <Icon name={f.icon} className="size-3" />
                  <span className="truncate">{f.label}</span>
                </Link>
              ))}
            </SidebarSection>
          )}

          {/* Pilares */}
          {grupos.map((g) => (
            <div key={g.grupo} className="mb-3">
              {!collapsed && (
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {g.grupo}
                </div>
              )}
              <ul className="flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <SidebarItem
                    key={it.href}
                    item={it}
                    pathname={pathname}
                    collapsed={collapsed}
                    count={it.badge ? badgeCounts[it.badge] ?? 0 : 0}
                    fav={isFavorito(it.href)}
                    onFav={() =>
                      isFavorito(it.href)
                        ? removeFavorito(it.href)
                        : addFavorito(it.href)
                    }
                    onNavigate={() => pushReciente(it.href, it.label)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Toggle colapsar */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={cn(
              'h-8 w-full justify-start text-xs text-muted-foreground',
              collapsed && 'justify-center',
            )}
            aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
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
    <div className="mb-3 border-b border-border pb-2">
      <div className="mb-1 flex items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function SidebarItem({
  item,
  pathname,
  collapsed,
  count,
  fav,
  onFav,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  count: number
  fav: boolean
  onFav: () => void
  onNavigate: () => void
}) {
  const estado = item.estado ?? 'activo'
  const isExterno = estado === 'externo'
  const isFase2 = estado === 'fase2'
  const isPlace = estado === 'placeholder'
  const disabled = isFase2 || isPlace

  const isActive =
    !disabled &&
    !isExterno &&
    (pathname === item.href || pathname.startsWith(item.href + '/'))

  const cls = cn(
    'group relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors',
    isActive
      ? 'bg-nora-bg font-medium text-primary'
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
          {count > 0 && (
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
              {count > 99 ? '99+' : count}
            </span>
          )}
          {isFase2 && (
            <span className="ml-auto rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
              Pronto
            </span>
          )}
        </>
      )}
    </>
  )

  let node: React.ReactNode
  if (isExterno) {
    node = (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
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
        href={item.href}
        className={cls}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
      >
        {inner}
      </Link>
    )
  }

  const wrappedNode = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{node as React.ReactElement}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  ) : (
    node
  )

  return (
    <li className="relative">
      {wrappedNode}
      {!collapsed && !disabled && !isExterno && (
        <button
          type="button"
          aria-label={
            fav
              ? `Quitar ${item.label} de favoritos`
              : `Marcar ${item.label} como favorito`
          }
          onClick={onFav}
          className={cn(
            'absolute right-1 top-1.5 rounded-sm p-1 text-muted-foreground/0 transition-all hover:bg-accent hover:text-foreground group-hover:text-muted-foreground/60',
            fav && 'text-yellow-500 group-hover:text-yellow-500',
          )}
        >
          {fav ? (
            <Star className="size-3 fill-current" />
          ) : (
            <StarOff className="size-3" />
          )}
        </button>
      )}
    </li>
  )
}
