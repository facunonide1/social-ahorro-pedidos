import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isCronRequest } from '@/lib/cron/auth'
import { conRegistro } from '@/lib/cron/corrida'
import type { AdminRole } from '@/lib/types/admin'
import { automatizacionActiva } from '@/lib/os/definicion'
import { puedeCalcular } from '@/lib/demo/guarda-calculo'
import { enTandas } from '@/lib/supabase/tandas'
import {
  diferenciaAlertas, filtrarRango, paginarConPlazo, Plazo, PlazoVencido, rangoDeTramo, tramoDeLaCorrida,
  PLAZO_ESCRITURA_MS, TRAMOS_POR_DEFECTO,
} from '@/lib/cron/tramos'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const LEAD_DAYS = 3 // lead time de reposición (config futura)

/**
 * Genera alertas_stock (OPS · T8): 9 tipos. Regenera las activas no-demo cada
 * corrida (preserva atendidas/descartadas e históricas demo). GET cron / POST super.
 */
async function get(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'sin_secret' }, { status: 401 })
  // DOS automatizaciones declaradas comparten esta ruta: recalcular las alertas
  // de stock y avisar los vencimientos. Se preguntan por separado porque son dos
  // decisiones distintas, y apagar una no tiene por qué apagar la otra.
  //
  // La pregunta va en el GET y no en run(): el POST de abajo es una persona
  // apretando un botón, y gobernar eso sería gobernar una acción.

  // Y aunque esté encendida, no calcula sobre datos de demostración: el número
  // que produce se GUARDA, y un histórico falso no se nota después (v0.81).
  // La condición se evalúa acá y no en run(): el POST de abajo es una persona
  // apretando un botón, y eso ya es una decisión tomada.
  const g = await puedeCalcular('alertas-stock')
  if (!g.puede) return NextResponse.json({ ok: true, omitida: g.motivo })
  return run(
    await automatizacionActiva('stock', 'recalcular_alertas', true),
    await automatizacionActiva('stock', 'avisar_vencimientos', true),
    tramoDeLaCorrida(new URL(req.url), new Date(), TRAMOS_POR_DEFECTO),
  )
}
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb.from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || !['super_admin', 'gerente'].includes(me.rol)) return NextResponse.json({ error: 'requiere super_admin/gerente' }, { status: 403 })
  // Una persona apretando el botón corre un tramo (el de `?tramo=`, o el que
  // toca por reloj). Correr los seis seguidos no entra en 60 s.
  return run(true, true, tramoDeLaCorrida(new URL(req.url), new Date(), TRAMOS_POR_DEFECTO))
}

