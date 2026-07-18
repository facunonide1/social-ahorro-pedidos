/**
 * Mostrador matinal (OS-6b · O-08). Selección diaria por sucursal (3–5):
 * destacadas siempre + las que arrancan hoy + liquidaciones con ventana por
 * cerrar + las flojas (si hay métricas) + rotación del resto (cobertura semanal).
 * Entrega lazy Hobby-safe: mensaje al canal de la sucursal con argumento de venta.
 */
type Adm = any

const MAX_DIA = 5
const HORA_ENTREGA = 7 // AR; configurable a futuro por sucursal

function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}
function horaAR(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date()))
}
function condicion(o: any): string {
  if (o.tipo === 'porcentaje_descuento') return `${o.valor ?? 0}% OFF`
  if (o.tipo === 'precio_fijo') return `precio especial`
  if (o.tipo === '2x1') return '2x1'
  if (o.tipo === 'nxm') return `${o.nx ?? 0}x${o.ny ?? 0}`
  if (o.tipo === 'segunda_unidad_pct') return `2ª unidad ${o.valor ?? 0}%`
  return 'promo'
}

/** Ofertas activas y vigentes hoy para una sucursal. */
async function activasSucursal(adm: Adm, sucursalId: string, hoy: string): Promise<any[]> {
  const { data } = await adm.from('ofertas').select('id, nombre, tipo, valor, nx, ny, productos_ids, sucursales_ids, origen, origen_ref, fecha_inicio, fecha_fin, destacar_mostrador, metricas, canales').eq('estado', 'activa').limit(500)
  return ((data ?? []) as any[]).filter((o) => {
    const suc = (o.sucursales_ids ?? []) as string[]
    if (suc.length && !suc.includes(sucursalId)) return false
    if (o.fecha_inicio && o.fecha_inicio > hoy) return false
    if (o.fecha_fin && o.fecha_fin < hoy) return false
    return true
  })
}

/** Selección priorizada del día (garantiza rotación semanal). */
export async function seleccionarDelDia(adm: Adm, sucursalId: string, hoy: string, max = MAX_DIA): Promise<any[]> {
  const activas = await activasSucursal(adm, sucursalId, hoy)
  if (!activas.length) return []
  const hace7 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(Date.parse(`${hoy}T12:00:00Z`) - 7 * 86_400_000))
  const { data: recientes } = await adm.from('mostrador_destacados').select('oferta_id').eq('sucursal_id', sucursalId).gte('fecha', hace7)
  const vistas7 = new Set(((recientes ?? []) as any[]).map((r) => r.oferta_id))

  const score = (o: any): number => {
    if (o.destacar_mostrador) return 0
    if (o.fecha_inicio === hoy) return 1
    const liq = o.origen === 'liquidacion_propia' || o.origen_ref?.motivo === 'por_vencer'
    if (liq) return 1
    const floja = o.metricas?.etiqueta === 'regalo_margen' || (o.metricas?.uplift_pct != null && Number(o.metricas.uplift_pct) < 5)
    if (floja) return 2
    if (!vistas7.has(o.id)) return 2   // rotación: las no mostradas en 7d suben
    return 3
  }
  return [...activas].sort((a, b) => {
    const sa = score(a), sb = score(b)
    if (sa !== sb) return sa - sb
    const va = vistas7.has(a.id) ? 1 : 0, vb = vistas7.has(b.id) ? 1 : 0  // no vistas primero
    if (va !== vb) return va - vb
    return a.id < b.id ? -1 : 1
  }).slice(0, max)
}

/** Entrega lazy: por sucursal, una vez al día (dedupe por mostrador_destacados). */
export async function entregarMostrador(adm: Adm): Promise<number> {
  if (horaAR() < HORA_ENTREGA) return 0
  const hoy = hoyAR()
  const { data: sucs } = await adm.from('sucursales').select('id, nombre').eq('activa', true)
  let entregadas = 0
  for (const s of (sucs ?? []) as any[]) {
    const { count } = await adm.from('mostrador_destacados').select('id', { count: 'exact', head: true }).eq('sucursal_id', s.id).eq('fecha', hoy)
    if ((count ?? 0) > 0) continue   // ya entregado hoy
    const sel = await seleccionarDelDia(adm, s.id, hoy)
    if (!sel.length) continue
    // Nombres de producto (el primero de cada oferta) para el argumento.
    const pids = [...new Set(sel.flatMap((o) => (o.productos_ids ?? []).slice(0, 1)))]
    const prodMap = new Map<string, string>()
    if (pids.length) { const { data: prods } = await adm.from('productos_catalogo').select('id, nombre').in('id', pids); for (const p of (prods ?? []) as any[]) prodMap.set(p.id, p.nombre) }
    const lineas = sel.map((o) => {
      const prod = prodMap.get((o.productos_ids ?? [])[0]) ?? o.nombre
      return `• ${prod} — ${condicion(o)}. Sugerilo con cada compra.`
    })
    const contenido = `🛒 *Ofertas de hoy* (${sel.length})\n${lineas.join('\n')}\n\nVer todas → /admin/ofertas/panel`
    // Canal de la sucursal.
    const { data: canal } = await adm.from('canales').select('id').eq('tipo', 'sucursal').eq('sucursal_id', s.id).limit(1).maybeSingle()
    if (canal?.id) await adm.from('mensajes').insert({ canal_id: canal.id, autor_user_id: null, tipo: 'sistema', contenido })
    // Registrar destacados del día (log + dedupe).
    await adm.from('mostrador_destacados').insert(sel.map((o) => ({ sucursal_id: s.id, fecha: hoy, oferta_id: o.id })))
    entregadas++
  }
  return entregadas
}

/** Conteo para el chip "Ofertas de hoy (N)" en Mi día. */
export async function contarOfertasHoy(adm: Adm, sucursalId: string | null, esTodas: boolean): Promise<number> {
  const hoy = hoyAR()
  let q = adm.from('ofertas').select('id, sucursales_ids, fecha_inicio, fecha_fin', { count: 'exact' }).eq('estado', 'activa').limit(500)
  const { data } = await q
  return ((data ?? []) as any[]).filter((o) => {
    if (o.fecha_inicio && o.fecha_inicio > hoy) return false
    if (o.fecha_fin && o.fecha_fin < hoy) return false
    if (!esTodas && sucursalId) { const suc = (o.sucursales_ids ?? []) as string[]; if (suc.length && !suc.includes(sucursalId)) return false }
    return true
  }).length
}
