'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Plus } from 'lucide-react'

import { useSucursalStore } from '@/lib/stores/sucursal-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { AiChatDock } from '@/components/ai/ai-chat-dock'
import { NoraBrand } from '@/components/nora/nora-brand'
import { Icon } from '@/components/icon'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SucursalSelector } from '@/components/layout/sucursal-selector'
import { NotificationsTrigger } from '@/components/layout/notifications-trigger'
import { OsDock } from '@/components/os/os-dock'
import { MobileBottomBar } from '@/components/os/mobile-bottom-bar'
import { CommandPalette } from '@/components/os/command-palette'
import { QuickActionsMenu } from '@/components/os/quick-actions-menu'
import { DemandaModal } from '@/components/os/demanda-modal'
import { DespachoModal } from '@/components/os/despacho-modal'
import { PanicButton } from '@/components/os/panic-button'
import { subAppDeRuta } from '@/lib/os/subapps'
import type { HubProfile } from '@/lib/admin-hub/auth'
import { cn } from '@/lib/utils'

/**
 * NORA OS · shell persistente (v0.37-os-shell).
 *
 * Re-carcasa que envuelve TODO `/admin` sin reescribir sectores:
 *  - Dock lateral (desktop) / bottom bar (mobile).
 *  - Header global: sucursal global + ⌘K + "+".
 *  - Tira de módulos de la sub-app activa (navegación interna v1).
 *  - ⌘K universal + menú de acciones "+" + dock de NORA, montados globalmente.
 */
export function OsShell({ profile, children }: { profile: HubProfile; children: ReactNode }) {
  const pathname = usePathname() || '/admin'
  const [cmdkOpen, setCmdkOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)

  const loadSucursales = useSucursalStore((s) => s.loadSucursales)
  const isHydratedSuc = useSucursalStore((s) => s.isHydrated)
  const subscribe = useNotificationsStore((s) => s.subscribe)
  const unsubscribe = useNotificationsStore((s) => s.unsubscribe)

  const appActiva = useMemo(() => subAppDeRuta(pathname), [pathname])
  const enHome = pathname === '/admin'

  useEffect(() => { if (isHydratedSuc) loadSucursales() }, [isHydratedSuc, loadSucursales])

  useEffect(() => {
    if (!profile.id) return
    subscribe(profile.id)
    return () => { unsubscribe() }
  }, [profile.id, subscribe, unsubscribe])

  // ⌘K / Ctrl+K global.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdkOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background text-foreground">
        <OsDock profile={profile} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header global */}
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 md:px-4">
              {/* Marca (solo mobile — en desktop está el dock) + contexto */}
              <div className="flex items-center gap-2 lg:hidden">
                <NoraBrand size="sm" />
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                {enHome ? (
                  <span className="text-sm font-semibold">Mission Control</span>
                ) : appActiva ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon name={appActiva.icono} className="size-4" style={{ color: appActiva.acento }} />
                    {appActiva.nombre}
                  </span>
                ) : null}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden sm:block"><SucursalSelector /></div>
                <Button variant="outline" size="sm" onClick={() => setCmdkOpen(true)} className="h-9 gap-2 text-muted-foreground" aria-label="Buscar">
                  <Search className="size-3.5" />
                  <span className="hidden md:inline">Buscar…</span>
                  <kbd className="ml-1 hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums md:inline-flex">⌘K</kbd>
                </Button>
                <Button size="sm" onClick={() => setPlusOpen(true)} className="hidden h-9 gap-1.5 sm:inline-flex" aria-label="Acciones rápidas">
                  <Plus className="size-4" /> <span className="hidden md:inline">Acción</span>
                </Button>
                <NotificationsTrigger />
              </div>
            </div>

            {/* Tira de módulos de la sub-app activa */}
            {appActiva && appActiva.modulos.length > 1 && (
              <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-3 py-1.5 md:px-4" aria-label={`Módulos de ${appActiva.nombre}`}>
                {appActiva.modulos.map((m) => {
                  const active = pathname === m.ruta || pathname.startsWith(m.ruta + '/')
                  return (
                    <Link key={m.ruta} href={m.ruta} className={cn('shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors', active ? 'bg-nora-bg font-medium text-primary' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')}>
                      {m.nombre}
                    </Link>
                  )
                })}
              </nav>
            )}
          </header>

          <main className="flex-1 overflow-x-hidden pb-16 lg:pb-0">{children}</main>
        </div>

        <MobileBottomBar />

        {/* Botón de pánico (mobile, long-press) */}
        <PanicButton />

        {/* FAB "+" mobile */}
        <button
          type="button"
          onClick={() => setPlusOpen(true)}
          aria-label="Acciones rápidas"
          className="fixed bottom-20 right-4 z-30 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden"
        >
          <Plus className="size-5" />
        </button>

        <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
        <QuickActionsMenu open={plusOpen} onOpenChange={setPlusOpen} />
        <DemandaModal />
        <DespachoModal />
        <AiChatDock />
      </div>
    </TooltipProvider>
  )
}
