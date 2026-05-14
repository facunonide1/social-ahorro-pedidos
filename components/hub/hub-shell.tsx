import { type ReactNode } from 'react'

import type { HubProfile } from '@/lib/admin-hub/auth'

import { AiChatDock } from '@/components/ai/ai-chat-dock'
import { HubSidebar } from '@/components/hub/hub-sidebar'
import { HubTopBar } from '@/components/hub/hub-top-bar'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Shell del Admin Hub legacy (todo lo bajo /hub/*).
 *
 * Server-side: recibe el profile ya validado por requireAdminHubAccess()
 * y arma topbar + sidebar + main. Las piezas interactivas (mobile sheet,
 * user menu, theme switcher, collapse) viven en componentes cliente.
 */
export function HubShell({
  profile,
  children,
}: {
  profile: HubProfile
  children: ReactNode
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <HubTopBar profile={profile} />
        <div className="flex flex-1">
          <HubSidebar role={profile.rol} />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
        <AiChatDock />
      </div>
    </TooltipProvider>
  )
}
