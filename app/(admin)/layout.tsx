import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { OsShell } from '@/components/os/os-shell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'NORA OS', template: '%s · NORA OS' },
  description: 'El sistema operativo del negocio · Social Ahorro',
}

export const viewport: Viewport = {
  themeColor: '#6E3CDB',
}

/**
 * Layout raíz del Admin ERP `(admin)/*` — ahora NORA OS.
 *
 * Auth guard server-side (`requireAdminHubAccess`) → `<OsShell>` (dock + Mission
 * Control + ⌘K + acciones). El shell envuelve las 110 páginas existentes sin
 * reescribirlas; filtra el dock/acciones por los permisos 18×5 del usuario.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireAdminHubAccess()
  return <OsShell profile={profile}>{children}</OsShell>
}
