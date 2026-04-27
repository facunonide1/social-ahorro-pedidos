import type { ReactNode } from 'react'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { AdminShell } from '@/components/layout/admin-shell'

export const dynamic = 'force-dynamic'

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
  return <AdminShell profile={profile}>{children}</AdminShell>
}
