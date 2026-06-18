import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type {
  CuentaBancariaPropia,
  ExtractoLineaPendiente,
} from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

import ConciliacionClient from './client'

export const dynamic = 'force-dynamic'

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: { cuenta?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria'],
  })
  const sb = createClient()

  const { data: cuentasRaw, error: cuentasErr } = await sb
    .from('cuentas_bancarias_propias')
    .select('id, nombre, banco, moneda, activa, tipo_cuenta, cbu, alias, observaciones, created_at, updated_at')
    .eq('activa', true)
    .order('nombre')

  const cuentas = (cuentasRaw ?? []) as CuentaBancariaPropia[]
  const cuentaId = searchParams.cuenta || cuentas[0]?.id || ''

  let lineas: ExtractoLineaPendiente[] = []
  if (cuentaId) {
    const { data } = await sb
      .from('extracto_lineas_pendientes')
      .select('*')
      .eq('cuenta_bancaria_id', cuentaId)
      .in('estado', ['pendiente', 'match_sugerido'])
      .order('fecha', { ascending: false })
      .limit(300)
    lineas = (data ?? []) as ExtractoLineaPendiente[]
  }

  return (
    <>
      <PageHeader
        title="Conciliación bancaria"
        description="Subí el extracto del banco y conciliá las líneas contra los movimientos del sistema."
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        {cuentasErr && (
          <Alert variant="destructive">
            <AlertDescription>
              {cuentasErr.message}
              {cuentasErr.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá las migraciones <code>0020</code> y <code>0023</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!cuentasErr && cuentas.length === 0 && (
          <Alert variant="warning">
            <AlertDescription>
              No hay cuentas bancarias activas. Creá una en Finanzas · Cuentas
              bancarias.
            </AlertDescription>
          </Alert>
        )}

        {cuentas.length > 0 && (
          <ConciliacionClient
            cuentas={cuentas}
            cuentaIdActiva={cuentaId}
            lineasIniciales={lineas}
          />
        )}
      </div>
    </>
  )
}
