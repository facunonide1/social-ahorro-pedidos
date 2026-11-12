import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

const DUENO: AdminRole[] = ['super_admin']
const COMPRAS: AdminRole[] = ['super_admin', 'gerente', 'comprador']

async function rolDe(): Promise<{ userId: string; rol: AdminRole } | { error: string; status: number }> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo) return { error: 'sin permiso', status: 403 }
  return { userId: user.id, rol: me.rol }
}

export async function exigirDueno() {
  const r = await rolDe()
  if ('error' in r) return r
  if (!DUENO.includes(r.rol)) return { error: 'requiere super_admin', status: 403 as const }
  return r
}

export async function exigirCompras() {
  const r = await rolDe()
  if ('error' in r) return r
  if (!COMPRAS.includes(r.rol)) return { error: 'requiere super_admin, gerente o comprador', status: 403 as const }
  return r
}
