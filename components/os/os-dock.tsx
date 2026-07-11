'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal, LogOut, UserCircle } from 'lucide-react'

import { NoraLogo } from '@/components/nora/nora-logo'
import { Icon } from '@/components/icon'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { useSucursalGlobal } from '@/lib/hooks/use-sucursal-global'
import { subAppsVisibles, subAppDeRuta, type BadgeResult } from '@/lib/os/subapps'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { HubProfile } from '@/lib/admin-hub/auth'
import { cn } from '@/lib/utils'

const MAX_VISIBLES = 8

const SEV_CLS: Record<'info' | 'warn' | 'danger', string> = {
  info: 'bg-sky-500',
  warn: 'bg-amber-500',
  danger: 'bg-rose-500',
}

/**
 * NORA OS · dock lateral (desktop). Rail fino solo-íconos, siempre visible:
 * monograma NORA (→ Mission Control) · sub-apps filtradas por permisos con badge
 * vivo (máx 8 + "más") · avatar con popover de perfil/sucursal/salir.
 */
export function OsDock({ profile }: { profile: HubProfile }) {
  const pathname = usePathname() || '/admin'
  const { rol, permisosCustom } = usePermissions()
  const [badges, setBadges] = useState<Record<string, BadgeResult>>({})

  const apps = useMemo(() => subAppsVisibles(rol, permisosCustom), [rol, permisosCustom])
  const activa = useMemo(() => subAppDeRuta(pathname), [pathname])
  const visibles = apps.slice(0, MAX_VISIBLES)
  const resto = apps.slice(MAX_VISIBLES)

  useEffect(() => {
    let alive = true
    fetch('/api/os/badges', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j && typeof j === 'object') setBadges(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [pathname])

  return (
    <aside
      className="sticky top-0 z-30 hidden h-screen w-16 shrink-0 flex-col items-center border-r border-border bg-background py-3 lg:flex"
      aria-label="NORA OS"
    >
      {/* Monograma → Mission Control */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/admin" aria-label="Mission Control" className={cn('mb-3 flex size-10 items-center justify-center rounded-xl transition-colors', pathname === '/admin' && 'bg-nora-bg')}>
            <NoraLogo size="md" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Mission Control</TooltipContent>
      </Tooltip>

      {/* Sub-apps */}
      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto" aria-label="Sub-apps">
        {visibles.map((app) => (
          <DockIcon key={app.id} ruta={app.rutaHome} icono={app.icono} nombre={app.nombre} activo={activa?.id === app.id} badge={badges[app.id]} acento={app.acento} />
        ))}

        {resto.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/60" aria-label="Más sub-apps">
                <MoreHorizontal className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-56 p-1.5">
              <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Más</div>
              {resto.map((app) => (
                <Link key={app.id} href={app.rutaHome} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/60">
                  <Icon name={app.icono} className="size-4" style={{ color: app.acento }} />
                  <span>{app.nombre}</span>
                  {badges[app.id] && <span className={cn('ml-auto rounded-full px-1.5 text-[10px] font-bold text-white', SEV_CLS[badges[app.id]!.severidad])}>{badges[app.id]!.count}</span>}
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </nav>

      {/* Usuario */}
      <Popover>
        <PopoverTrigger asChild>
          <button className="mt-2 rounded-full ring-offset-background transition hover:ring-2 hover:ring-nora/40 hover:ring-offset-2" aria-label="Tu cuenta">
            <Avatar className="size-9">
              <AvatarFallback className="bg-nora-bg text-sm font-semibold text-primary">{inicial(profile)}</AvatarFallback>
            </Avatar>
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-60 p-0">
          <div className="border-b border-border p-3">
            <div className="text-sm font-semibold">{profile.nombre || profile.email}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{ADMIN_ROLE_LABELS[profile.rol]}</div>
            <SucursalLinea />
          </div>
          <div className="p-1.5">
            <Link href="/admin/mi-panel" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/60">
              <UserCircle className="size-4" /> Mi panel
            </Link>
            <a href="/logout" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10">
              <LogOut className="size-4" /> Cerrar sesión
            </a>
          </div>
        </PopoverContent>
      </Popover>
    </aside>
  )
}

function DockIcon({ ruta, icono, nombre, activo, badge, acento }: {
  ruta: string; icono: string; nombre: string; activo: boolean; badge: BadgeResult; acento: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={ruta}
          aria-label={nombre}
          className={cn('relative flex size-11 items-center justify-center rounded-xl transition-colors', activo ? 'bg-nora-bg text-primary' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground')}
        >
          <Icon name={icono} className="size-5" style={activo ? { color: acento } : undefined} />
          {badge && (
            <span className={cn('absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white', SEV_CLS[badge.severidad])}>
              {badge.count > 99 ? '99+' : badge.count}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{nombre}</TooltipContent>
    </Tooltip>
  )
}

function SucursalLinea() {
  const { sucursalActivaData, isAllSucursales } = useSucursalGlobal()
  return (
    <div className="mt-1.5 text-xs text-muted-foreground">
      Sucursal: <span className="font-medium text-foreground">{isAllSucursales ? 'Todas' : sucursalActivaData?.nombre ?? '—'}</span>
    </div>
  )
}

function inicial(p: HubProfile): string {
  const s = p.nombre || p.email || '?'
  return s.trim().charAt(0).toUpperCase()
}
