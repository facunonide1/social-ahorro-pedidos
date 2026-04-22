import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Customer, UserPedidos } from '@/lib/types'
import ClientesFilters from './filters'

export const dynamic = 'force-dynamic'

type CustomerRow = Customer & { orders_count: number }

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos').select('id, email, name, role, active').eq('id', user.id).maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const q = (searchParams.q || '').trim()

  let query = sb
    .from('customers')
    .select('*, orders(total, status)')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (q) {
    const like = `%${q}%`
    query = query.or(
      `name.ilike.${like},phone.ilike.${like},email.ilike.${like},dni.ilike.${like}`
    )
  }

  const { data: raw, error } = await query
  const customers: (CustomerRow & { monto_total: number })[] = (raw ?? []).map((r: any) => {
    const relevantes = (r.orders ?? []).filter((o: any) => o.status !== 'cancelado')
    return {
      ...r,
      orders_count: (r.orders ?? []).length,
      monto_total: relevantes.reduce((acc: number, o: any) => acc + Number(o.total || 0), 0),
    }
  })

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a' }}>
      <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
          ← Volver
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Clientes</div>
          <div style={{ fontSize: 12, color: '#999' }}>{customers.length} resultado{customers.length === 1 ? '' : 's'}{q ? ` para "${q}"` : ''}</div>
        </div>
        <ClientesFilters initialQ={q} />
      </header>

      {error && (
        <div style={{ margin: 24, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
          Error cargando clientes: {error.message}
        </div>
      )}

      <main style={{ padding: 20, maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {customers.length === 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16, padding: 24, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
            {q ? 'Sin coincidencias para esa búsqueda.' : 'Todavía no hay clientes cargados.'}
          </div>
        )}
        {customers.map(c => {
          const blacklisted = c.tags.includes('blacklist')
          const tipo = c.orders_count >= 10 ? 'VIP'
                     : c.orders_count >= 2  ? 'RECURRENTE'
                     : c.orders_count === 1 ? 'NUEVO' : null
          return (
            <Link key={c.id} href={`/clientes/${c.id}`}
              style={{ textDecoration: 'none', color: 'inherit',
                background: blacklisted ? '#fbeaea' : '#fff',
                border: blacklisted ? '1.5px solid #e0a8a8' : '0.5px solid #ede9e4',
                borderRadius: 14, padding: '12px 14px',
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2a2a2a', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {c.name || '(sin nombre)'}
                  {blacklisted && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#a33', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>⚠ Blacklist</span>}
                  {tipo === 'VIP' && <span style={{ fontSize: 10, fontWeight: 700, color: '#c6831a', background: '#fff7ec', border: '0.5px solid #edc989', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px' }}>⭐ VIP</span>}
                  {tipo === 'RECURRENTE' && <span style={{ fontSize: 10, fontWeight: 700, color: '#726DFF', background: '#eeedff', border: '0.5px solid #d9d6ff', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Recurrente</span>}
                  {tipo === 'NUEVO' && <span style={{ fontSize: 10, fontWeight: 700, color: '#1f8a4c', background: '#eaf7ef', border: '0.5px solid #8fd1a8', padding: '2px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Nuevo</span>}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {[c.dni ? `DNI ${c.dni}` : null, c.phone ?? null, c.email ?? null].filter(Boolean).join(' · ') || 'sin datos de contacto'}
                </div>
                {c.tags.filter(t => t !== 'blacklist').length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {c.tags.filter(t => t !== 'blacklist').map(t => (
                      <span key={t} style={{ fontSize: 10, fontWeight: 700, color: '#555', background: '#f5f5f5', border: '0.5px solid #e2e2e2', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px', textTransform: 'uppercase' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2a2a2a', letterSpacing: '-0.4px' }}>
                  {c.orders_count}
                </div>
                <div style={{ fontSize: 10, color: '#999', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  pedido{c.orders_count === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f8a4c' }}>
                  ${c.monto_total.toLocaleString('es-AR')}
                </div>
                <div style={{ fontSize: 10, color: '#999', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  facturado
                </div>
              </div>
            </Link>
          )
        })}
      </main>
    </div>
  )
}
