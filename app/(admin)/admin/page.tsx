import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ROLES_TRANSVERSALES } from '@/lib/types/admin'
import {
  NAVEGACION_DEPARTAMENTAL,
  departamentosPermitidos,
} from '@/lib/constants/navegacion'
import { DEPARTAMENTOS_ORDER } from '@/lib/constants/departamentos'
import { DepartmentCard } from '@/components/layout/department-card'
import { NoraBriefingCard } from './nora-briefing-card'
import { NoraPredictionsCard } from './nora-predictions-card'

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
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          Mission control · {fecha}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Hola, {nombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {esTransversal
            ? 'Centro de mando inteligente. Abajo el briefing del día.'
            : 'Centro de mando. Elegí un departamento para arrancar.'}
        </p>
      </header>

      {esTransversal && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <NoraBriefingCard />
          <NoraPredictionsCard />
        </div>
      )}

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
