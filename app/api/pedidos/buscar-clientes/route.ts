import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { sinDemo } from '@/lib/demo/estado'
import { normDni, normTel, normEmail } from '@/lib/crm/unificar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * EL CLIENTE, PRIMERO.
 *
 * Se busca en `clientes` —el maestro del CRM— y no en `customers`, que es la
 * tabla del CRM de pedidos viejo. Un cliente que compra por tres canales tiene
 * que aparecer una vez.
 *
 * `clientes` tiene 150 filas de demostración: la búsqueda respeta el lente. Un
 * operador que está armando un pedido real no puede toparse con un cliente
 * inventado.
 */
export type ClienteParaPedido = {
  id: string
  nombre: string
  dni: string | null
  telefono: string | null
  email: string | null
  ultima_compra: string | null
  n_compras_12m: number
  notas: string | null
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json([])

  const like = `%${q}%`
  const dni = normDni(q)
  const tel = normTel(q)
  const mail = normEmail(q)

  // Los cuatro campos por los que se identifica a alguien, en un solo OR. El
  // orden de preferencia (DNI → teléfono → mail) lo resuelve el dedup al
  // guardar; acá se trata de encontrarlo.
  const condiciones = [`nombre.ilike.${like}`]
  if (dni)  condiciones.push(`dni.eq.${dni}`)
  if (tel)  condiciones.push(`telefono.eq.${tel}`)
  if (mail) condiciones.push(`email.eq.${mail}`)

  let query = sb.from('clientes')
    .select('id, nombre, dni, telefono, email, ultima_compra, n_compras_12m, notas')
    .eq('activo', true)
    .or(condiciones.join(','))
    .order('ultima_compra', { ascending: false, nullsFirst: false })
    .limit(10)
  if (sinDemo()) query = query.eq('es_demo', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []) as ClienteParaPedido[])
}
