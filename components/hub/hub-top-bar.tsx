'use client'

import Link from 'next/link'

import type { HubProfile } from '@/lib/admin-hub/auth'

import { HubMobileSidebarSheet } from '@/components/hub/hub-sidebar'
import { HubUserMenu } from '@/components/hub/hub-user-menu'

export function HubTopBar({ profile }: { profile: HubProfile }) {
  return (
    <header
      role="banner"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-4">
        <HubMobileSidebarSheet role={profile.rol} />

        <Link
          href="/hub"
          className="flex items-center gap-2 text-sm font-bold tracking-tight"
        >
          <span className="size-2.5 rounded-full bg-primary" aria-hidden />
          <span>SA Hub</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <HubUserMenu profile={profile} />
        </div>
      </div>
    </header>
  )
}
