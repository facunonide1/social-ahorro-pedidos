import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Los items de una lista, para bajarlos a Excel (regla de oro 6: con SKU).
 *
 * Va con el cliente de sesión y no con el de administración: si esta persona no
 * puede ver esa zona, la RLS devuelve vacío y no hace falta un chequeo aparte
 * que se pueda olvidar.
 *
 * Devuelve SÓLO lo que hay en la lista. Cantidades no: acá no se cuenta.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data, error } = await sb
    .from('cnt_lista_items')
    .select('orden, sku, descripcion, unidad')
    .eq('lista_id', params.id)
    .eq('activo', true)
    .order('orden')
  if (error) return NextResponse.json({ error: 'No se pudo leer la lista.' }, { status: 400 })

  return NextResponse.json({ items: data ?? [] })
}
