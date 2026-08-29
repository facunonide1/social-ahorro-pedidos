import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'administrativo']

/**
 * QUÉ VA A PASAR SI SE APLICA — SIN APLICAR NADA.
 *
 * Es la misma regla que el motor de documentos: nada se guarda sin que alguien
 * mire. Con 46.000 filas eso no puede ser leer la lista; tiene que ser cuatro
 * números y una muestra.
 *
 * Los cuatro números son: cuántas filas trae el archivo, cuántos productos son
 * nuevos, cuántos ya están y cambian, y cuántos están en el catálogo y NO
 * vienen en el archivo. Ese último es el que importa: un producto que
 * desaparece del maestro no es un producto que hay que borrar, es un producto
 * que SIFACO dejó de listar, y la diferencia la decide una persona.
 *
 * Esta ruta no escribe en el catálogo. Escribe la previa en la importación,
 * que es lo que después se muestra al lado del botón de aplicar.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso' }, { status: 403 })
  }

  const adm = createAdminClient()

  const { data: imp } = await adm
    .from('sifaco_importaciones')
    .select('id, tipo, codificacion, filas_cargadas')
    .eq('id', params.id)
    .maybeSingle<{ id: string; tipo: string; codificacion: string | null; filas_cargadas: number }>()

  if (!imp) return NextResponse.json({ error: 'la importación no existe' }, { status: 404 })

  const { data: previa, error } = await adm
    .rpc('sifaco_previa_maestro', { p_importacion: params.id })
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adm.from('sifaco_importaciones')
    .update({ estado: 'cargado', previa, cargado_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ previa })
}
