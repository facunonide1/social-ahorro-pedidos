import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { WhatsappMsgStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Marca un mensaje de WhatsApp como enviado u omitido.
 * Body: { status: 'sent' | 'skipped' }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_pedidos').select('role, active').eq('id', user.id).maybeSingle()

  if (!profile?.active || !['admin', 'operador'].includes(profile.role)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { status?: WhatsappMsgStatus } | null
  const newStatus = body?.status
  if (newStatus !== 'sent' && newStatus !== 'skipped' && newStatus !== 'pending') {
    return NextResponse.json({ error: 'status_invalido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'sent') {
    patch.sent_at = new Date().toISOString()
    patch.sent_by = user.id
  } else {
    patch.sent_at = null
    patch.sent_by = null
  }

  const { data, error } = await sb
    .from('whatsapp_messages')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, message: data })
}
