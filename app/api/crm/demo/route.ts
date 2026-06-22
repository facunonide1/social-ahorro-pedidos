import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCrm } from '@/lib/crm/gate'
import { AUTO_SEGMENTOS, evaluarSegmento } from '@/lib/crm/segmentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const NOMBRES = ['María', 'Juan', 'Ana', 'Carlos', 'Lucía', 'Pedro', 'Sofía', 'Diego', 'Valentina', 'Jorge', 'Camila', 'Roberto', 'Florencia', 'Marcos', 'Gabriela', 'Andrés', 'Paula', 'Sergio', 'Daniela', 'Luis']
const APELLIDOS = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'García', 'Sánchez', 'Romero', 'Torres', 'Díaz', 'Ruiz', 'Acosta', 'Benítez', 'Sosa']
const FUENTES_POOL = ['cuponera', 'crm_pedidos', 'tickets', 'web', 'sifaco']
const NIVELES = ['socio', 'socio', 'socio', 'plus', 'plus', 'premium']

function iso(d: number) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10) }

export async function POST(req: NextRequest) {
  const g = await gateCrm('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  let b: any; try { b = await req.json() } catch { b = {} }

  if (b?.accion === 'borrar') {
    // borrar en orden de dependencias
    await adm.from('campania_envios').delete().eq('es_demo', true)
    await adm.from('campanias_crm').delete().eq('es_demo', true)
    await adm.from('automatizaciones').delete().eq('es_demo', true)
    await adm.from('segmentos').delete().eq('es_demo', true)
    await adm.from('dedup_pendientes').delete().eq('es_demo', true)
    await adm.from('puntos_movimientos').delete().eq('es_demo', true)
    await adm.from('cliente_compras').delete().eq('es_demo', true)
    await adm.from('cliente_fuentes').delete().eq('es_demo', true)
    await adm.from('b2b_pedidos_recurrentes').delete().eq('es_demo', true)
    await adm.from('b2b_cuenta_corriente').delete().eq('es_demo', true)
    await adm.from('clientes').delete().eq('es_demo', true)
    return NextResponse.json({ ok: true, accion: 'borrar' })
  }

  // ---- cargar ----
  const { data: sucs } = await adm.from('sucursales').select('id').eq('activa', true).limit(4)
  const sucIds = ((sucs ?? []) as any[]).map((s) => s.id)
  const sucDe = (i: number) => sucIds.length ? sucIds[i % sucIds.length] : null
  const hoyMes = new Date().getMonth() + 1

  // 80 clientes B2C
  const clientes: any[] = []
  for (let i = 0; i < 80; i++) {
    const nombre = `${NOMBRES[i % NOMBRES.length]} ${APELLIDOS[(i * 3) % APELLIDOS.length]}`
    const nFuentes = 1 + (i % 3)               // 1-3 fuentes
    const fuentes = Array.from(new Set(Array.from({ length: nFuentes }, (_, k) => FUENTES_POOL[(i + k) % FUENTES_POOL.length])))
    const esClub = i % 2 === 0
    const gastado = Math.round(2000 + ((i * 997) % 90000))   // varía; algunos altos (VIP)
    const ultDias = (i % 7 === 0) ? 5 : (i % 5 === 0) ? 60 : (i % 3 === 0) ? 38 : 12   // algunos en riesgo
    const riesgo = ultDias > 45 ? 'alto' : ultDias > 25 ? 'medio' : 'bajo'
    const freq = (i % 4 === 0) ? 30 : (i % 6 === 0) ? 28 : 90                          // crónicos ~30
    // cumpleaños: ~8 clientes este mes
    const mes = (i % 10 === 0) ? hoyMes : ((i % 12) + 1)
    const dia = ((i * 7) % 27) + 1
    clientes.push({
      tipo: 'b2c', nombre,
      dni: `${20000000 + i * 137}`,
      telefono: `11${String(40000000 + i * 211).slice(0, 8)}`,
      email: `${nombre.toLowerCase().replace(/[^a-z]/g, '.')}${i}@mail.com`,
      fecha_nacimiento: `19${60 + (i % 39)}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      sucursal_habitual_id: sucDe(i), fuentes,
      nivel: esClub ? NIVELES[i % NIVELES.length] : null, puntos: esClub ? (i * 53) % 8000 : 0,
      total_gastado_12m: gastado, n_compras_12m: 1 + (i % 18), ultima_compra: iso(ultDias),
      frecuencia_compra_dias: freq, riesgo_churn: riesgo, score_valor: Math.round(gastado / 1000),
      es_demo: true,
    })
  }
  const { data: insClientes } = await adm.from('clientes').insert(clientes).select('id, nombre, fuentes, ultima_compra, frecuencia_compra_dias, total_gastado_12m')
  const ids = ((insClientes ?? []) as any[]).map((c) => c.id)

  // cliente_fuentes (traza)
  const cf: any[] = []
  ;(insClientes ?? []).forEach((c: any, i: number) => {
    for (const f of c.fuentes) cf.push({ cliente_id: c.id, fuente: f, id_externo: `demo-${f}-${i}`, datos: {}, es_demo: true })
  })
  if (cf.length) await adm.from('cliente_fuentes').insert(cf)

  // compras (60 días) para un subconjunto
  const compras: any[] = []
  ;(insClientes ?? []).slice(0, 50).forEach((c: any, i: number) => {
    const nc = 2 + (i % 6)
    for (let k = 0; k < nc; k++) compras.push({ cliente_id: c.id, fecha: iso((k * 10 + (i % 9))), monto: 1500 + ((i * 311 + k * 97) % 12000), sucursal_id: sucDe(i), canal: ['local', 'web', 'pedido'][k % 3], fuente: 'sifaco', es_demo: true })
  })
  if (compras.length) await adm.from('cliente_compras').insert(compras)

  // 3 dedup_pendientes (de los primeros)
  if (ids.length >= 6) {
    await adm.from('dedup_pendientes').insert([
      { cliente_a: ids[0], cliente_b: ids[40], score_match: 92, criterio: 'telefono', es_demo: true },
      { cliente_a: ids[1], cliente_b: ids[41], score_match: 85, criterio: 'email', es_demo: true },
      { cliente_a: ids[2], cliente_b: ids[42], score_match: 78, criterio: 'nombre', es_demo: true },
    ])
  }

  // puntos_movimientos para los del Club
  const pm: any[] = []
  ;(insClientes ?? []).slice(0, 30).forEach((c: any, i: number) => {
    pm.push({ cliente_id: c.id, evento: 'cargar_ticket', puntos: 50, referencia_tipo: 'ticket', referencia_id: null, sincronizado: true, es_demo: true })
    if (i % 2 === 0) pm.push({ cliente_id: c.id, evento: 'compra', puntos: (i * 13) % 200, sincronizado: true, es_demo: true })
  })
  if (pm.length) await adm.from('puntos_movimientos').insert(pm)

  // 4 segmentos auto poblados
  for (const s of AUTO_SEGMENTOS) {
    const { count } = await evaluarSegmento(adm, s.regla, { esTodas: true })
    await adm.from('segmentos').insert({ nombre: s.nombre, descripcion: s.descripcion, tipo: 'auto', regla: s.regla, clave_auto: s.clave, n_clientes: count, dinamico: true, es_demo: true })
  }
  const { data: segRiesgo } = await adm.from('segmentos').select('id').eq('clave_auto', 'riesgo').eq('es_demo', true).maybeSingle()

  // 2 campañas (1 enviada con métricas, 1 borrador NORA)
  await adm.from('campanias_crm').insert([
    { nombre: 'Reactivación inactivos', segmento_id: segRiesgo?.id ?? null, objetivo: 'reactivar', canales: ['push', 'email'], mensaje: { push: { title: '¡Te extrañamos! 💚', body: 'Volvé con un beneficio.' } }, estado: 'enviada', redactado_por: 'nora', metricas: { enviados: 24, abiertos: 11, convirtieron: 5, facturacion: 38400, destinatarios: 24 }, es_demo: true },
    { nombre: 'Cumpleaños del mes', objetivo: 'cumpleanos', canales: ['push', 'whatsapp'], mensaje: { push: { title: '¡Feliz cumple! 🎂', body: 'Te regalamos un beneficio.' } }, estado: 'borrador', redactado_por: 'nora', metricas: {}, es_demo: true },
  ])

  // 3 automatizaciones (2 activas)
  await adm.from('automatizaciones').insert([
    { nombre: 'Saludo de cumpleaños', trigger: 'cumpleanos', config: {}, canales: ['push', 'whatsapp'], mensaje_template: { title: '¡Feliz cumple! 🎂', body: 'Pasá a buscar tu regalo' }, activa: true, n_disparos: 12, es_demo: true },
    { nombre: 'Reactivación 30 días', trigger: 'inactividad_30d', config: { dias_inactividad: 30 }, canales: ['email'], mensaje_template: { subject: 'Te extrañamos 💚', body: 'Volvé con un descuento' }, activa: true, n_disparos: 7, es_demo: true },
    { nombre: 'Recompra crónicos', trigger: 'recompra_cronico', config: { dias_antes_recompra: 5 }, canales: ['whatsapp'], mensaje_template: { body: '¿Se te está acabando la medicación? 💊' }, activa: false, n_disparos: 0, es_demo: true },
  ])

  // 1 cliente B2B ejemplo (geriátrico) + cta cte + recurrente
  const { data: b2b } = await adm.from('clientes').insert({ tipo: 'b2b', nombre: 'Geriátrico San José', cuit: '30-71234567-9', telefono: '1145678900', email: 'compras@sanjose.com', fuentes: ['sifaco'], total_gastado_12m: 480000, n_compras_12m: 12, es_demo: true }).select('id').single()
  if (b2b) {
    await adm.from('b2b_cuenta_corriente').insert({ cliente_id: b2b.id, saldo: 125000, limite_credito: 300000, es_demo: true })
    await adm.from('b2b_pedidos_recurrentes').insert({ cliente_id: b2b.id, nombre: 'Pedido mensual de crónicos', productos: [{ sku: 'MED-001', cantidad: 30 }, { sku: 'MED-014', cantidad: 20 }], frecuencia: 'mensual', proximo: iso(-7), es_demo: true })
  }

  return NextResponse.json({ ok: true, accion: 'cargar', clientes: clientes.length, compras: compras.length, b2b: 1 })
}
