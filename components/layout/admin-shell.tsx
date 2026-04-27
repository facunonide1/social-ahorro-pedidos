'use client'

import { ReactNode, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSucursalStore } from '@/lib/stores/sucursal-store'
import { useNotificationsStore } from '@/lib/stores/notifications-store'
import { deptFromPath } from '@/lib/utils/departamento-from-path'
import { TopNav } from '@/components/layout/top-nav'
import { Sidebar } from '@/components/layout/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { HubProfile } from '@/lib/admin-hub/auth'

/**
 * Shell del Admin (admin)/.
 *
 * - TopNav con departamentos + selectores + user menu (sticky).
 * - Sidebar contextual con submenús del depto activo (sticky).
 * - Carga inicial: `loadSucursales()` + `subscribe(profile.id)` para
 *   notificaciones realtime. Cleanup `unsubscribe()` al desmontar.
 *
 * Server-to-client serialization: `profile` viene del layout server
 * después del auth guard.
 */
export function AdminShell({
  profile,
  children,
}: {
  profile: HubProfile
  children: ReactNode
}) {
  const pathname = usePathname() || '/admin'
  const deptActivo = deptFromPath(pathname)

  const loadSucursales = useSucursalStore((s) => s.loadSucursales)
  const isHydratedSuc  = useSucursalStore((s) => s.isHydrated)
  const subscribe      = useNotificationsStore((s) => s.subscribe)
  const unsubscribe    = useNotificationsStore((s) => s.unsubscribe)

  // Catálogo de sucursales — una vez hidratado el store.
  useEffect(() => {
    if (isHydratedSuc) loadSucursales()
  }, [isHydratedSuc, loadSucursales])

  // Suscripción realtime a notificaciones del usuario.
  useEffect(() => {
    if (!profile.id) return
    subscribe(profile.id)
    return () => {
      unsubscribe()
    }
  }, [profile.id, subscribe, unsubscribe])

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <TopNav profile={profile} />
        <div className="flex flex-1">
          <Sidebar deptActivo={deptActivo} />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
