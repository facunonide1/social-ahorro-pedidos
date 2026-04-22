import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 6 * 1024 * 1024 // 6 MB

/**
 * Sube la foto de comprobante de entrega al bucket delivery-proofs y
 * guarda la public URL en orders.delivery_proof_url.
 * Roles: admin / operador / repartidor asignado.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()
  if (!profile?.active) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const { data: order } = await sb
    .from('orders').select('id, assigned_to').eq('id', params.id).maybeSingle()
  if (!order) return NextResponse.json({ error: 'pedido_no_encontrado' }, { status: 404 })

  // Repartidor sólo puede subir su propio pedido
  if (profile.role === 'repartidor' && order.assigned_to !== user.id) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file_requerido' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'archivo_muy_grande' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'solo_imagen' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${order.id}/${Date.now()}.${ext}`

  const admin = createAdminClient()
  const buf = Buffer.from(await file.arrayBuffer())

  const upload = await admin.storage
    .from('delivery-proofs')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 })

  const { data: pub } = admin.storage.from('delivery-proofs').getPublicUrl(path)
  const url = pub.publicUrl

  const { error: updErr } = await admin
    .from('orders')
    .update({ delivery_proof_url: url })
    .eq('id', order.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, url })
}
