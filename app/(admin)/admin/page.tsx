import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ROLES_TRANSVERSALES } from '@/lib/types/admin'
import {
  NAVEGACION_DEPARTAMENTAL,
  departamentosPermitidos,
} from '@/lib/constants/navegacion'
import { DEPARTAMENTOS_ORDER } from '@/lib/constants/departamentos'
import { DepartmentCard } from '@/components/layout/department-card'

export const dynamic = 'force-dynamic'

/**
 * Home del Admin ERP.
 *
 * - Roles transversales (super_admin/gerente/auditor): saludo +
 *   placeholder del dashboard ejecutivo.
 * - Roles operativos: grilla con los departamentos accesibles.
 *
 * El dashboard ejecutivo real con KPIs/charts viene en sub-tandas
 * posteriores.
 */
export default async function AdminDashboardPage() {
  const profile = await requireAdminHubAccess()
  const nombre = profile.nombre?.split(' ')[0] || profile.email.split('@')[0]
  const esTransversal = ROLES_TRANSVERSALES.includes(profile.rol)
  const deps = departamentosPermitidos(profile.rol)
    .sort((a, b) => DEPARTAMENTOS_ORDER.indexOf(a.id) - DEPARTAMENTOS_ORDER.indexOf(b.id))

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Hola, {nombre} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {esTransversal
            ? 'Bienvenido al ERP. El dashboard ejecutivo se va a llenar con KPIs y reportes en las próximas sub-tandas.'
            : 'Bienvenido al ERP. Elegí un departamento para arrancar.'}
        </p>
      </header>

      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Departamentos accesibles"
      >
        {deps.map((d) => {
          const full = NAVEGACION_DEPARTAMENTAL[d.id]
          return <DepartmentCard key={d.id} dept={full} />
        })}
      </section>
    </div>
  )
}
