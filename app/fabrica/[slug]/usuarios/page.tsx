import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/server'
import { listarMiembros, traerProyecto } from '@/lib/fabrica/datos'
import { ETIQUETA_ROL, type RolFabrica } from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuarios' }

const VARIANTE_ROL: Record<RolFabrica, 'default' | 'info' | 'outline'> = {
  'dueño_fabrica': 'default',
  armador: 'info',
  observador: 'outline',
}

export default async function UsuariosDelProyectoPage({
  params,
}: {
  params: { slug: string }
}) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const miembros = await listarMiembros(proyecto.id)

  // El email vive en auth.users, que no se lee con la sesión del usuario. Se
  // resuelve por la API de administración de Auth y no leyendo una tabla de
  // Social Ahorro: la fábrica no debe conocer el esquema del proyecto que
  // administra, o deja de ser portable.
  const adm = createAdminClient()
  const emails = new Map<string, string>()
  await Promise.all(
    miembros.map(async (m) => {
      const { data } = await adm.auth.admin.getUserById(m.usuario_id)
      if (data?.user?.email) emails.set(m.usuario_id, data.user.email)
    }),
  )

  return (
    <div className="p-4 md:p-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Quién entra a este proyecto de la fábrica. Es una lista aparte de la de
        usuarios del sistema que el proyecto administra: ser super admin allá no
        da acceso acá.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Desde</th>
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {emails.get(m.usuario_id) ?? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.usuario_id.slice(0, 8)}…
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={VARIANTE_ROL[m.rol]} className="font-normal">
                    {ETIQUETA_ROL[m.rol]}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {String(m.created_at).slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Invitar y cambiar roles todavía se hace por base de datos. La pantalla
        llega cuando haya un segundo proyecto que la necesite.
      </p>
    </div>
  )
}