async function run(conAlertas: boolean, conVencimientos: boolean, tramo: number) {
  const adm = createAdminClient()
  const ahora = Date.now()
  const en = (d: number) => new Date(ahora + d * 86_400_000).toISOString().slice(0, 10)
  const hoy = new Date().toISOString().slice(0, 10)
  const n = TRAMOS_POR_DEFECTO
  const rango = rangoDeTramo(tramo, n)
  const plazo = new Plazo()
  const rg = <Q extends { gte: any; lt: any }>(q: Q) => filtrarRango(q, 'producto_id', rango)

  try {
    return await calcularYEscribir()
  } catch (e) {
    // Se pasó el plazo de lectura: no se escribió nada de este tramo y las
    // alertas que había siguen. La próxima pasada del mismo tramo (la ventana
    // corre cada uno dos veces) lo retoma.
    if (e instanceof PlazoVencido) {
      return NextResponse.json({ ok: false, pendiente: true, tramo, de: n, error: e.message }, { status: 503 })
    }
    throw e
  }

  async function calcularYEscribir() {
  // Todo leído sólo para los productos del tramo, en todas las sucursales.
  // El orden lleva `id`: con `producto_id` solo (se repite por sucursal) el
  // paginado por offset puede saltear o repetir filas.
  const [stock, rot, lotes, prods, { data: sucs }] = await Promise.all([
    paginarConPlazo<any>(rg(adm.from('stock_items').select('producto_id, sucursal_id, cantidad, cantidad_gondola, cantidad_deposito, stock_minimo, stock_maximo')).order('id'), 'stock_items', plazo),
    paginarConPlazo<any>(rg(adm.from('producto_rotacion').select('producto_id, sucursal_id, venta_diaria_prom_30d, dias_stock_restante, ultima_venta')).order('id'), 'producto_rotacion', plazo),
    paginarConPlazo<any>(rg(adm.from('lotes_productos').select('id, producto_id, sucursal_id, numero_lote, fecha_vencimiento, cantidad_actual').gt('cantidad_actual', 0)).order('id'), 'lotes_productos', plazo),
    paginarConPlazo<any>(filtrarRango(adm.from('productos_catalogo').select('id, sku, nombre').eq('activo', true).eq('es_demo', false), 'id', rango).order('id'), 'productos_catalogo', plazo),
    adm.from('sucursales').select('id, nombre').eq('activa', true),
  ])
  const prodMap = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))
  const sucMap = new Map(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const rotMap = new Map(((rot ?? []) as any[]).map((r) => [`${r.producto_id}|${r.sucursal_id}`, r]))
  const nombre = (id: string) => prodMap.get(id)?.nombre ?? '—'
  const sku = (id: string) => prodMap.get(id)?.sku ?? null

  type Alerta = { tipo: string; producto_id: string | null; sucursal_id: string | null; lote_id?: string | null; severidad: string; datos: any }
  const out: Alerta[] = []

  // Stock / rotación
  for (const s of (conAlertas ? ((stock ?? []) as any[]) : [])) {
    const cant = Number(s.cantidad), min = Number(s.stock_minimo), max = s.stock_maximo == null ? null : Number(s.stock_maximo)
    const gondola = Number(s.cantidad_gondola ?? 0), deposito = Number(s.cantidad_deposito ?? 0)
    const r = rotMap.get(`${s.producto_id}|${s.sucursal_id}`)
    const venta30 = Number(r?.venta_diaria_prom_30d ?? 0)
    const dias = r?.dias_stock_restante == null ? null : Number(r.dias_stock_restante)
    const base = { producto_id: s.producto_id, sucursal_id: s.sucursal_id, datos: { nombre: nombre(s.producto_id), sku: sku(s.producto_id), sucursal: sucMap.get(s.sucursal_id), stock: cant, min } }

    if (min > 0 && cant <= min) out.push({ ...base, tipo: 'stock_critico', severidad: cant <= 0 ? 'critica' : 'warning' })
    // Reponer góndola: hay stock en depósito pero la góndola está en/bajo el mínimo.
    if (deposito > 0 && (gondola <= min || gondola <= 0)) out.push({ ...base, tipo: 'reponer_gondola', severidad: gondola <= 0 ? 'warning' : 'info', datos: { ...base.datos, gondola, deposito } })
    if (dias != null && venta30 > 0 && dias <= LEAD_DAYS) out.push({ ...base, tipo: 'quiebre_proyectado', severidad: 'critica', datos: { ...base.datos, dias } })
    if (max != null && cant > max) out.push({ ...base, tipo: 'sobrestock', severidad: 'info', datos: { ...base.datos, max } })

    if (cant > 0 && venta30 === 0) {
      const ult = r?.ultima_venta ? new Date(r.ultima_venta).getTime() : null
      const diasSinVender = ult ? (ahora - ult) / 86_400_000 : null
      if (ult && diasSinVender != null && diasSinVender > 30 && diasSinVender < 120) {
        out.push({ ...base, tipo: 'stock_fantasma', severidad: 'critica', datos: { ...base.datos, ultima_venta: r.ultima_venta } })
      } else {
        out.push({ ...base, tipo: 'sin_rotacion', severidad: 'warning' })
      }
    }
  }

  // Vencimientos por lote
  const v15 = en(15), v30 = en(30), v60 = en(60), v90 = en(90)
  for (const l of (conVencimientos ? ((lotes ?? []) as any[]) : [])) {
    const f = l.fecha_vencimiento
    if (!f || f > v90) continue
    const tipo = f <= v15 ? 'vencimiento_15' : f <= v30 ? 'vencimiento_30' : f <= v60 ? 'vencimiento_60' : 'vencimiento_90'
    const sev = f <= v15 ? 'critica' : f <= v30 ? 'warning' : 'info'
    out.push({ tipo, producto_id: l.producto_id, sucursal_id: l.sucursal_id, lote_id: l.id, severidad: sev,
      datos: { nombre: nombre(l.producto_id), sku: sku(l.producto_id), sucursal: sucMap.get(l.sucursal_id), lote: l.numero_lote, vence: f, cantidad: Number(l.cantidad_actual) } })
  }

  // Ventana de devolución por cerrar (OS-3): ≤7 días para devolver a la droguería.
  // Solo vencimientos manuales con proveedor+ventana (los lotes no tienen proveedor).
  try {
    if (!conVencimientos) throw new Error('vencimientos apagados')
    const [{ filas: vencs }, { data: provs }, { data: rubros }] = await Promise.all([
      paginarConPlazo<any>(rg(adm.from('vencimientos').select('id, producto_id, sucursal_id, sku, proveedor_id, fecha_vencimiento, cantidad, productos_catalogo(nombre, rubro)')
        .eq('estado', 'vigente').eq('es_demo', false).not('proveedor_id', 'is', null)).order('id'), 'vencimientos', plazo).then((filas) => ({ filas })),
      adm.from('proveedores').select('id, dias_ventana_devolucion'),
      adm.from('proveedor_devolucion_rubros').select('proveedor_id, rubro, dias_ventana'),
    ])
    const provDef = new Map(((provs ?? []) as any[]).map((p) => [p.id, p.dias_ventana_devolucion ?? null]))
    const provRub = new Map<string, number>()
    for (const r of (rubros ?? []) as any[]) provRub.set(`${r.proveedor_id}|${String(r.rubro).toLowerCase()}`, r.dias_ventana)
    for (const v of (vencs ?? []) as any[]) {
      const rubro = v.productos_catalogo?.rubro as string | null
      const dias = (rubro && provRub.get(`${v.proveedor_id}|${rubro.toLowerCase()}`)) ?? provDef.get(v.proveedor_id) ?? null
      if (dias == null) continue
      const cierre = new Date(new Date(v.fecha_vencimiento).getTime() - Number(dias) * 86_400_000)
      const restan = Math.ceil((cierre.getTime() - ahora) / 86_400_000)
      if (restan >= 0 && restan <= 7) {
        out.push({ tipo: 'ventana_devolucion_por_cerrar', producto_id: v.producto_id, sucursal_id: v.sucursal_id, severidad: 'critica',
          datos: { nombre: v.productos_catalogo?.nombre ?? v.sku, sku: v.sku, sucursal: sucMap.get(v.sucursal_id), cierre: cierre.toISOString().slice(0, 10), dias: restan, cantidad: Number(v.cantidad) } })
      }
    }
  } catch (e) {
    // La alerta de ventana no bloquea el cron, salvo el plazo: si se pasó,
    // cortar acá es lo que evita escribir un tramo a medias.
    if (e instanceof PlazoVencido) throw e
  }
  plazo.exigir(40_000, 'lectura del tramo')

  // Regenerar activas no-demo, SÓLO de los tipos que esta corrida vuelve a
  // calcular.
  //
  // Antes borraba todas. Con dos automatizaciones gobernables por separado eso
  // era destructivo: apagar los avisos de vencimiento borraba los que ya
  // estaban, y apagar no deshace lo hecho. Con las dos prendidas el conjunto
  // borrado es el mismo que antes.
  const TIPOS_STOCK = ['stock_critico', 'reponer_gondola', 'quiebre_proyectado', 'sobrestock', 'stock_fantasma', 'sin_rotacion']
  const TIPOS_VENCIMIENTO = ['vencimiento_15', 'vencimiento_30', 'vencimiento_60', 'vencimiento_90', 'ventana_devolucion_por_cerrar']
  const aRegenerar = [...(conAlertas ? TIPOS_STOCK : []), ...(conVencimientos ? TIPOS_VENCIMIENTO : [])]
  // ── ESCRIBIR SÓLO LA DIFERENCIA ────────────────────────────────────────
  //
  // Antes se borraban todas las activas y se insertaban de nuevo: si el insert
  // se caía, la pantalla quedaba vacía. Ahora se leen las activas del tramo y
  // se escribe la diferencia: se borra lo que ya no vale, lo que cambió se
  // borra e inserta de a pares en la misma tanda (el índice único no deja
  // tener dos activas iguales), y se inserta lo nuevo. Lo que no cambió no se
  // toca. Si el plazo de escritura se pasa, se corta entre tandas: lo que no se
  // llegó a tocar queda en la versión anterior, nunca vacío.
  const existentes = aRegenerar.length
    ? await paginarConPlazo<any>(rg(adm.from('alertas_stock').select('id, tipo, producto_id, sucursal_id, lote_id, severidad, datos')
        .eq('estado', 'activa').eq('es_demo', false).in('tipo', aRegenerar)).order('id'), 'alertas_stock', plazo)
    : []
  const nuevasDelTramo = out.filter((a) => aRegenerar.includes(a.tipo))
  const dif = diferenciaAlertas(existentes, nuevasDelTramo)
  const fila = (a: Alerta) => ({ ...a, lote_id: a.lote_id ?? null, estado: 'activa' })

  let escritas = { borradas: 0, reemplazadas: 0, insertadas: 0 }
  let cortada = false
  const hayTiempo = () => plazo.queda(PLAZO_ESCRITURA_MS) || ((cortada = true), false)

  for (const ids of enTandas(dif.borrar, 100)) {
    if (!hayTiempo()) break
    const { error } = await adm.from('alertas_stock').delete().in('id', ids)
    if (error) throw new Error(`no se pudieron borrar alertas viejas (llevaba ${escritas.borradas}): ${error.message}`)
    escritas.borradas += ids.length
  }
  for (const par of enTandas(dif.reemplazar, 100)) {
    if (cortada || !hayTiempo()) break
    const { error: eD } = await adm.from('alertas_stock').delete().in('id', par.map((p) => p.id))
    if (eD) throw new Error(`no se pudieron reemplazar alertas (llevaba ${escritas.reemplazadas}): ${eD.message}`)
    const { error: eI } = await adm.from('alertas_stock').insert(par.map((p) => fila(p.nueva)))
    if (eI) throw new Error(`se borraron ${par.length} alertas para reemplazarlas y no entraron las nuevas: ${eI.message}`)
    escritas.reemplazadas += par.length
  }
  const insertadas: Alerta[] = []
  for (const grupo of enTandas(dif.insertar, 500)) {
    if (cortada || !hayTiempo()) break
    const { error } = await adm.from('alertas_stock').insert(grupo.map(fila))
    if (error) throw new Error(`no se pudieron insertar alertas (llevaba ${escritas.insertadas}): ${error.message}`)
    escritas.insertadas += grupo.length
    insertadas.push(...grupo)
  }

  // Notificar stock fantasma a super_admins
  // Sólo las nuevas: antes se avisaba cada día el mismo fantasma, y ahora
  // además corre por tramos.
  const fantasmas = insertadas.filter((a) => a.tipo === 'stock_fantasma')
  if (fantasmas.length > 0) {
    const { data: supers } = await adm.from('users_admin').select('id').eq('rol', 'super_admin').eq('activo', true)
    if (supers?.length) {
      await adm.from('notificaciones_admin').insert(supers.flatMap((s: any) =>
        fantasmas.slice(0, 10).map((f) => ({ user_id: s.id, tipo: 'alerta', prioridad: 'critica', titulo: 'Posible stock fantasma', mensaje: `${f.datos.nombre} (${f.datos.sucursal}) dejó de vender con stock`, url_accion: '/admin/operaciones/alertas' }))))
    }
  }

  return NextResponse.json({
    ok: !cortada,
    fecha: hoy,
    tramo, de: n,
    alertas: nuevasDelTramo.length,
    ...escritas,
    fantasmas: fantasmas.length,
    ...(cortada ? { pendiente: true, error: 'se pasó el plazo de escritura; la próxima pasada del tramo sigue' } : {}),
    ...(conAlertas && conVencimientos ? {} : { omitidas: { alertas: !conAlertas, vencimientos: !conVencimientos } }),
  }, { status: cortada ? 503 : 200 })
  }
}

export const GET = conRegistro('alertas-stock', get)
