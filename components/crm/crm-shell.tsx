'use client'

import { type ReactNode } from 'react'

import { useCrmUser } from '@/lib/hooks/use-crm-user'
import { CrmSidebar } from '@/components/crm/crm-sidebar'
import { CrmTopBar } from '@/components/crm/crm-top-bar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Shell del CRM viejo (todo lo que no es app/(admin)/).
 *
 * Carga el user client-side via useCrmUser y filtra el sidebar por rol.
 * Mientras carga muestra un esqueleto. Si no hay user válido, el
 * middleware ya se encarga de redirigir a /login — acá no renderizamos
 * nada para evitar flashear contenido sin autorización.
 */
export function CrmShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCrmUser()

  if (isLoading) return <CrmShellSkeleton />
  if (!user) return null

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <CrmTopBar user={user} role={user.role} />
        <div className="flex flex-1">
          <CrmSidebar role={user.role} />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}

function CrmShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
        <Skeleton className="size-8 rounded-md lg:hidden" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="ml-auto hidden h-9 w-64 sm:block" />
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="size-9 rounded-full" />
      </header>
      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 lg:flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </aside>
        <main className="flex-1 p-6">
          <Skeleton className="mb-3 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    </div>
  )
}
