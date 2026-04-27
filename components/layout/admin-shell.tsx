'use client'

import { ReactNode } from 'react'
import { SucursalSelector } from '@/components/layout/sucursal-selector'
import { PeriodSelector } from '@/components/layout/period-selector'
import type { HubProfile } from '@/lib/admin-hub/auth'

/**
 * Shell del Admin (admin)/.
 *
 * **T-C.1**: shell mínimo con barra superior que contiene los
 * selectores globales. El TopNav con departamentos + UserMenu +
 * Notifications + Sidebar contextual se monta en T-C.2.
 *
 * El sidebar va a ocupar el espacio izquierdo en T-C.2 (hoy
 * `<main>` toma todo el ancho).
 */
export function AdminShell({
  profile: _profile,
  children,
}: {
  profile: HubProfile
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <div className="size-2.5 rounded-full bg-primary" aria-hidden />
          <div className="text-sm font-bold tracking-tight">Social Ahorro</div>
          <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
            Admin
          </span>
        </div>

        {/* Espacio donde T-C.2 monta los departamentos del TopNav */}
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <SucursalSelector />
          <PeriodSelector />
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
