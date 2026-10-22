import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { ELENCO } from '@/lib/agentes/elenco'
import { PageHeader } from '@/components/shared/page-header'

import { AgentesConfigClient } from './agentes-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Qué puede hacer cada agente' }

/**
 * HASTA DÓNDE PUEDE ACTUAR CADA AGENTE.
 *
 * Facundo lo contestó así: «se define desde el sistema», igual que los
 * permisos de usuario. Entonces es una matriz, no una preferencia global.
 *
 * ── POR QUÉ EL DESGLOSE POR ACCIÓN ──────────────────────────────────────────
 *
 * «Abasto puede comprar» no se puede contestar con sí o no. Armar el pedido,
 * sacar del pedido lo que hay en otra sucursal, proponer una transferencia y
 * emitir la orden son cuatro cosas con cuatro riesgos distintos, y la única
 * que compromete plata es la última. Un interruptor por agente obligaría a
 * elegir entre apagarlo todo o habilitar lo que no se quiere.
 */
export default async function AgentesConfigPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()

  const [{ data: config }, { data: sucs }, { data: constitucion }, { data: intentos }] =
    await Promise.all([
      sb.from('agente_config').select('*'),
      sb.from('sucursales').select('id, nombre, codigo').eq('activa', true)
        .eq('es_ecommerce', false).order('codigo'),
      sb.from('constitucion_acciones').select('*').order('accion'),
      sb.from('intentos_bloqueados').select('*').order('intento_at', { ascending: false }).limit(20),
    ])

  return (
    <>
      <PageHeader
        title="Qué puede hacer cada agente"
        description="Por acción, no por agente: armar un pedido y emitirlo son dos cosas con dos riesgos."
        breadcrumbs={[{ label: 'Configuración', href: '/admin/configuracion' }, { label: 'Agentes' }]}
      />
      <div className="p-4 md:p-6">
        <AgentesConfigClient
          elenco={ELENCO}
          config={(config ?? []) as any[]}
          sucursales={(sucs ?? []) as any[]}
          constitucion={(constitucion ?? []) as any[]}
          intentos={(intentos ?? []) as any[]}
        />
      </div>
    </>
  )
}
