'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home } from 'lucide-react'

import { NoraBrand } from '@/components/nora/nora-brand'
import { NotificationsTrigger } from '@/components/layout/notifications-trigger'
import { UserMenu } from '@/components/layout/user-menu'
import { Button } from '@/components/ui/button'
import type { HubProfile } from '@/lib/admin-hub/auth'

/**
 * Top bar mínima para la vista simple (roles operativos · v0.35).
 *
 * Sin sidebar, sin selectores ni buscador: marca (vuelve al home), un botón
 * "Inicio" cuando no está en el home, notificaciones y menú de usuario. La
 * navegación real ocurre por los botones grandes del home.
 */
export function SimpleTopBar({ profile }: { profile: HubProfile }) {
  const pathname = usePathname() || '/admin'
  const enHome = pathname === '/admin'

  return (
    <header role="banner" className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <NoraBrand size="sm" />

        {!enHome && (
          <Button asChild variant="ghost" size="sm" className="ml-1 gap-1.5">
            <Link href="/admin">
              <Home className="size-4" />
              <span className="hidden sm:inline">Inicio</span>
            </Link>
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <NotificationsTrigger />
          <UserMenu profile={profile} />
        </div>
      </div>
    </header>
  )
}
