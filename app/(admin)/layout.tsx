import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { AdminShell } from '@/components/layout/admin-shell'
import { SucursalScopeBadge } from '@/components/shared/sucursal-scope-badge'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'NORA HQ', template: '%s · NORA HQ' },
  description: 'El centro de mando inteligente de Social Ahorro',
}

export const viewport: Viewport = {
  themeColor: '#7c3aed',
}

/**
 * Layout raíz del nuevo Admin ERP `(admin)/*`.
 *
 * - Auth guard server-side via `requireAdminHubAccess()` (creado en
 *   T-A original; redirige a /login si no hay sesión activa, y a
 *   /logout?reason=sin_permiso si el user no está en `users_admin` o
 *   no está activo).
 * - Pasa el `profile` al `<AdminShell>` cliente, que monta los
 *   selectores y (en T-C.2) el TopNav + Sidebar.
 *
 * Convive con `app/hub/*` (legacy) durante la transición.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireAdminHubAccess()
  return (
    <AdminShell profile={profile} scopeBadge={<SucursalScopeBadge />}>
      {children}
    </AdminShell>
  )
}
