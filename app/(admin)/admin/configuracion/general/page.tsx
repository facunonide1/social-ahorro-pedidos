import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'

import { DemoSection } from './demo-section'
import { DemoMaestroSection } from './demo-maestro-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configuración general' }

export default async function GeneralPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  return (
    <>
      <PageHeader
        title="Configuración general"
        description="Ajustes del sistema y datos de demostración."
        breadcrumbs={[{ label: 'Administración' }, { label: 'General' }]}
      />
      <div className="space-y-6 p-4 md:p-6">
        <DemoMaestroSection />
        <DemoSection />
      </div>
    </>
  )
}
