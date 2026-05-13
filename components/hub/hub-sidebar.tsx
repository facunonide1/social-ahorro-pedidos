'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronsLeft,
  ChevronsRight,
  ExternalLink as ExtLinkIcon,
  Menu,
} from 'lucide-react'

import {
  visibleHubSections,
  CRM_PEDIDOS_LINK,
  ADMIN_PANEL_LINK,
  type HubNavItem,
  type HubNavSection,
} from '@/components/hub/hub-nav-config'
import type { AdminRole } from '@/lib/types/admin'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'hub-sidebar-collapsed'

function isItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/') return false
  return pathname.startsWith(href + '/')
}

export function HubSidebar({ role }: { role: AdminRole }) {
  const pathname = usePathname() || ''
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_KEY)
      if (stored === 'true') setCollapsed(true)
    } catch {
      /* ignorar */
    }
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        /* ignorar */
      }
      return next
    })
  }

  const sections = visibleHubSections(role)
  const showAdmin = !ADMIN_PANEL_LINK.roles || ADMIN_PANEL_LINK.roles.includes(role)

  return (
    <aside
      role="navigation"
      aria-label="Navegación Hub"
      className={cn(
        'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <SidebarSection
            key={section.label}
            section={section}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}

        <div className="mt-2 border-t border-sidebar-border pt-2 space-y-0.5">
          <SidebarLink
            item={CRM_PEDIDOS_LINK}
            active={false}
            collapsed={collapsed}
            external
            hint={CRM_PEDIDOS_LINK.hint}
          />
          {showAdmin && (
            <SidebarLink
              item={ADMIN_PANEL_LINK}
              active={false}
              collapsed={collapsed}
              external
              hint={ADMIN_PANEL_LINK.hint}
            />
          )}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className={cn(
            'h-8 w-full justify-start text-xs text-muted-foreground hover:bg-sidebar-accent',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span>Colapsar</span>}
        </Button>
      </div>
    </aside>
  )
}

function SidebarSection({
  section,
  pathname,
  collapsed,
}: {
  section: HubNavSection
  pathname: string
  collapsed: boolean
}) {
  return (
    <div className="mb-3 last:mb-0">
      {!collapsed && (
        <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {section.label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <li key={item.href}>
            <SidebarLink
              item={item}
              active={isItemActive(pathname, item.href)}
              collapsed={collapsed}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SidebarLink({
  item,
  active,
  collapsed,
  external = false,
  hint,
}: {
  item: HubNavItem
  active: boolean
  collapsed: boolean
  external?: boolean
  hint?: string
}) {
  const Icon = item.icon
  const cls = cn(
    'group relative flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1.5 before:h-6 before:w-0.5 before:rounded-r before:bg-primary'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
    collapsed && 'justify-center px-0',
  )

  const inner = (
    <>
      <Icon className="size-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {external && <ExtLinkIcon className="ml-auto size-3 opacity-60" />}
        </>
      )}
    </>
  )

  const node = (
    <Link href={item.href} className={cls} aria-current={active ? 'page' : undefined}>
      {inner}
    </Link>
  )

  if (!collapsed) return node

  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="font-medium">{item.label}</span>
        {hint && <span className="ml-1 text-muted-foreground/80">· {hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/** Trigger + sheet con la nav hub completa, para mobile (< lg). */
export function HubMobileSidebarSheet({ role }: { role: AdminRole }) {
  const pathname = usePathname() || ''
  const sections = visibleHubSections(role)
  const showAdmin = !ADMIN_PANEL_LINK.roles || ADMIN_PANEL_LINK.roles.includes(role)

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 lg:hidden"
          aria-label="Abrir menú Hub"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
        <div className="border-b border-sidebar-border p-4">
          <SheetTitle className="text-base">Hub administrativo</SheetTitle>
          <SheetDescription className="text-xs">
            Social Ahorro · Compras y finanzas
          </SheetDescription>
        </div>
        <nav className="flex flex-col gap-3 p-2">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </div>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <MobileLink
                      item={item}
                      active={isItemActive(pathname, item.href)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="border-t border-sidebar-border pt-2 space-y-0.5">
            <MobileLink item={CRM_PEDIDOS_LINK} active={false} external />
            {showAdmin && <MobileLink item={ADMIN_PANEL_LINK} active={false} external />}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

function MobileLink({
  item,
  active,
  external = false,
}: {
  item: HubNavItem
  active: boolean
  external?: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {external && <ExtLinkIcon className="size-3.5 opacity-60" />}
    </Link>
  )
}
