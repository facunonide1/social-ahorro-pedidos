import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

export const dynamic = 'force-dynamic'

/**
 * Dashboard ejecutivo (placeholder de T-C.1).
 *
 * En T-C.2 se monta el sidebar contextual del depto Ejecutivo, y en
 * sub-tandas posteriores el dashboard se llena con KPIs y charts.
 */
export default async function AdminDashboardPage() {
  const profile = await requireAdminHubAccess()
  const nombre = profile.nombre?.split(' ')[0] || profile.email
  return (
    <div className="container mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="text-2xl font-bold tracking-tight">Hola, {nombre} 👋</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bienvenido al nuevo Admin ERP. Acá vamos a tener el dashboard ejecutivo
        cuando avancemos las próximas sub-tandas.
      </p>
    </div>
  )
}
