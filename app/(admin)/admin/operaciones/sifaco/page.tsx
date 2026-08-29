import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'

import { ImportarSifacoClient } from './importar-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Maestro de SIFACO' }

/**
 * LA CARGA DEL MAESTRO DE SIFACO.
 *
 * Es distinta de «Importaciones»: aquella sube el Excel diario por sucursal y
 * deduce ventas por diferencia de stock. Ésta trae el maestro completo de
 * productos —46.000 filas, 41 MB— que es de donde sale el catálogo.
 *
 * Dos pantallas y no una porque son dos frecuencias y dos dueños: el diario lo
 * sube alguien de la sucursal todos los días; el maestro lo trae quien puede
 * pedirle a SIFACO una exportación completa, y cuando cambia el catálogo.
 */
export default async function SifacoPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo'] })
  const sb = createClient()

  const { data: previas } = await sb
    .from('sifaco_importaciones')
    .select('id, tipo, archivo_nombre, bytes, estado, codificacion, filas_cargadas, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <>
      <PageHeader
        title="Maestro de SIFACO"
        description="El archivo completo de productos. De acá sale el catálogo: descripción, código, barras, laboratorio, precio, costo y stock."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Maestro de SIFACO' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        <ImportarSifacoClient />

        <div>
          <h2 className="mb-2 text-sm font-semibold">Importaciones anteriores</h2>
          {!previas?.length ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Todavía no se importó ningún maestro. Hasta que entre uno, el catálogo son los
              productos que haya cargados a mano.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Archivo</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-right">Filas</th>
                    <th className="px-3 py-2 text-left">Codificación</th>
                    <th className="px-3 py-2 text-left">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {previas.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.archivo_nombre}</td>
                      <td className="px-3 py-2">{p.estado}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(p.filas_cargadas ?? 0).toLocaleString('es-AR')}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.codificacion ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
