import { emitirAviso } from '@/lib/ai/nora'

import { agentePorId, type Nivel } from './elenco'

/**
 * QUÉ PASA CUANDO UN AGENTE ACTÚA.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE ─────────────────────────────────────────────
 *
 * No construye acciones nuevas. Cada ejecutor **conecta con lo que ya existe**:
 * Abasto no tiene su propio motor de órdenes, escribe en `ordenes_compra` igual
 * que la pantalla de compras. Si un agente creara su propia versión de algo, en
 * tres semanas habría dos órdenes de compra distintas y ninguna sería la buena.
 *
 * ── EL NIVEL DECIDE QUÉ PASA ────────────────────────────────────────────────
 *
 *   nunca         ni se ofrece
 *   sugiere       queda en la lista de decisiones y nada más
 *   prepara       lo deja hecho en borrador, esperando confirmación
 *   hace_y_avisa  lo ejecuta y lo deja en la bitácora, con deshacer
 *
 * ── Y EL TOPE SIN DEFINIR NO ES INFINITO ────────────────────────────────────
 *
 * Un agente en «hace y avisa» sin tope de monto NO ejecuta: deja preparado y
 * avisa que falta el tope. En la v0.98 esto era una advertencia al guardar la
 * configuración; acá es el comportamiento.
 *
 * El motivo es simple: el tope es lo único que acota el daño de un ejecutor con
 * un error de cálculo. Sin tope, «hace y avisa» es «hace lo que sea».
 */

type Adm = any

export type ResultadoEjecucion = {
  ok: boolean
  /** Qué pasó, en castellano, para la bitácora y la tarjeta del agente. */
  texto: string
  /** Qué nivel se aplicó DE VERDAD. Puede ser menor que el configurado. */
  nivelAplicado: Nivel
  /** Por qué se degradó, si se degradó. */
  degradado?: string
  /** La entidad que se creó, para poder deshacerla. */
  entidad?: { tabla: string; id: string }
  /**
   * El número de partida contra el que el medidor va a comparar dentro de 30
   * días. **Sin esto la propuesta no se puede medir nunca**: el medidor lo
   * dice y la deja en null. Es la diferencia entre un agente que se puede
   * evaluar y uno que no.
   */
  esperado?: Record<string, unknown>
  /** Si falla, el error. No se reintenta: lo mira una persona. */
  error?: string
}

export interface ContextoEjecucion {
  adm: Adm
  agenteId: string
  accion: string
  sucursalId: string | null
  userId: string | null
  nivel: Nivel
  limiteMonto: number | null
}

/**
 * Un ejecutor devuelve qué hizo. Recibe el nivel ya resuelto: la decisión de
 * si ejecuta o sólo prepara se toma afuera, en `ejecutar()`, para que ningún
 * ejecutor pueda saltársela por olvido.
 */
type Ejecutor = (c: ContextoEjecucion, ejecutaDeVerdad: boolean) => Promise<ResultadoEjecucion>

const ars = (x: number) => `$${Math.round(x).toLocaleString('es-AR')}`

/** Cuántos quiebres hay ahora. Es el número de partida del medidor. */
async function quiebresAhora(c: ContextoEjecucion): Promise<number> {
  let q = c.adm.from('quiebres_por_sucursal').select('producto_id', { count: 'exact', head: true })
  if (c.sucursalId) q = q.eq('sucursal_id', c.sucursalId)
  const { count } = await q
  return count ?? 0
}

/**
 * Monto en juego de una acción, para contrastarlo con el tope.
 *
 * Devuelve `{ monto: null }` cuando la acción no tiene un monto asociado, y
 * `{ vencido: true }` cuando el número existe pero es viejo.
 *
 * ── POR QUÉ IMPORTA LA FECHA ────────────────────────────────────────────────
 *
 * El monto sale del snapshot diario (migración 0204). Para mostrar en pantalla
 * un número de ayer está bien, y la pantalla dice de cuándo es. Para decidir
 * si un agente actúa SOLO, no: el tope es lo único que separa «hace y avisa»
 * de «hace lo que quiera», y compararlo contra un número viejo es compararlo
 * contra otra cosa.
 *
 * Si el snapshot está vencido, el agente no ejecuta: deja preparado y lo dice.
 * Es la misma regla que el tope sin definir — ante la duda, no actúa.
 */
