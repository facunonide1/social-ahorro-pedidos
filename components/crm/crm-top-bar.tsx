'use client'

import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
import { toast } from 'sonner'

import type { CrmUser } from '@/lib/hooks/use-crm-user'
import type { CrmRole } from '@/components/crm/crm-nav-config'

import { Button } from '@/components/ui/button'
import { CrmMobileSidebarSheet } from '@/components/crm/crm-sidebar'
import { CrmUserMenu } from '@/components/crm/crm-user-menu'

export function CrmTopBar({ user, role }: { user: CrmUser; role: CrmRole }) {
  function notReady(label: string) {
    toast.message(label, { description: 'Próximamente.' })
  }

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
        <CrmMobileSidebarSheet role={role} />

        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm font-bold tracking-tight"
        >
          <span className="size-2.5 rounded-full bg-primary" aria-hidden />
          <span>SA Pedidos</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <button
            type="button"
            onClick={() => notReady('Búsqueda global')}
            className="hidden h-9 w-64 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/40 sm:flex"
            aria-label="Buscar"
          >
            <Search className="size-3.5" />
            <span>Buscar...</span>
            <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="size-9 sm:hidden"
            aria-label="Buscar"
            onClick={() => notReady('Búsqueda global')}
          >
            <Search className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative size-9"
            aria-label="Notificaciones"
            onClick={() => notReady('Notificaciones')}
          >
            <Bell className="size-4" />
          </Button>

          <CrmUserMenu user={user} />
        </div>
      </div>
    </header>
  )
}
