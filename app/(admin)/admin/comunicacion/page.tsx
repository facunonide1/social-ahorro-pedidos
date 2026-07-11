import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import { ComunicacionClient, type CanalRow, type UserLite } from './comunicacion-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comunicación' }

export default async function ComunicacionPage({ searchParams }: { searchParams: { canal?: string; msg?: string } }) {
  const profile = await requireAdminHubAccess()
  const adm = createAdminClient()

  const [{ data: miembros }, users] = await Promise.all([
    adm.from('canal_miembros').select('canal_id, ultima_lectura_at').eq('user_id', profile.id),
    listAdminUsersLite(adm, { soloActivos: true }),
  ])
  const miembroDe = new Map(((miembros ?? []) as any[]).map((m) => [m.canal_id, m.ultima_lectura_at]))
  const canalIds = [...miembroDe.keys()]

  // canales: los que es miembro + generales públicos
  const { data: canales } = await adm.from('canales').select('id, nombre, tipo, descripcion, vinculo_modulo, sucursal_id, es_privado').or(`id.in.(${canalIds.length ? canalIds.join(',') : '00000000-0000-0000-0000-000000000000'}),es_privado.eq.false`).order('nombre').limit(300)

  // unread por canal
  const ids = ((canales ?? []) as any[]).map((c) => c.id)
  const unread = new Map<string, number>(); const lastMsg = new Map<string, { contenido: string; at: string }>()
  if (ids.length) {
    const { data: msgs } = await adm.from('mensajes').select('canal_id, contenido, created_at').in('canal_id', ids).order('created_at', { ascending: false }).limit(4000)
    for (const m of (msgs ?? []) as any[]) {
      if (!lastMsg.has(m.canal_id)) lastMsg.set(m.canal_id, { contenido: m.contenido ?? '', at: m.created_at })
      const lu = miembroDe.get(m.canal_id)
      if (lu != null && m.created_at > lu) unread.set(m.canal_id, (unread.get(m.canal_id) ?? 0) + 1)
    }
  }

  const rows: CanalRow[] = ((canales ?? []) as any[]).map((c) => ({
    id: c.id, nombre: c.nombre, tipo: c.tipo, vinculo: c.vinculo_modulo, esMiembro: miembroDe.has(c.id),
    unread: unread.get(c.id) ?? 0, ultimo: lastMsg.get(c.id)?.contenido ?? '', ultimoAt: lastMsg.get(c.id)?.at ?? null,
  }))

  const totalNoLeidos = [...unread.values()].reduce((a, n) => a + n, 0)

  return (
    <ComunicacionClient
      canales={rows} canalActivo={searchParams.canal ?? null} msgFocus={searchParams.msg ?? null} totalNoLeidos={totalNoLeidos}
      yo={{ id: profile.id, nombre: profile.nombre, email: profile.email, rol: profile.rol, sucursal_id: profile.sucursal_id }}
      usuarios={((users ?? []) as any[]).map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursal_id: u.sucursal_id })) as UserLite[]}
    />
  )
}
