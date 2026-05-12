import { AuthShell } from '@/components/crm/auth-shell'
import BootstrapForm from './form'

export const dynamic = 'force-dynamic'

export default function BootstrapPage() {
  return (
    <AuthShell
      brand="Social Ahorro · Admin"
      subtitle="Configuración inicial · una sola vez"
      maxWidth="md"
    >
      <BootstrapForm />
    </AuthShell>
  )
}
