import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { hasAnthropicKey } from '@/lib/ai/client'
import { NoraChatClient, type ConversacionLite } from './nora-chat-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'NORA' }

export default async function NoraChatPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const { data: { user } } = await sb.auth.getUser()
  const { data: convs } = await sb.from('ai_conversaciones')
    .select('id, mensajes, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const historial: ConversacionLite[] = ((convs ?? []) as any[]).map((c) => {
    const msgs = Array.isArray(c.mensajes) ? c.mensajes : []
    const primerUser = msgs.find((m: any) => m.role === 'user')
    return { id: c.id, titulo: (primerUser?.content ?? 'Conversación').slice(0, 60), fecha: c.created_at, mensajes: msgs }
  })

  return (
    <NoraChatClient
      nombre={profile.nombre}
      historial={historial}
      iaConfigurada={hasAnthropicKey()}
    />
  )
}
