import { ShieldAlert, EyeOff, Package } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { Regla9Client } from './regla-9-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Regla 9 · revisar los canales' }

/**
 * LO QUE NO SE PUEDE OFRECER, PARA CRUZAR CONTRA LO QUE YA SE SUBIÓ.
 *
 * ── POR QUÉ EXISTE ESTA PANTALLA ────────────────────────────────────────────
 *
 * Hasta v0.91, 29.663 productos no tenían condición de venta en NORA — el dato
 * estaba en el archivo y nunca se copió al catálogo. En ese período se subieron
 * archivos de alta a canales que NORA no generó y de los que no tiene registro.
 *
 * NORA no puede verificar un archivo que no hizo. Lo que sí puede es entregar la
 * lista contra la cual cruzarlo.
 *
 * NORA no despublica nada: propone, una persona confirma.
 */
export default async function Regla9Page() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { filas, truncado } = await paginar<any>(
    sb.from('no_publicables_para_revisar')
      .select('*').order('condicion_venta').order('sku'),
    { maximo: 20_000 },
  )

  const invisibles = filas.filter((f) => !f.visible_antes_de_v091).length
  const controlados = filas.filter((f) => f.lista_controlado).length

  return (
    <>
      <PageHeader
        title="Regla 9 · qué revisar en los canales"
        description="Productos que SIFACO declara con receta o controlados, con stock y código de barras. Son los que pueden haberse colado en un archivo de alta."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Regla 9' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertDescription className="space-y-1.5 text-xs leading-snug">
            <p>
              <b>NORA no tiene registro de los archivos que se subieron a mano a un canal.</b> No
              puede verificar un archivo que no generó. Esta lista es contra qué cruzarlo.
            </p>
            <p>
              De los {filas.length.toLocaleString('es-AR')} de acá, <b>{invisibles.toLocaleString('es-AR')} eran
              invisibles para la regla 9</b> antes de v0.91: su condición de venta estaba en el
              archivo del maestro y no en el catálogo. Un archivo generado en ese período no tenía
              cómo excluirlos.
            </p>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard label="No publicables con stock y barras" value={filas.length} icon={Package} />
          <KpiCard label="Invisibles antes de v0.91" value={invisibles} icon={EyeOff}
            variant={invisibles > 0 ? 'warning' : 'default'}
            footer="Su condición estaba en el archivo, no en NORA." />
          <KpiCard label="Controlados (lista declarada)" value={controlados} icon={ShieldAlert}
            variant={controlados > 0 ? 'danger' : 'default'} />
        </div>

        {truncado && (
          <p className="text-xs text-destructive">
            La lista se cortó en 20.000 filas. Hay más.
          </p>
        )}

        <Regla9Client filas={filas} />
      </div>
    </>
  )
}
