'use server'

import { createClient } from '@/lib/supabase/server'

export type UpdateNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string }

export async function updateAccountName(name: string): Promise<UpdateNameResult> {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'No estás autenticado.' }

  const trimmed = name.trim()
  if (trimmed.length < 1) return { ok: false, error: 'El nombre no puede estar vacío.' }
  if (trimmed.length > 100) return { ok: false, error: 'El nombre es demasiado largo.' }

  const { error } = await sb
    .from('users_pedidos')
    .update({ name: trimmed })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true, name: trimmed }
}
