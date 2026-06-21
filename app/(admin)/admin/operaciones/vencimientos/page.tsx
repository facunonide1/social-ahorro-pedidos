import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'

import { VencimientosClient, type LoteRow } from './vencimientos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vencimientos' }

export default async function VencimientosPage() {
  const profile = await requireAdminHubAccess()
  const sb = createClient()
  const { sucursalId, esTodas } = getSucursalActiva()
  const en90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)

  let lotesQ = sb.from('lotes_productos').select('id, producto_id, sucursal_id, numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario').gt('cantidad_actual', 0).lte('fecha_vencimiento', en90).order('fecha_vencimiento')
  if (!esTodas && sucursalId) lotesQ = lotesQ.eq('sucursal_id', sucursalId)

  const [{ data: lotes }, { data: prods }, { data: rot }, { data: sucs }] = await Promise.all([
    lotesQ,
    sb.from('productos_catalogo').select('id, sku, nombre, precio_costo_promedio'),
    sb.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d'),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('nombre'),
  ])

  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const rotMap = new Map<string, number>()
  const rotPorProd = new Map<string, { suc: string; v: number }[]>()
  for (const r of (rot ?? []) as any[]) {
    rotMap.set(`${r.producto_id}|${r.sucursal_id}`, Number(r.venta_diaria_prom_30d ?? 0))
    const a = rotPorProd.get(r.producto_id) ?? []; a.push({ suc: r.sucursal_id, v: Number(r.venta_diaria_prom_30d ?? 0) }); rotPorProd.set(r.producto_id, a)
  }
  const hoyMs = Date.now()

  const rows: LoteRow[] = ((lotes ?? []) as any[]).map((l) => {
    const p = prodMap.get(l.producto_id)
    const dias = Math.ceil((new Date(l.fecha_vencimiento).getTime() - hoyMs) / 86_400_000)
    const cant = Number(l.cantidad_actual)
    const costo = Number(l.costo_unitario ?? p?.precio_costo_promedio ?? 0)
    const ventaEsta = rotMap.get(`${l.producto_id}|${l.sucursal_id}`) ?? 0
    const otras = (rotPorProd.get(l.producto_id) ?? []).filter((x) => x.suc !== l.sucursal_id)
    let accion: LoteRow['accion'] = 'ofertar'; let targetSuc: string | null = null; let descuento: number | null = null
    if (dias < 0) accion = 'baja'
    else if (ventaEsta > 0 && ventaEsta * dias >= cant) accion = 'ok'
    else {
      const mejor = otras.filter((x) => x.v >= Math.max(2 * ventaEsta, 0.1) && x.v * dias >= cant).sort((a, b) => b.v - a.v)[0]
      const ventaCadena = ventaEsta + otras.reduce((a, x) => a + x.v, 0)
      if (mejor) { accion = 'transferir'; targetSuc = mejor.suc }
      else if (ventaCadena * Math.max(dias, 0) < cant) accion = 'devolver'
      else { accion = 'ofertar'; descuento = dias <= 15 ? 30 : dias <= 30 ? 20 : 10 }
    }
    return {
      id: l.id, producto_id: l.producto_id, sku: p?.sku ?? null, nombre: p?.nombre ?? '—',
      sucursal_id: l.sucursal_id, sucursal: sucMap.get(l.sucursal_id) ?? '—', lote: l.numero_lote,
      fecha: l.fecha_vencimiento, dias, cantidad: cant, costo, riesgo: Math.round(cant * costo),
      accion, targetSucNombre: targetSuc ? (sucMap.get(targetSuc) ?? null) : null, descuento,
    }
  })

  const riesgoTotal = rows.reduce((a, r) => a + r.riesgo, 0)

  return (
    <>
      <PageHeader title="Vencimientos" description="Lotes por vencer con $ en riesgo y acción sugerida por NORA."
        breadcrumbs={[{ label: 'Operaciones' }, { label: 'Vencimientos' }]} />
      <div className="p-4 md:p-6">
        <VencimientosClient rows={rows} riesgoTotal={riesgoTotal} />
      </div>
    </>
  )
}
