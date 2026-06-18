'use client'

import type { HubProfile } from '@/lib/admin-hub/auth'

import { CrmSearch } from '@/components/crm/crm-search'
import { NotificationsBell } from '@/components/crm/notifications-bell'
import { HubMobileSidebarSheet } from '@/components/hub/hub-sidebar'
import { HubUserMenu } from '@/components/hub/hub-user-menu'
import { NoraBrand } from '@/components/nora/nora-brand'

export function HubTopBar({ profile }: { profile: HubProfile }) {
  return (
    <header
      role="banner"
      className="border-b border-border bg-background"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
        <HubMobileSidebarSheet role={profile.rol} />

        <div className="min-w-0 shrink">
          <NoraBrand size="sm" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <CrmSearch variant="header" />
          <NotificationsBell userId={profile.id} adminRole={profile.rol} />
          <HubUserMenu profile={profile} />
        </div>
      </div>
    </header>
  )
}
