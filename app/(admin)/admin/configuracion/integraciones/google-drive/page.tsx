import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ingestaHabilitada, preciosAutoAplicar } from '@/lib/drive/flag'
import { avisoPlazo, venceEstimado } from '@/lib/drive/vencimiento'
import { resumenIngesta } from '@/lib/drive/correr'

import { DriveClient } from './drive-client'
import { EstadoIngesta } from './estado-ingesta'

function filaBandeja(b: any) {
  return {
    fileId: b.file_id as string,
    nombre: b.nombre as string,
    ruta: (b.ruta_relativa as string | null) ?? null,
    clasificacion: b.clasificacion as string,
    estado: b.estado as string,
    error: (b.error as string | null) ?? null,
    link: (b.web_view_link as string | null) || `https://drive.google.com/file/d/${b.file_id}/view`,
    matchPct: (b.match_pct as number | null) ?? null,
    intentos: Number(b.intentos ?? 0),
    megas: b.bytes == null ? null : Math.round(Number(b.bytes) / 1_048_576),
  }
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Google Drive' }

export default async function GoogleDrivePage({ searchParams }: { searchParams: { aviso?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin'] })
  const habilitada = ingestaHabilitada()
  const adm = createAdminClient()
  const resumen = habilitada ? await resumenIngesta(adm).catch(() => null) : null
  const c = resumen?.conexion
  const plazo = c?.connected_at ? avisoPlazo(new Date(), new Date(c.connected_at)) : 'ok'
  const vence = c?.connected_at ? venceEstimado(new Date(c.connected_at)).toISOString() : null

  return (
    <>
      <PageHeader
        title="Google Drive"
        description="Listas, facturas y maestros de las carpetas compartidas. Nada del maestro se aplica solo."
        breadcrumbs={[
          { label: 'Administración', href: '/admin/configuracion/general' },
          { label: 'Google Drive' },
        ]}
      />
      <div className="space-y-4 p-4 md:p-6">
        {/* El estado y «Procesar ahora» se ven aunque la ingesta esté apagada: ahí dice por qué. */}
        <EstadoIngesta />
        <DriveClient
          habilitada={habilitada}
          autoAplicar={preciosAutoAplicar()}
          aviso={searchParams.aviso ?? null}
          conexion={c ? {
            email: c.email_cuenta,
            estado: c.estado,
            connectedAt: c.connected_at,
            vence,
            plazo,
            lastSync: c.last_sync_at,
            lastError: c.last_error,
            listadoCompleto: c.listado_completo,
          } : null}
          carpetas={(resumen?.carpetas ?? []).map((x: any) => ({
            id: x.folder_id,
            nombre: x.folder_nombre,
            incluirSubcarpetas: x.incluir_subcarpetas,
          }))}
          progreso={{
            hechos: resumen?.hechos ?? 0,
            total: resumen?.total ?? 0,
            cuentas: resumen?.cuentas ?? {},
          }}
          bandeja={(resumen?.bandeja ?? []).map(filaBandeja)}
          pendientes={(resumen?.pendientes ?? []).map(filaBandeja)}
          grandes={(resumen?.grandes ?? []).map(filaBandeja)}
        />
      </div>
    </>
  )
}
