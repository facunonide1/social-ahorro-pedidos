import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserPedidos } from '@/lib/types'

import { CrmShell } from '@/components/crm/crm-shell'
import { PageHeader } from '@/components/shared/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import MfaSection from './mfa'
import ProfileCard from './profile-card'
import PasswordCard from './password-card'
import SessionCard from './session-card'

export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')

  return (
    <CrmShell>
      <PageHeader title="Mi cuenta" description="Información de tu perfil" />
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        <ProfileCard profile={profile} />

        <PasswordCard email={profile.email} />

        <Card>
          <CardHeader>
            <CardTitle>Verificación en dos pasos</CardTitle>
            <CardDescription>
              Sumá un código adicional desde tu app autenticadora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MfaSection />
          </CardContent>
        </Card>

        <SessionCard />
      </div>
    </CrmShell>
  )
}
