import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { RolFabrica } from './tipos'

/**
 * Acceso a la FÁBRICA.
 *
 * La puerta es una sola: tener fila en `fab_usuarios_proyecto`. Un usuario del
 * admin de Social Ahorro, por más super_admin que sea, no entra a la fábrica si
 * no está invitado — son dos productos, no dos secciones del mismo.
 *
 * Se lee con el cliente de sesión (no con service_role) a propósito: así las
 * políticas RLS de 0094 son las que efectivamente deciden, y no un adorno que
 * nadie ejerce. Si la política está mal, se rompe acá y se ve.
 */

export interface AccesoFabrica {
  usuarioId: string
  email: string | null
  /** Rol más alto que tiene el usuario en cualquier proyecto. */
  esDueno: boolean
  /** proyecto_id → rol. */
  roles: Record<string, RolFabrica>
}

/**
 * Redirige a /login si no hay sesión. Si hay sesión pero ninguna membresía,
 * devuelve un acceso vacío en vez de redirigir: el layout de /fabrica muestra
 * la pantalla de "sin acceso" y no hay adónde rebotar. Una redirección a una
 * ruta que vive dentro del mismo layout guardado es un loop infinito, y es un
 * error que sólo se ve en producción.
 */
export async function requireFabricaAccess(): Promise<AccesoFabrica> {
  const sb = createClient()

  const { data: auth } = await sb.auth.getUser()
  const user = auth?.user
  if (!user) redirect('/login')

  const { data: filas } = await sb
    .from('fab_usuarios_proyecto')
    .select('proyecto_id, rol')
    .eq('usuario_id', user.id)

  const membresias = (filas ?? []) as { proyecto_id: string; rol: RolFabrica }[]

  const roles: Record<string, RolFabrica> = {}
  for (const m of membresias) roles[m.proyecto_id] = m.rol

  return {
    usuarioId: user.id,
    email: user.email ?? null,
    esDueno: membresias.some((m) => m.rol === 'dueño_fabrica'),
    roles,
  }
}

/** Tiene sesión pero nadie lo invitó a ningún proyecto. */
export function sinMembresia(acceso: AccesoFabrica): boolean {
  return !acceso.esDueno && Object.keys(acceso.roles).length === 0
}

/** ¿Puede declarar, instalar y verificar en este proyecto? */
export function puedeArmar(acceso: AccesoFabrica, proyectoId: string): boolean {
  if (acceso.esDueno) return true
  const rol = acceso.roles[proyectoId]
  return rol === 'armador' || rol === 'dueño_fabrica'
}

/** ¿Puede siquiera ver este proyecto? */
export function puedeVer(acceso: AccesoFabrica, proyectoId: string): boolean {
  return acceso.esDueno || proyectoId in acceso.roles
}