const HORAS_DE_VIDA_DEL_MONTO = 36

async function montoDe(c: ContextoEjecucion): Promise<
  { monto: number | null; vencido: false } | { monto: null; vencido: true; calculadoAt: string | null }
> {
  switch (`${c.agenteId}:${c.accion}`) {
    case 'abasto:sacar_de_otra_sucursal':
    case 'abasto:proponer_transferencia':
    case 'reparto:proponer_movimiento': {
      // ESTO LO ESCRIBÍ MAL EN ESTE MISMO BLOQUE: traía las filas y sumaba en
      // memoria, con `limit(1000)` sobre una vista de 2.909. El monto salía
      // más chico que el real, y el tope es justamente lo que decide si el
      // agente ejecuta solo: un monto subestimado lo habría dejado actuar
      // cuando no correspondía.
      //
      // Lo cazó el auditor extendido de este mismo bloque, diez minutos
      // después de extenderlo.
      const { data } = await c.adm.rpc('agentes_resumen', { p_sucursal: c.sucursalId })
      const r = data as any
      const calculadoAt: string | null = r?.calculado_at ?? null
      if (!r || !calculadoAt) return { monto: null, vencido: true, calculadoAt }
      const horas = (Date.now() - new Date(calculadoAt).getTime()) / 3_600_000
      if (horas > HORAS_DE_VIDA_DEL_MONTO) return { monto: null, vencido: true, calculadoAt }
      return { monto: Number(r?.abasto?.plata_a_transferir ?? 0), vencido: false }
    }
    default:
      return { monto: null, vencido: false }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LOS EJECUTORES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Proponer mover stock en vez de comprarlo.
 *
 * Crea la transferencia en `solicitada` con `origen_pedido = 'propuso_nora'`,
 * que es el circuito de la v0.97. **No mueve stock**: el stock se mueve en
 * SIFACO y esto es el pedido entre encargados, con sus tres fotos.
 */
const proponerTransferencia: Ejecutor = async (c, ejecuta) => {
  const { data: pares } = await c.adm
    .from('transferir_antes_de_comprar')
    .select('producto_id, destino_id, origen_id, transferir, plata_que_no_hay_que_gastar, el_origen_no_lo_vende')
    .eq(c.sucursalId ? 'destino_id' : 'el_origen_no_lo_vende', c.sucursalId ?? true)
    .order('plata_que_no_hay_que_gastar', { ascending: false })
    .limit(50)

  const filas = (pares ?? []) as any[]
  if (!filas.length) {
    return { ok: true, nivelAplicado: c.nivel, texto: 'No hay nada para mover: ningún producto falta acá y sobra en otra sucursal.' }
  }

  // Un pedido por par origen→destino: una transferencia con productos de tres
  // sucursales distintas no se puede despachar.
  const porPar = new Map<string, any[]>()
  for (const f of filas) {
    const k = `${f.origen_id}|${f.destino_id}`
    porPar.set(k, [...(porPar.get(k) ?? []), f])
  }
  const [k, items] = [...porPar.entries()][0]
  const [origen, destino] = k.split('|')
  const plata = items.reduce((a, i) => a + Number(i.plata_que_no_hay_que_gastar ?? 0), 0)

  if (!ejecuta) {
    return {
      ok: true, nivelAplicado: c.nivel,
      texto: `Hay ${items.length} producto(s) para mover por ${ars(plata)}. Queda propuesto; crear el pedido lo confirma una persona.`,
    }
  }

  const { data: tr, error } = await c.adm.from('transferencias_sucursal').insert({
    sucursal_origen_id: origen,
    sucursal_destino_id: destino,
    estado: 'solicitada',
    origen_pedido: 'propuso_nora',
    solicitado_por: c.userId,
    observaciones: `Propuesto por Reparto: ${items.length} producto(s), ${ars(plata)} que no hay que gastar.`,
  }).select('id').maybeSingle()

  if (error) return { ok: false, nivelAplicado: c.nivel, texto: 'No se pudo crear el pedido.', error: error.message }

  const { error: eI } = await c.adm.from('transferencia_items').insert(
    items.map((i) => ({
      transferencia_id: tr.id, producto_id: i.producto_id,
      cantidad_solicitada: Number(i.transferir),
    })),
  )
  if (eI) return { ok: false, nivelAplicado: c.nivel, texto: 'Se creó el pedido pero no se pudieron cargar los renglones.', error: eI.message, entidad: { tabla: 'transferencias_sucursal', id: tr.id } }

  return {
    ok: true, nivelAplicado: c.nivel,
    // Lo que el medidor va a mirar: si en el destino se vendió al menos lo
    // que se movió. Si se movieron 20 y se vendieron 3, movió el problema.
    esperado: { unidades_movidas: items.reduce((a: number, i: any) => a + Number(i.transferir ?? 0), 0) },
    texto: `Pedido de transferencia creado con ${items.length} producto(s), ${ars(plata)}. Queda en «solicitada»`
      + (c.nivel === 'prepara'
          ? ', esperando que lo confirme el encargado de la otra sucursal.'
          : ': el stock se mueve en SIFACO y las tres fotos las carga quien despacha.'),
    entidad: { tabla: 'transferencias_sucursal', id: tr.id },
  }
}

/**
 * Armar el pedido de compra.
 *
 * Tope por acción: **nunca llega a «hace y avisa»**. Emitir una orden
 * compromete plata con un proveedor, y eso lo firma una persona. Lo máximo que
 * hace es dejarla en `borrador`.
 */
const armarPedido: Ejecutor = async (c, ejecuta) => {
  const { data: urg } = await c.adm.from('reco_compras_urgencia').select('urgencia, items, monto')
  const u = ((urg ?? []) as any[]).filter((x) => ['ya', 'esta_semana'].includes(x.urgencia))
  const items = u.reduce((a, x) => a + Number(x.items ?? 0), 0)
  const monto = u.reduce((a, x) => a + Number(x.monto ?? 0), 0)

  if (!items) return { ok: true, nivelAplicado: c.nivel, texto: 'No hay nada urgente para pedir.' }
  if (!ejecuta) {
    return { ok: true, nivelAplicado: c.nivel, texto: `${items.toLocaleString('es-AR')} ítems urgentes por ${ars(monto)} esperando que alguien arme el pedido.` }
  }

  // «Prepara»: la orden queda en borrador, sin proveedor y sin enviar.
  const { data: suc } = await c.adm.from('sucursales')
    .select('id').eq('activa', true).order('codigo').limit(1).maybeSingle()
  const { data: prov } = await c.adm.from('proveedores')
    .select('id').eq('activo', true).eq('es_drogueria', true).limit(1).maybeSingle()
  if (!prov) return { ok: false, nivelAplicado: c.nivel, texto: 'No hay ninguna droguería activa a la que pedirle.', error: 'sin proveedor' }

  const { data: oc, error } = await c.adm.from('ordenes_compra').insert({
    proveedor_id: prov.id, sucursal_compradora_id: suc?.id, rubro: 'farmacia',
    estado: 'borrador', origen: 'sugerencia_nora', total_estimado: monto, condicion_pago: 'contado',
  }).select('id, codigo').maybeSingle()
  if (error) return { ok: false, nivelAplicado: c.nivel, texto: 'No se pudo crear el borrador.', error: error.message }

  return {
    ok: true, nivelAplicado: c.nivel,
    // Cuántos quiebres había al proponer: es contra esto que el medidor
    // compara dentro de 30 días.
    esperado: { quiebres: await quiebresAhora(c) },
    texto: `Orden ${oc.codigo} en borrador con ${items.toLocaleString('es-AR')} ítems por ${ars(monto)}. Falta elegir la droguería y emitirla: eso compromete plata y lo firma una persona.`,
    entidad: { tabla: 'ordenes_compra', id: oc.id },
  }
}

/** Dejar una oferta en borrador. No cambia ningún precio: la aprueba alguien. */
const prepararOferta: Ejecutor = async (c, ejecuta) => {
  const { data: bajo } = await c.adm.from('canal_estado')
    .select('sku', { count: 'exact', head: true }).eq('problema', 'no_cubre_costo')
  const n = (bajo as any)?.length ?? 0

  if (!ejecuta) {
    return { ok: true, nivelAplicado: c.nivel, texto: 'Hay productos para ofertar. Armar la oferta lo confirma una persona.' }
  }
  const { data: of, error } = await c.adm.from('ofertas').insert({
    nombre: `Propuesta de Margen · ${new Date().toLocaleDateString('es-AR')}`,
    tipo: 'porcentaje_descuento', valor: 0,
    estado: 'borrador', origen: 'liquidacion_propia',
    justificacion: 'Propuesta por el agente Margen. El porcentaje y los productos los define una persona: una oferta es un precio, y SIFACO es la autoridad del precio.',
    propuesta_por: c.userId, created_by: c.userId,
  }).select('id, codigo').maybeSingle()
  if (error) return { ok: false, nivelAplicado: c.nivel, texto: 'No se pudo crear el borrador.', error: error.message }
  return {
    ok: true, nivelAplicado: c.nivel,
    texto: `Oferta ${of.codigo ?? ''} en borrador, sin porcentaje y sin productos. Eso lo define una persona.`,
    entidad: { tabla: 'ofertas', id: of.id },
  }
}

/** Avisar. Es lo más reversible que hay: un aviso de más se ignora. */
function avisar(
  tipo: string,
  titulo: (c: ContextoEjecucion, d: any) => Promise<{ t: string; d: string; esperado?: Record<string, unknown> } | null>,
): Ejecutor {
  return async (c, ejecuta) => {
    const r = await titulo(c, null)
    if (!r) return { ok: true, nivelAplicado: c.nivel, texto: 'No hay nada que avisar.' }
    if (!ejecuta) return { ok: true, nivelAplicado: c.nivel, texto: r.t }
    try {
      await emitirAviso(c.adm, {
        tipo: tipo as any, severidad: 'sugerencia', modulo: 'operaciones',
        sucursalId: c.sucursalId, titulo: r.t, detalle: r.d,
        claveDedup: `agente:${c.agenteId}:${c.accion}:${new Date().toISOString().slice(0, 10)}`,
        esDemo: false,
      })
    } catch (e: any) {
      return { ok: false, nivelAplicado: c.nivel, texto: 'No se pudo emitir el aviso.', error: e?.message }
    }
    return { ok: true, nivelAplicado: c.nivel, texto: `Avisado: ${r.t}`, esperado: r.esperado }
  }
}


// ════════════════════════════════════════════════════════════════════════════
// v1.1 · EL AGENTE CONVENIO
// ════════════════════════════════════════════════════════════════════════════

/**
 * D.4 · ARMAR LA PRESENTACIÓN Y DEJARLA EN BORRADOR.
 *
 * Nunca la envía, ni en `hace_y_avisa` — que para este agente no existe: el
 * techo de todas sus acciones es «prepara» (ver `elenco.ts`).
 *
 * Lo que hace en «prepara»: crea la presentación en `borrador` y le mete los
 * comprobantes sueltos del período. Falta que una persona la mire y la mande.
 *
 * ── POR QUÉ NO ENVÍA ────────────────────────────────────────────────────────
 *
 * Porque una presentación mal armada se manda y no se vuelve: la obra social
 * la debita entera y el período se pierde. No es un riesgo teórico — es el
 * caso normal de un error de carga.
 */
const armarPresentacion: Ejecutor = async (c, ejecuta) => {
  // El convenio que cierra más cerca y no tiene la presentación armada.
  const { data: cierres } = await c.adm
    .from('convenio_cierres_proximos')
    .select('convenio_id, convenio, sucursal_id, sucursal, cierre, dias, aviso_dias_antes, ya_presentada')
    .not('dias', 'is', null)
    .eq('ya_presentada', false)
    .order('dias')
    .limit(1)
  const k = (cierres ?? [])[0] as any
  if (!k) {
    return { ok: true, nivelAplicado: c.nivel, texto: 'No hay ninguna presentación por armar con cierre a la vista.' }
  }
  if (Number(k.dias) > Number(k.aviso_dias_antes)) {
    return {
      ok: true, nivelAplicado: c.nivel,
      texto: `La próxima es ${k.convenio} en ${k.sucursal}, que cierra en ${k.dias} días. Todavía está lejos del plazo de aviso (${k.aviso_dias_antes}).`,
    }
  }

  // El período: desde el último cierre presentado hasta el cierre que viene.
  const hasta = String(k.cierre)
  const desde = new Date(new Date(hasta).getTime() - 31 * 86400000).toISOString().slice(0, 10)

  const { count: sueltos } = await c.adm
    .from('convenio_comprobantes').select('id', { count: 'exact', head: true })
    .eq('convenio_id', k.convenio_id).eq('sucursal_id', k.sucursal_id)
    .is('presentacion_id', null).eq('estado', 'sin_presentar')
    .gte('fecha', desde).lte('fecha', hasta)

  const texto = `${k.convenio} en ${k.sucursal} cierra en ${k.dias} día(s) y no está armada. ` +
    `Hay ${sueltos ?? 0} comprobante(s) sin presentar del período ${desde} a ${hasta}.`

  if (!ejecuta) return { ok: true, nivelAplicado: c.nivel, texto }

  if (!sueltos) {
    return {
      ok: true, nivelAplicado: c.nivel,
      texto: texto + ' No armo nada: una presentación vacía es perder el período igual que no presentarla.',
    }
  }

  const { data: pres, error } = await c.adm.from('convenio_presentaciones').insert({
    convenio_id: k.convenio_id, sucursal_id: k.sucursal_id,
    periodo_desde: desde, periodo_hasta: hasta, estado: 'borrador',
    armada_por: c.userId, armada_at: new Date().toISOString(),
    notas: 'Armada por el agente Convenio. Falta revisarla y enviarla.',
  }).select('id').maybeSingle()

  if (error || !pres) {
    return {
      ok: false, nivelAplicado: c.nivel, texto: 'No se pudo armar la presentación.',
      error: error?.message ?? 'sin id',
    }
  }

  await c.adm.from('convenio_comprobantes')
    .update({ presentacion_id: pres.id, estado: 'en_presentacion' })
    .eq('convenio_id', k.convenio_id).eq('sucursal_id', k.sucursal_id)
    .is('presentacion_id', null).eq('estado', 'sin_presentar')
    .gte('fecha', desde).lte('fecha', hasta)

  const { data: rec } = await c.adm.rpc('convenio_presentacion_recalcular', { p_presentacion: pres.id })
  const total = Number(((rec ?? []) as any[])[0]?.total ?? 0)

  return {
    ok: true, nivelAplicado: c.nivel,
    texto: `Presentación de ${k.convenio} (${k.sucursal}) armada en BORRADOR con ${sueltos} comprobante(s) por ${ars(total)}. ` +
      'No la envié: la revisa y la manda una persona.',
    entidad: { tabla: 'convenio_presentaciones', id: pres.id },
    // El medidor va a comparar contra esto dentro de 30 días: si la
    // presentación se envió, el agente acertó al avisar que había que armarla.
    esperado: { presentacion_id: pres.id, comprobantes: sueltos, total },
  }
}

/** Los avisos del agente Convenio. Todos leen vistas que ya existen. */
const avisarCierre = avisar('tarea_vencida', async (c) => {
  const { data } = await c.adm.from('convenio_cierres_proximos')
    .select('convenio, sucursal, dias, aviso_dias_antes, comprobantes_sueltos, ya_presentada')
    .not('dias', 'is', null).eq('ya_presentada', false).order('dias')
  const filas = ((data ?? []) as any[]).filter((k) => Number(k.dias) <= Number(k.aviso_dias_antes))
  if (!filas.length) return null
  const k = filas[0]
  return {
    t: `${filas.length} presentación(es) cierran pronto y no están armadas`,
    d: `La más próxima es ${k.convenio} en ${k.sucursal}: cierra en ${k.dias} día(s) y tiene ` +
       `${k.comprobantes_sueltos} comprobante(s) sin presentar. Pasado el cierre, lo que no entró ` +
       'no se presenta ni se reclama: es la pérdida más evitable de todas.',
    esperado: { presentaciones_por_vencer: filas.length },
  }
})

const avisarDebitoPorVencer = avisar('tarea_vencida', async (c) => {
  const { data } = await c.adm.from('convenio_recupero')
    .select('convenio, sucursal, motivo_nombre, importe, vence_at, dias, situacion')
    .eq('situacion', 'reclamable y sin reclamar')
  const filas = (data ?? []) as any[]
  if (!filas.length) return null
  const pronto = filas.filter((d) => d.dias != null && Number(d.dias) <= 7)
  const plata = filas.reduce((a, d) => a + Number(d.importe), 0)
  return {
    t: `${ars(plata)} en débitos reclamables sin reclamar`,
    d: `Son ${filas.length} débito(s)` +
       (pronto.length
         ? `, y ${pronto.length} vencen dentro de 7 días por ${ars(pronto.reduce((a, d) => a + Number(d.importe), 0))}.`
         : '.') +
       ' Un débito reclamable que vence no se pierde por no saberlo: se pierde por enterarse tarde.',
    esperado: { reclamables: filas.length, plata_reclamable: plata },
  }
})

const avisarMotivoQueCrecio = avisar('tarea_vencida', async (c) => {
  // El trimestre contra el anterior. Se compara en la base con dos filtros de
  // fecha y no trayendo los débitos: un trimestre de cuatro sucursales pasa
  // las 1.000 filas y PostgREST corta sin avisar.
  const hoy = new Date()
  const d90 = new Date(hoy.getTime() - 90 * 86400000).toISOString().slice(0, 10)
  const d180 = new Date(hoy.getTime() - 180 * 86400000).toISOString().slice(0, 10)

  const { data: motivos } = await c.adm.from('convenio_debito_motivos').select('clave, nombre')
  const peor: { nombre: string; ahora: number; antes: number } | null = await (async () => {
    let top: { nombre: string; ahora: number; antes: number } | null = null
    for (const m of (motivos ?? []) as any[]) {
      const [{ data: a }, { data: b }] = await Promise.all([
        c.adm.rpc('convenios_suma_debitos', { p_motivo: m.clave, p_desde: d90, p_hasta: null }),
        c.adm.rpc('convenios_suma_debitos', { p_motivo: m.clave, p_desde: d180, p_hasta: d90 }),
      ])
      const ahora = Number(a ?? 0)
      const antes = Number(b ?? 0)
      if (antes > 0 && ahora > antes * 1.5 && (!top || ahora - antes > top.ahora - top.antes)) {
        top = { nombre: m.nombre, ahora, antes }
      }
    }
    return top
  })()

  if (!peor) return null
  return {
    t: `Los débitos por «${peor.nombre}» crecieron contra el trimestre anterior`,
    d: `Pasaron de ${ars(peor.antes)} a ${ars(peor.ahora)}. Un motivo que crece suele ser un ` +
       'paso del mostrador que se dejó de hacer, no mala suerte.',
    esperado: { motivo: peor.nombre, trimestre_anterior: peor.antes, trimestre_actual: peor.ahora },
  }
})

const avisarSucursalQueDebitaMas = avisar('tarea_vencida', async (c) => {
  const { data } = await c.adm.from('convenio_debitos_por_sucursal')
    .select('sucursal, motivo_nombre, plata, veces_el_promedio')
    .not('veces_el_promedio', 'is', null).gte('veces_el_promedio', 1.5)
    .order('plata', { ascending: false }).limit(1)
  const k = ((data ?? []) as any[])[0]
  if (!k) return null
  return {
    t: `${k.sucursal} debita ${Number(k.veces_el_promedio).toFixed(1)}× el promedio en «${k.motivo_nombre}»`,
    d: `Son ${ars(Number(k.plata))}. Puede ser un problema de proceso, o puede ser que despache ` +
       'más obra social que las demás: el número no lo dice. Lo que dice es dónde mirar.',
    esperado: { sucursal: k.sucursal, motivo: k.motivo_nombre, veces: Number(k.veces_el_promedio) },
  }
})

const avisarObraSocialQueCambio = avisar('tarea_vencida', async (c) => {
  const { data } = await c.adm.rpc('convenios_que_debitan_mas')
  const k = ((data ?? []) as any[])[0]
  if (!k) return null
  return {
    t: `${k.convenio} empezó a debitar más de lo habitual`,
    d: `Pasó de ${ars(Number(k.antes))} a ${ars(Number(k.ahora))} entre un trimestre y el ` +
       'siguiente. Qué se hace con un convenio que empeoró es la decisión más grande del sector ' +
       'y no la toma un agente.',
    esperado: { convenio: k.convenio, antes: Number(k.antes), ahora: Number(k.ahora) },
  }
})

const EJECUTORES: Record<string, Ejecutor> = {
  // v1.1 · el agente Convenio. Todas sus acciones tienen techo en «prepara»:
  // ver `elenco.ts`. La puerta (`ejecutar`) lo fuerza, no el ejecutor.
  'convenio:armar_presentacion': armarPresentacion,
  'convenio:avisar_cierre': avisarCierre,
  'convenio:avisar_debito_por_vencer': avisarDebitoPorVencer,
  'convenio:avisar_motivo_que_crecio': avisarMotivoQueCrecio,
  'convenio:avisar_sucursal_que_debita_mas': avisarSucursalQueDebitaMas,
  'convenio:avisar_obra_social_que_cambio': avisarObraSocialQueCambio,

  'abasto:armar_pedido': armarPedido,
  'abasto:emitir_orden': armarPedido,
  'abasto:sacar_de_otra_sucursal': proponerTransferencia,
  'abasto:proponer_transferencia': proponerTransferencia,
  'reparto:proponer_movimiento': proponerTransferencia,
  'reparto:armar_pedido_entre_sucursales': proponerTransferencia,
  'margen:proponer_oferta': prepararOferta,

  'tesoro:avisar_vencimiento': avisar('documento_por_pagar', async (c) => {
    const { data } = await c.adm.from('deuda_proveedores').select('saldo').eq('situacion', 'impaga')
    const f = (data ?? []) as any[]
    if (!f.length) return null
    const total = f.reduce((a, x) => a + Number(x.saldo ?? 0), 0)
    return {
      t: `${f.length} comprobantes con más de un mes sin pagar`,
      d: `Suman ${ars(total)}. Decidir qué se paga lo hace una persona: regla de oro 7.`,
      esperado: { comprobantes: f.length, monto: Math.round(total) },
    }
  }),

  'tesoro:cruzar_caja': async (c, ejecuta) => {
    if (!c.sucursalId) return { ok: false, nivelAplicado: c.nivel, texto: 'El cruce de caja es por sucursal: elegí una.', error: 'sin sucursal' }
    const hoy = new Date().toISOString().slice(0, 10)
    if (!ejecuta) return { ok: true, nivelAplicado: c.nivel, texto: `El control de caja de hoy no se corrió todavía.` }
    const { data, error } = await c.adm.rpc('caja_controlar', { p_sucursal: c.sucursalId, p_fecha: hoy })
    if (error) return { ok: false, nivelAplicado: c.nivel, texto: 'No se pudo correr el control.', error: error.message }
    const cruces = (data ?? []) as any[]
    const dif = cruces.reduce((a, x) => a + Number(x.diferencias ?? 0), 0)
    const sinDato = cruces.filter((x) => x.sin_dato).length
    return {
      ok: true, nivelAplicado: c.nivel,
      texto: dif
        ? `Control corrido: ${dif} diferencia(s) marcadas. El motivo lo escribe una persona.`
        : `Control corrido: sin diferencias${sinDato ? `, y ${sinDato} cruce(s) no se pudieron hacer por falta de archivo` : ''}.`,
    }
  },

  'despacho:avisar_demorado': avisar('cambio_de_estado', async (c) => {
    let q = c.adm.from('orders').select('id', { count: 'exact', head: true })
      .not('status', 'in', '("entregado","cancelado")')
    if (c.sucursalId) q = q.eq('sucursal_id', c.sucursalId)
    const { count } = await q
    if (!count) return null
    return { t: `${count} pedido(s) abiertos sin entregar`, d: 'Revisá cuáles ya deberían haber salido.' }
  }),

  'documentos:avisar_costo_distinto': avisar('costo_aumento', async (c) => {
    const { count } = await c.adm.from('productos_catalogo')
      .select('id', { count: 'exact', head: true }).eq('es_demo', false).is('precio_costo_promedio', null)
    if (!count) return null
    return {
      t: `${count.toLocaleString('es-AR')} productos sin costo cargado`,
      d: 'Quedan afuera de todo cálculo de plata. Se completan fotografiando las facturas al recibir.',
    }
  }),

  'vigia:avisar_por_vencer': avisar('vencimiento_riesgo', async (c) => {
    let q = c.adm.from('lotes_productos')
      .select('id', { count: 'exact', head: true })
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
    if (c.sucursalId) q = q.eq('sucursal_id', c.sucursalId)
    const { count } = await q
    if (!count) return null
    return { t: `${count} lote(s) vencen en 30 días`, d: 'Mirá si conviene ofertarlos, devolverlos o moverlos a la sucursal que más los vende.' }
  }),
}

export function hayEjecutor(agenteId: string, accion: string): boolean {
  return `${agenteId}:${accion}` in EJECUTORES
}

/**
 * Ejecuta una acción respetando el nivel y el tope.
 *
 * Esta función es la única puerta: ningún ejecutor decide por su cuenta si
 * actúa o sólo prepara.
 */
export async function ejecutar(c: ContextoEjecucion): Promise<ResultadoEjecucion> {
  const agente = agentePorId(c.agenteId)
  const ac = agente?.acciones.find((a) => a.clave === c.accion)
  const f = EJECUTORES[`${c.agenteId}:${c.accion}`]

  if (!agente || !ac) return { ok: false, nivelAplicado: 'nunca', texto: 'Esa acción no existe.', error: 'accion desconocida' }
  if (!f) return { ok: false, nivelAplicado: 'nunca', texto: `«${ac.nombre}» todavía no está conectada a nada. El agente no la puede hacer.`, error: 'sin ejecutor' }
  if (c.nivel === 'nunca') return { ok: true, nivelAplicado: 'nunca', texto: 'Apagada a propósito.' }

  // ── A.4 · EL TECHO POR ACCIÓN ───────────────────────────────────────────
  //
  // No depende de la configuración: si la acción no declara `hace_y_avisa`
  // entre sus niveles, no llega ahí aunque alguien lo haya guardado.
  let nivel: Nivel = c.nivel
  let degradado: string | undefined
  if (nivel === 'hace_y_avisa' && !ac.niveles.includes('hace_y_avisa')) {
    nivel = 'prepara'
    degradado = ac.techo ?? 'Esta acción no llega a «hace y avisa».'
  }

  // ── A.3 · EL TOPE SIN DEFINIR NO ES INFINITO ────────────────────────────
  if (nivel === 'hace_y_avisa' && ac.pideLimite && c.limiteMonto == null) {
    nivel = 'prepara'
    degradado = 'Está en «hace y avisa» pero no tiene tope de monto definido. Un tope sin definir no es un tope infinito: deja preparado y espera.'
  }

  // Y si lo tiene, que el monto en juego no lo pase.
  if (nivel === 'hace_y_avisa' && c.limiteMonto != null) {
    const m = await montoDe(c)
    if (m.vencido) {
      nivel = 'prepara'
      degradado = m.calculadoAt
        ? `El tope es de ${ars(c.limiteMonto)}, pero el monto en juego está calculado ` +
          `desde el ${new Date(m.calculadoAt).toLocaleString('es-AR')} y ya pasaron más de ` +
          `${HORAS_DE_VIDA_DEL_MONTO} horas. Contra un número viejo el tope no significa nada, ` +
          `así que deja preparado.`
        : 'El tope está puesto, pero el monto en juego todavía no se calculó nunca. ' +
          'Deja preparado: sin ese número el tope no se puede verificar.'
    }
    const monto = m.monto
    if (monto != null && monto > c.limiteMonto) {
      nivel = 'prepara'
      degradado = `Lo que está en juego son ${ars(monto)} y el tope es ${ars(c.limiteMonto)}. Deja preparado.`
    }
  }

  try {
    const r = await f({ ...c, nivel }, nivel === 'hace_y_avisa' || nivel === 'prepara')
    // El nivel informado es SIEMPRE el que se resolvió acá, nunca el que el
    // ejecutor crea que aplicó. La primera versión dejaba que cada ejecutor lo
    // fijara, y uno degradado a «prepara» informaba «hace y avisa»: la
    // bitácora habría guardado un nivel que no fue el que se usó, y el medidor
    // del bloque B lo habría leído como si el agente hubiera actuado solo.
    return { ...r, nivelAplicado: nivel, degradado: degradado ?? r.degradado }
  } catch (e: any) {
    // A.6 · si falla, lo dice. No se reintenta: un ejecutor que reintenta solo
    // puede crear la misma orden tres veces.
    return {
      ok: false, nivelAplicado: nivel, degradado,
      texto: `${agente.nombre} no pudo ${ac.nombre.toLowerCase()}.`,
      error: e?.message ?? 'error desconocido',
    }
  }
}
