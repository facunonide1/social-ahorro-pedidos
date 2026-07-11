import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { HistoricoClient, type ArqueoRow, type DescuadreCajero, type PatronFranja, type CajaChicaReporte } from './historico-client'

function franjaDe(iso: string | null): 'mañana' | 'tarde' | 'noche' {
  if (!iso) return 'tarde'
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date(iso)))
  return h < 14 ? 'mañana' : h < 20 ? 'tarde' : 'noche'
}
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Histórico de caja' }

export default async function HistoricoCajaPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'encargado_sucursal', 'administrativo', 'auditor', 'sucursal'] })
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  let q = sb.from('arqueos_caja')
    .select('id, sucursal_id, fecha, cajero_id, cajero_nombre, inicio_caja, total_efectivo, total_mercadopago, total_tarjetas, total_declarado, total_sistema, diferencia_cierre, efectivo_a_general, captura_url, estado, observacion, conteo_confirmado_at, hora_cierre_sifaco, secuencia_alterada, carga_posterior, created_at, sucursales(nombre)')
    .order('fecha', { ascending: false }).limit(300)
  if (!esTodas && sucursalId) q = q.eq('sucursal_id', sucursalId)
  const { data: arqueos } = await q

  const rows0 = (arqueos ?? []) as any[]

  // Cruce con ventas reales (ventas_diarias del Centro de Datos), por fecha+sucursal
  const claves = Array.from(new Set(rows0.map((a) => `${a.fecha}|${a.sucursal_id}`)))
  const ventasMap = new Map<string, number>()
  if (claves.length) {
    const fechas = Array.from(new Set(rows0.map((a) => a.fecha)))
    const sucs = Array.from(new Set(rows0.map((a) => a.sucursal_id)))
    const { data: vd } = await sb.from('ventas_diarias').select('fecha, sucursal_id, monto').in('fecha', fechas).in('sucursal_id', sucs).limit(100000)
    for (const v of (vd ?? []) as any[]) {
      const k = `${v.fecha}|${v.sucursal_id}`
      ventasMap.set(k, (ventasMap.get(k) ?? 0) + Number(v.monto ?? 0))
    }
  }

  // Signed URLs de las capturas (bucket privado)
  const adm = createAdminClient()
  const rows: ArqueoRow[] = []
  for (const a of rows0) {
    let capturaUrl: string | null = null
    if (a.captura_url) {
      try { const { data } = await adm.storage.from('arqueos-caja').createSignedUrl(a.captura_url, 3600); capturaUrl = data?.signedUrl ?? null } catch { /* */ }
    }
    const ventasReales = ventasMap.get(`${a.fecha}|${a.sucursal_id}`) ?? null
    const desvioVentas = ventasReales != null && ventasReales > 0 ? Number(a.total_declarado) - ventasReales : null
    // Las marcas nuevas (secuencia alterada, carga posterior) también son sospechosas.
    const sospechoso = (Number(a.diferencia_cierre) !== 0) || Boolean(a.secuencia_alterada) || Boolean(a.carga_posterior) || (desvioVentas != null && Math.abs(desvioVentas) > ventasReales! * 0.1)
    rows.push({
      id: a.id, sucursal: a.sucursales?.nombre ?? '—', sucursal_id: a.sucursal_id, fecha: a.fecha,
      cajero: a.cajero_nombre ?? '—', cajero_id: a.cajero_id,
      inicio: Number(a.inicio_caja), efectivo: Number(a.total_efectivo), mercadopago: Number(a.total_mercadopago),
      tarjetas: Number(a.total_tarjetas), declarado: Number(a.total_declarado), sistema: Number(a.total_sistema),
      diferencia: Number(a.diferencia_cierre), estado: a.estado, observacion: a.observacion,
      captura_url: capturaUrl, ventas_reales: ventasReales, desvio_ventas: desvioVentas, sospechoso,
      secuencia_alterada: Boolean(a.secuencia_alterada), carga_posterior: Boolean(a.carga_posterior),
      franja: franjaDe(a.created_at), dia: DIAS[new Date(`${a.fecha}T12:00:00`).getDay()],
    })
  }

  // Ranking de descuadres por cajero (+ marcas nuevas)
  const porCajero = new Map<string, DescuadreCajero>()
  for (const r of rows) {
    const k = r.cajero_id ?? r.cajero
    const ex = porCajero.get(k) ?? { cajero: r.cajero, arqueos: 0, observados: 0, suma_abs_diferencia: 0, secuencia_alterada: 0, carga_posterior: 0 }
    ex.arqueos++
    if (r.estado === 'observada' || r.diferencia !== 0) ex.observados++
    if (r.secuencia_alterada) ex.secuencia_alterada++
    if (r.carga_posterior) ex.carga_posterior++
    ex.suma_abs_diferencia += Math.abs(r.diferencia)
    porCajero.set(k, ex)
  }
  const ranking = Array.from(porCajero.values()).filter((c) => c.observados > 0 || c.secuencia_alterada > 0 || c.carga_posterior > 0).sort((a, b) => b.suma_abs_diferencia - a.suma_abs_diferencia)

  // Cortes por DÍA × FRANJA — "descuadra chico pero seguido los jueves a la noche".
  const porFranja = new Map<string, PatronFranja>()
  for (const r of rows) {
    const k = `${r.dia}·${r.franja}`
    const ex = porFranja.get(k) ?? { dia: r.dia, franja: r.franja, arqueos: 0, observados: 0, suma_abs: 0 }
    ex.arqueos++; if (r.diferencia !== 0) ex.observados++; ex.suma_abs += Math.abs(r.diferencia)
    porFranja.set(k, ex)
  }
  const patrones = Array.from(porFranja.values()).filter((p) => p.observados > 0).sort((a, b) => b.observados - a.observados || b.suma_abs - a.suma_abs).slice(0, 8)

  // Alerta: N observados del mismo cajero en 30 días (default 3).
  const hace30 = Date.now() - 30 * 86400000
  const obs30 = new Map<string, number>()
  for (const r of rows) {
    if ((r.estado === 'observada' || r.diferencia !== 0) && new Date(`${r.fecha}T12:00:00`).getTime() >= hace30) obs30.set(r.cajero, (obs30.get(r.cajero) ?? 0) + 1)
  }
  const cajerosPatron = [...obs30.entries()].filter(([, n]) => n >= 3).map(([cajero, n]) => ({ cajero, n }))

  // Reporte de caja chica (últimos 90 días) por categoría.
  let cajaChica: CajaChicaReporte = { total: 0, categorias: [] }
  try {
    const desde90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const { data: cc } = await adm.from('caja_general_movimientos').select('monto, categoria').eq('tipo', 'gasto_caja_chica').gte('fecha', desde90).limit(2000)
    const byCat = new Map<string, number>()
    let total = 0
    for (const m of (cc ?? []) as any[]) { const v = Math.abs(Number(m.monto)); total += v; byCat.set(m.categoria ?? 'otros', (byCat.get(m.categoria ?? 'otros') ?? 0) + v) }
    cajaChica = { total: Math.round(total), categorias: [...byCat.entries()].map(([categoria, monto]) => ({ categoria, monto: Math.round(monto) })).sort((a, b) => b.monto - a.monto) }
  } catch { /* */ }

  const sospechosos = rows.filter((r) => r.sospechoso).length

  return (
    <>
      <PageHeader title="Histórico de caja y control" description="Cierres por sucursal/turno/cajero con la captura. NORA cruza lo declarado vs ventas reales."
        breadcrumbs={[{ label: 'Finanzas' }, { label: 'Caja', href: '/admin/finanzas/caja' }, { label: 'Histórico' }]} />
      <div className="p-4 md:p-6">
        <HistoricoClient rows={rows} ranking={ranking} sospechosos={sospechosos} patrones={patrones} cajaChica={cajaChica} cajerosPatron={cajerosPatron} />
      </div>
    </>
  )
}
