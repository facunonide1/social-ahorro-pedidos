import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { FACTURA_ESTADO_LABELS } from '@/lib/types/admin'
import type { FacturaEstado } from '@/lib/types/admin'
import HubSidebar from '../_components/sidebar'
import FacturasFilters from './filters'
import { FACTURA_ESTADO_COLORS, vencimientoBadge } from '@/lib/admin-hub/factura'

export const dynamic = 'force-dynamic'

const ALL_ESTADOS: FacturaEstado[] = [
  'borrador','pendiente_aprobacion','aprobada','programada_pago',
  'pagada_parcial','pagada','vencida','rechazada','anulada',
]

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: { q?: string; estado?: string; proveedor?: string; vence?: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','administrativo','tesoreria','auditor','sucursal'],
  })
  const sb = createClient()

  const q = (searchParams.q || '').trim()
  const estado = (searchParams.estado || '').trim()
  const proveedorId = (searchParams.proveedor || '').trim()
  const vence = (searchParams.vence || '').trim() // 'hoy' | 'semana' | 'vencidas'

  let query = sb
    .from('facturas_proveedor')
    .select('*, proveedores(razon_social), sucursales(nombre)')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    .limit(500)

  if (estado) query = query.eq('estado', estado)
  if (proveedorId) query = query.eq('proveedor_id', proveedorId)
  if (q) {
    const like = `%${q}%`
    query = query.or(`numero_factura.ilike.${like},punto_venta.ilike.${like}`)
  }
  if (vence === 'hoy') {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const finHoy = new Date(); finHoy.setHours(23,59,59,999)
    query = query.gte('fecha_vencimiento', hoy.toISOString().slice(0,10))
                 .lte('fecha_vencimiento', finHoy.toISOString().slice(0,10))
                 .not('estado','in','(pagada,anulada,rechazada)')
  } else if (vence === 'semana') {
    const inicio = new Date(); inicio.setHours(0,0,0,0)
    const fin = new Date(); fin.setDate(fin.getDate() + 7)
    query = query.gte('fecha_vencimiento', inicio.toISOString().slice(0,10))
                 .lte('fecha_vencimiento', fin.toISOString().slice(0,10))
                 .not('estado','in','(pagada,anulada,rechazada)')
  } else if (vence === 'vencidas') {
    const hoy = new Date()
    query = query.lt('fecha_vencimiento', hoy.toISOString().slice(0,10))
                 .not('estado','in','(pagada,anulada,rechazada)')
  }

  const { data: rows, error } = await query

  const { data: proveedores } = await sb
    .from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social')

  const canCreate = ['super_admin','gerente','administrativo','tesoreria'].includes(profile.rol)

  // Totales agregados (sobre la lista filtrada)
  const total      = (rows ?? []).reduce((a: number, r: any) => a + Number(r.total || 0), 0)
  const pendientes = (rows ?? []).filter((r: any) => !['pagada','anulada','rechazada'].includes(r.estado))
  const totalPend  = pendientes.reduce((a: number, r: any) => a + Number(r.total || 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>Facturas de proveedor</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {(rows ?? []).length} factura{(rows ?? []).length === 1 ? '' : 's'} · pendientes ${totalPend.toLocaleString('es-AR')} de ${total.toLocaleString('es-AR')}
            </div>
          </div>
          {canCreate && (
            <Link href="/hub/facturas/nueva"
              style={{ padding: '10px 14px', borderRadius: 10, background: '#FF6D6E', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              + Nueva factura
            </Link>
          )}
        </header>

        {error && (
          <div style={{ margin: 20, padding: 14, background: '#fff0f0', border: '0.5px solid #FF6D6E', borderRadius: 12, fontSize: 13, color: '#FF6D6E' }}>
            {error.message}
          </div>
        )}

        <section style={{ padding: '16px 24px 0' }}>
          <FacturasFilters
            initialQ={q}
            initialEstado={estado}
            initialProveedor={proveedorId}
            initialVence={vence}
            estados={ALL_ESTADOS}
            proveedores={(proveedores ?? []) as any[]}
          />
        </section>

        <main style={{ padding: '16px 24px 24px' }}>
          <div className="sa-list-table-wrap" style={{ background: '#fff', border: '0.5px solid #ede9e4', borderRadius: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#faf8f5', borderBottom: '0.5px solid #ede9e4' }}>
                  {['Comprobante','Proveedor','Emisión','Vencimiento','Total','Estado',''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>
                    Sin facturas para los filtros aplicados.
                  </td></tr>
                )}
                {(rows ?? []).map((r: any) => {
                  const c = FACTURA_ESTADO_COLORS[r.estado as FacturaEstado]
                  const venc = vencimientoBadge(r.fecha_vencimiento, r.estado)
                  return (
                    <tr key={r.id} style={{ borderBottom: '0.5px solid #f5f1ec' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                        <b>{r.tipo_factura}</b> {String(r.punto_venta).padStart(5,'0')}-{String(r.numero_factura).padStart(8,'0')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{r.proveedores?.razon_social || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>{new Date(r.fecha_emision).toLocaleDateString('es-AR')}</td>
                      <td style={{ padding: '10px 12px', color: '#666' }}>
                        {new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')}
                        {venc && (
                          <div style={{ display: 'inline-block', marginLeft: 6, fontSize: 9, fontWeight: 700, color: venc.fg, background: venc.bg, border: `0.5px solid ${venc.border}`, padding: '1px 6px', borderRadius: 999, letterSpacing: '0.3px' }}>
                            {venc.text}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>${Number(r.total).toLocaleString('es-AR')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, border: `0.5px solid ${c.border}`, padding: '3px 8px', borderRadius: 999 }}>
                          {FACTURA_ESTADO_LABELS[r.estado as FacturaEstado]}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Link href={`/hub/facturas/${r.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#726DFF', textDecoration: 'none' }}>
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
