import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Order, UserPedidos, ZonaReparto } from '@/lib/types'
import NuevoPedidoForm from './form'

export const dynamic = 'force-dynamic'

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: { from?: string }
}) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()

  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const { data: zonas } = await sb
    .from('zonas_reparto')
    .select('id, nombre, color, activa')
    .eq('activa', true)
    .order('nombre', { ascending: true })
    .returns<Pick<ZonaReparto, 'id'|'nombre'|'color'|'activa'>[]>()

  // Modo "repetir pedido": traigo datos del pedido origen para precargar
  let source: Order | null = null
  if (searchParams.from) {
    const { data } = await sb.from('orders').select('*').eq('id', searchParams.from).maybeSingle<Order>()
    source = data ?? null
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
          ← Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Nuevo pedido manual</div>
          <div style={{ fontSize: 12, color: '#999' }}>Para pedidos que entran por WhatsApp, teléfono u otros canales.</div>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 780, margin: '0 auto' }}>
        {source && (
          <div style={{ background: '#eeedff', border: '0.5px solid #d9d6ff', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#726DFF' }}>
            Repitiendo pedido <b>{source.codigo}</b>. Los datos se precargaron; podés ajustar lo que haga falta antes de confirmar.
          </div>
        )}
        <NuevoPedidoForm zonas={zonas ?? []} source={source} />
      </main>
    </div>
  )
}
