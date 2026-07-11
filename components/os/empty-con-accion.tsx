'use client'

import Link from 'next/link'

import { Icon } from '@/components/icon'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { SUBAPPS, puedeAccion } from '@/lib/os/subapps'

/**
 * NORA OS · empty-state con la acción de creación correspondiente, LEÍDA DEL
 * MANIFEST (patrón "Cargar vencimientos"). La acción se resuelve por `accionId`
 * dentro de la sub-app `app` y solo se muestra si el usuario puede ejecutarla.
 */
export function EmptyConAccion({
  app,
  accionId,
  icono = 'PackageX',
  titulo,
  subtitulo,
}: {
  app: string
  accionId: string
  icono?: string
  titulo: string
  subtitulo?: string
}) {
  const { rol, permisosCustom } = usePermissions()
  const manifest = SUBAPPS.find((a) => a.id === app)
  const accion = manifest?.quickActions.find((a) => a.id === accionId)
  const puede = accion && rol ? puedeAccion(rol, permisosCustom, accion) : false

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
      <Icon name={icono} className="size-8 text-muted-foreground" />
      <div>
        <div className="font-medium">{titulo}</div>
        {subtitulo && <div className="mt-0.5 max-w-md text-sm text-muted-foreground">{subtitulo}</div>}
      </div>
      {accion && puede && !accion.proximamente && (
        <Link href={accion.destino} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Icon name={accion.icono} className="size-4" /> {accion.nombre}
        </Link>
      )}
    </div>
  )
}
