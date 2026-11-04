/**
 * EL COMPARADOR DE PRECIOS · lo que comparten las rutas.
 *
 * Las tablas tienen RLS sin políticas (quién ve precios de proveedores lo
 * decide Facundo: PENDIENTE.md), así que se escriben y se leen con el cliente
 * de servicio **después** de verificar quién pide: la clave del bot, o la
 * sesión y el rol de la persona.
 */
import { NextResponse } from 'next/server'

import { banderaPrendida } from '@/lib/banderas'

/** Por ahora solo el dueño. Ampliarlo es una decisión de permisos (PENDIENTE.md). */
export const ROLES_QUE_VEN_PRECIOS = ['super_admin'] as const

/**
 * Bandera apagada: 404, como si la ruta no existiera. No se dice que hay algo
 * apagado detrás: en producción nadie ve nada hasta que se prende.
 */
export function siApagada(): NextResponse | null {
  if (banderaPrendida('comparador_precios')) return null
  return NextResponse.json({ error: 'no encontrado' }, { status: 404 })
}

type SesionMinima = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (t: string) => any
}

/** La persona puede ver precios de proveedores? Devuelve su id, o la respuesta de error. */
export async function quienPuedeVer(sb: SesionMinima): Promise<{ id: string } | NextResponse> {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no hay sesión' }, { status: 401 })
  const { data: perfil } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo || !(ROLES_QUE_VEN_PRECIOS as readonly string[]).includes(perfil.rol)) {
    return NextResponse.json({ error: 'tu rol no ve precios de proveedores' }, { status: 403 })
  }
  return { id: user.id }
}
