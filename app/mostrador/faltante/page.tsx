import { redirect } from 'next/navigation'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

import { FaltanteClient } from './faltante-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Me lo pidieron y no había' }

/**
 * D · EL FALTANTE REGISTRADO.
 *
 * Es lo más valioso de la sesión y lo más barato de construir.
 *
 * Cuando alguien pide algo que no hay, esa información se pierde. Nadie la
 * anota. Es la demanda invisible del negocio: lo único que convierte «se fue
 * sin comprar» en un dato.
 *
 * ── POR QUÉ LLEGA CON EL TEXTO YA ESCRITO ───────────────────────────────────
 *
 * Porque el empleado ya lo escribió para buscarlo. Si la pantalla le pidiera
 * escribirlo de nuevo, nadie lo registraría — que es exactamente lo que pasó
 * con `demanda_invisible` entre la v0.50 y hoy: existía y tenía cero filas.
 */
export default async function FaltantePage({
  searchParams,
}: { searchParams: { q?: string; producto?: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login?next=/mostrador/faltante')

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'crear')) redirect('/hub?denied=1')

  const adm = createAdminClient()
  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo')

  // Si vino con un producto, se muestra qué es: el empleado tiene que ver que
  // está registrando lo que cree.
  let producto: { producto_id: string; nombre: string; sku: string } | null = null
  if (searchParams?.producto) {
    const { data } = await adm.from('mostrador_indice')
      .select('producto_id, nombre, sku').eq('producto_id', searchParams.producto).maybeSingle()
    producto = (data as any) ?? null
  }

  return (
    <FaltanteClient
      textoInicial={searchParams?.q ?? ''}
      producto={producto}
      sucursales={(sucs ?? []) as any}
      miSucursal={me.sucursal_id}
    />
  )
}
