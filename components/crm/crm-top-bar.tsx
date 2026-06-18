'use client'

import Link from 'next/link'

import type { CrmUser } from '@/lib/hooks/use-crm-user'
import type { CrmRole } from '@/components/crm/crm-nav-config'

import { CrmMobileSidebarSheet } from '@/components/crm/crm-sidebar'
import { CrmSearch } from '@/components/crm/crm-search'
import { CrmUserMenu } from '@/components/crm/crm-user-menu'
import { NotificationsBell } from '@/components/crm/notifications-bell'

export function CrmTopBar({ user, role }: { user: CrmUser; role: CrmRole }) {
  return (
    <header
      role="banner"
      className="border-b border-border bg-background"
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

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <CrmSearch variant="header" />
          <NotificationsBell userId={user.id} role={role} />
          <CrmUserMenu user={user} />
        </div>
      </div>
    </header>
  )
}
