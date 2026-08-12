import { PageHeader } from '@/components/shared/page-header'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import ImportarClient from '../importar-client'

export const dynamic = 'force-dynamic'

export default async function ImportarListaPage() {
  const perfil = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'comprador'],
  })
  const sb = createClient()
  const [{ data: puntos }, { data: listas }] = await Promise.all([
    sb.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
    sb.from('cnt_listas').select('id, zona').eq('activa', true).order('zona'),
  ])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Importar una lista de conteo"
        description="Una zona por planilla. Se importa una vez y se reutiliza todas las veces que se cuente."
      />
      <ImportarClient
        puntos={(puntos ?? []) as { id: string; nombre: string }[]}
        listas={(listas ?? []) as { id: string; zona: string }[]}
        // El punto de quien importa, precargado. Una lista sin punto obliga a
        // que lo tenga el usuario que cuenta, y si tampoco lo tiene el conteo
        // no puede empezar: mejor que venga puesto y se cambie a mano.
        puntoPorDefecto={perfil.sucursal_id ?? null}
      />
    </div>
  )
}
