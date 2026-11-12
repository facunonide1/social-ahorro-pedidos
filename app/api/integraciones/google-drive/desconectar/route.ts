import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { claveDesdeEnv, descifrarToken } from '@/lib/drive/crypto'
import { revocarToken } from '@/lib/drive/google'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  const { data: row } = await adm.from('integraciones_google_drive')
    .select('id, refresh_token_cifrado, iv, tag').eq('owner_admin_id', g.userId).limit(1).maybeSingle()
  if (!row) return NextResponse.json({ ok: true })
  let revocado = false
  try {
    const refresh = descifrarToken({
      cifrado: row.refresh_token_cifrado, iv: row.iv, tag: row.tag,
    }, claveDesdeEnv())
    revocado = await revocarToken(refresh)
  } catch { revocado = false }
  const { error } = await adm.from('integraciones_google_drive').delete().eq('id', row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, revocado })
}
