/**
 * D · LO QUE CONTESTA LA ENTIDAD.
 *
 * ── LOS CINCO LÍMITES, EN ESTE ARCHIVO ──────────────────────────────────────
 *
 *   a · Lee con la sesión de quien habla. `sb` es el cliente de sesión; no
 *       hay otro a mano.
 *   b · No calcula. Cada número sale de `cerebro_estado()` o de una tabla,
 *       tal cual. Si no existe, lo dice.
 *   c · Nada que comprometa plata se ejecuta acá. Lo de «Hacé» y «Cambiá»
 *       devuelve una PROPUESTA; la ejecuta un toque en pantalla (bloque F).
 *   d · La constitución vale igual: lo prohibido dice que no, con el motivo,
 *       y queda registrado el intento.
 *   e · Todo a la bitácora, con el texto original.
 *
 * ── D.4 · DOS NIVELES ───────────────────────────────────────────────────────
 *
 * `dicho` es lo que se habla: corto y sin montos. `texto` es lo que se lee, y
 * `cifras` los números. Nadie quiere escuchar «cincuenta y siete millones
 * setecientos ochenta mil». La prueba verifica que `dicho` no tenga montos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { entender, normalizar, type Catalogo, type Intencion } from './entender'
import { EJEMPLOS, type Accion, type Respuesta, type Tono } from './conversacion'
export * from './conversacion'
import { ars, arsCorto, leerCerebro, type EstadoCerebro, type NodoSucursal } from './lectura'

type Sb = Pick<SupabaseClient, 'rpc' | 'from'>

const base = (cosa: Intencion['cosa'], dicho: string): Respuesta => ({
  id: null, cosa, dicho, texto: null, cifras: [], acciones: [], pie: null,
  mirar: null, abrir: null, navegar: null, voz: null, propone: false,
})

const mil = (n: number) => n.toLocaleString('es-AR')
const TZ = 'America/Argentina/Buenos_Aires'
const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: TZ }) : null
const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })

async function catalogo(sb: Sb, e: EstadoCerebro): Promise<Catalogo> {
  const { data } = await sb.from('empleados').select('nombre_completo, user_id, sucursal_id').eq('activo', true)
  return {
    sucursales: e.sucursales.map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })),
    personas: ((data ?? []) as any[]).filter((p) => p.nombre_completo)
      .map((p) => ({ nombre: p.nombre_completo, user_id: p.user_id, sucursal_id: p.sucursal_id })),
    agentes: e.agentes.map((a) => ({ id: a.id, nombre: a.nombre })),
  }
}

/* ══ CONTAME ═══════════════════════════════════════════════════════════════ */

function contameGeneral(e: EstadoCerebro): Respuesta {
  const esp = e.espera
  const firma = e.agentes.filter((a) => a.estado === 'ma').length
  const encendidos = e.agentes.filter((a) => a.encendido).length
  const r = base('contame',
    `Hay ${esp.cuantos} cosas esperando una decisión` +
    (esp.de_riesgo ? `, y ${esp.de_riesgo} son de riesgo legal` : '') + '. ' +
    (firma ? `${firma} agentes necesitan tu firma. ` : '') +
    'Lo que vendieron hoy no lo sé: no entra al sistema.')
  r.cifras = [
    { k: 'En juego', v: arsCorto(esp.plata_total) ?? 'sin plata medible', tono: 'al' },
    { k: 'Por día sin decidir', v: arsCorto(esp.costo_por_dia) ?? '—' },
    { k: 'De riesgo', v: String(esp.de_riesgo), tono: esp.de_riesgo ? 'ma' : 'ok' },
    { k: 'Encendidos', v: `${encendidos} de ${e.agentes.length}` },
  ]
  r.acciones = [
    { label: 'Qué espera mi firma', tipo: 'preguntar', texto: '¿Qué espera mi firma?', primaria: true },
    { label: 'Ver la cadena', tipo: 'abrir' },
  ]
  r.abrir = null
  r.pie = 'La venta del día no entra: las ventas diarias cargadas son de demostración. ' +
    'Lo que está en juego y lo que cuesta por día no se suman: uno es un total y el otro un caudal.'
  return r
}

function contameEspera(e: EstadoCerebro): Respuesta {
  const p = e.espera.primeros
  if (!p.length) return base('contame', 'No hay nada esperando una decisión. Lo miré: es un cero de verdad.')
  const r = base('contame',
    `Hay ${e.espera.cuantos}. Lo primero es: ${p[0].titulo.replace(/\$[\d.,]+/g, '').trim()}. ` +
    'Ninguna se ejecuta sola: cada una la firmás en su pantalla.')
  const repetidos = new Set(p.slice(0, 4).map((x) => x.titulo)).size < Math.min(4, p.length)
  const corto = (t: string) => (t.length > 38 ? `${t.slice(0, 36)}…` : t)
  r.cifras = p.slice(0, 4).map((x) => ({
    k: corto(repetidos ? `${x.sucursal ? `${x.sucursal} · ` : ''}${x.que_pasa}` : x.titulo),
    v: x.plata != null ? arsCorto(x.plata)! : x.costo_por_dia != null ? `${arsCorto(x.costo_por_dia)}/día` : 'sin plata',
    tono: (x.riesgo ? 'ma' : 'al') as Tono,
  }))
  r.acciones = [
    { label: 'Abrir la bandeja', tipo: 'navegar', href: '/admin/direccion/bandeja', primaria: true },
    { label: p[0].accion, tipo: 'navegar', href: p[0].href },
  ]
  r.pie = `${e.espera.no_se_pueden_costear} no se pueden costear: su plata es null, no cero.`
  r.abrir = { tipo: 'nucleo' }
  return r
}

function contameApagados(e: EstadoCerebro): Respuesta {
  const off = e.agentes.filter((a) => !a.encendido)
  const sc = off.filter((a) => !a.construido)
  const r = base('contame',
    `${off.length} de ${e.agentes.length} están apagados` +
    (sc.length ? `, y ${sc.length} ni siquiera están construidos` : '') +
    '. Casi todos por lo mismo: un dato que todavía no entró.')
  r.cifras = off.slice(0, 6).map((a) => ({ k: a.nombre, v: a.corto ?? 'apagado', tono: 'al' as Tono }))
  r.texto = off.map((a) => `**${a.nombre}**: ${a.motivoApagado}`).join('. ')
  r.acciones = [{ label: 'Qué enciende cada uno', tipo: 'abrir' }]
  r.pie = off.filter((a) => a.queLoEnciende).slice(0, 3)
    .map((a) => `${a.nombre}: ${a.queLoEnciende}`).join(' · ')
  r.abrir = { tipo: 'nucleo' }
  return r
}

function contameSucursal(s: NodoSucursal): Respuesta {
  const cob = s.rotacion.cobertura_meses
  const dicho = s.sin_datos
    ? `De ${s.nombre} no sé casi nada: no tiene stock, venta ni caja en el sistema.`
    : `${s.nombre} tiene stock para ${cob != null ? `${cob.toLocaleString('es-AR')} meses` : 'un tiempo que no puedo calcular'}` +
      `${s.tareas.vencidas ? ` y ${s.tareas.vencidas} tareas vencidas` : ''}. ` +
      (s.vendido_hoy.valor == null ? 'Lo que vendió hoy no lo sé.' : '')
  const r = base('contame', dicho.trim())
  r.cifras = [
    { k: 'Stock al costo', v: arsCorto(s.stock.valor) ?? 'no sé' },
    { k: 'Cobertura', v: cob != null ? `${cob.toLocaleString('es-AR')} meses` : 'no sé' },
    { k: 'Tareas abiertas', v: String(s.tareas.abiertas), tono: s.tareas.vencidas ? 'al' : '' },
    { k: 'Último cierre', v: (s.caja.ultimo_cierre ?? s.caja.turno_fecha) ? fecha(s.caja.ultimo_cierre ?? s.caja.turno_fecha)! : 'no hay', tono: (s.caja.ultimo_cierre ?? s.caja.turno_fecha) ? '' : 'al' },
  ]
  r.pie = [
    s.stock.de_cuando ? `El stock es del maestro de SIFACO del ${fecha(s.stock.de_cuando)}.` : s.stock.por_que_no,
    s.vendido_hoy.por_que_no, s.caja.por_que_no,
  ].filter(Boolean).join(' ')
  r.mirar = s.id
  r.abrir = { tipo: 'sucursal', id: s.id }
  return r
}

function contameAgente(e: EstadoCerebro, id: string): Respuesta {
  const a = e.agentes.find((x) => x.id === id)!
  const r = base('contame', !a.construido
    ? `${a.nombre} no existe todavía: el sector está, el agente no.`
    : a.encendido
      ? `${a.nombre} está trabajando${a.esperanFirma ? ` y tiene ${a.esperanFirma} cosas esperando tu firma` : ''}. Lo que dice está en el mensaje.`
      : `${a.nombre} está apagado: ${a.motivoApagado?.split(':')[0]}.`)
  r.texto = a.encendido ? a.frase : `${a.motivoApagado}.${a.queLoEnciende ? ` Lo enciende ${a.queLoEnciende}.` : ''}`
  r.acciones = [{ label: 'Abrir el sector', tipo: 'navegar', href: a.href, primaria: true }]
  r.pie = a.de_cuando ? `Los números son del cálculo del ${fecha(a.de_cuando)}.` : null
  r.mirar = a.id
  r.abrir = { tipo: 'agente', id: a.id }
  return r
}

function contameEquipo(e: EstadoCerebro): Respuesta {
  const c = (t: string) => e.agentes.filter((a) => a.estado === t).length
  const r = base('contame',
    `De los ${e.agentes.length}: ${c('ok')} trabajando, ${c('al')} con un dato que les falta, ` +
    `${c('ma')} esperando tu firma y ${c('off')} apagados.`)
  r.cifras = e.agentes.filter((a) => a.encendido).map((a) => ({
    k: a.nombre, v: a.corto ?? '—', tono: (a.estado === 'ma' ? 'ma' : a.estado === 'al' ? 'al' : 'ok') as Tono,
  }))
  r.abrir = { tipo: 'nucleo' }
  return r
}

/* ══ VERIFICAR ═════════════════════════════════════════════════════════════ */

async function verificar(sb: Sb, e: EstadoCerebro, cat: Catalogo, i: Extract<Intencion, { cosa: 'verificar' }>): Promise<Respuesta> {
  const persona = i.quien ? cat.personas.find((p) => p.nombre === i.quien) ?? null : null
  if (!persona && i.quienDicho && !i.sucursal) {
    return {
      ...base('verificar',
        `No encuentro a ${i.quienDicho[0].toUpperCase()}${i.quienDicho.slice(1)} entre las personas cargadas, así que no puedo decirte qué hizo.`),
      pie: `Hay ${cat.personas.length} persona(s) cargada(s) en el sistema. Sin la persona cargada, nada de lo que haga queda a su nombre.`,
      acciones: [{ label: 'Cargar personas', tipo: 'navegar', href: '/admin/rrhh' }],
    }
  }
  const sucId = i.sucursal ?? persona?.sucursal_id ?? null
  const suc = sucId ? e.sucursales.find((s) => s.id === sucId) ?? null : null

  if (i.que === 'caja') {
    if (!suc) {
      const r = base('verificar', 'No sé de qué sucursal me preguntás: decime cuál.')
      r.acciones = e.sucursales.filter((s) => !s.es_ecommerce)
        .map((s) => ({ label: s.nombre, tipo: 'preguntar' as const, texto: `¿Cerraron la caja de ${s.nombre}?` }))
      return r
    }
    const c = suc.caja
    if (!c.ultimo_cierre && !c.turno_fecha && c.turno_abierto_desde) {
      // Un turno abierto que nunca se cerró SÍ responde: no, no la cerraron.
      const r = base('verificar',
        `No. ${suc.nombre} tiene un turno de caja abierto desde el ${fecha(c.turno_abierto_desde)} que nunca se cerró.`)
      r.cifras = [
        { k: 'Abierto desde', v: fecha(c.turno_abierto_desde)!, tono: 'ma' },
        { k: 'Efectivo', v: 'no se puede saber', tono: 'al' },
      ]
      r.pie = 'Sin cierre no hay número de efectivo: no puedo decirte cuánto quedó.'
      r.acciones = [{ label: 'Ir a la caja', tipo: 'navegar', href: '/admin/finanzas/caja' }]
      r.mirar = suc.id
      return r
    }
    if (!c.ultimo_cierre && !c.turno_fecha) {
      const r = base('verificar', `No lo puedo saber: ${suc.nombre} no tiene ningún cierre de caja real en el sistema.`)
      r.pie = c.por_que_no ?? null
      r.mirar = suc.id
      r.abrir = { tipo: 'sucursal', id: suc.id }
      return r
    }
    const ult = c.ultimo_cierre ?? c.turno_fecha!
    const hoy = ult === hoyAR()
    const r = base('verificar', hoy
      ? `Sí. ${suc.nombre} cerró la caja hoy${c.quien ? `, la cerró ${c.quien}` : ''}.`
      : `No. El último cierre de ${suc.nombre} es del ${fecha(ult)}.`)
    r.cifras = [
      { k: 'Último cierre', v: fecha(ult)!, tono: hoy ? 'ok' : 'ma' },
      { k: 'Quién', v: c.quien ?? 'no figura' },
      { k: 'Diferencia', v: c.diferencia != null ? ars(c.diferencia)! : 'no se puede saber', tono: c.diferencia ? 'al' : '' },
    ]
    if (!hoy) r.pie = 'Sin cierre no hay número de efectivo: no puedo decirte cuánto quedó.'
    r.mirar = suc.id
    return r
  }

  // ¿hizo tal tarea?
  let q = sb.from('tareas').select('codigo, titulo, estado, fecha_completada, fecha_vencimiento, created_at')
    .eq('es_demo', false).order('created_at', { ascending: false }).limit(20)
  if (persona?.user_id) q = q.eq('responsable_id', persona.user_id)
  else if (suc) q = q.eq('sucursal_id', suc.id)
  const { data, error } = await q
  if (error) return base('verificar', 'No pude leer las tareas, así que no lo sé.')
  const palabras = normalizar(i.tema ?? '').split(' ').filter((w) => w.length > 3)
  const t = ((data ?? []) as any[]).find((x) => !palabras.length || palabras.some((w) => normalizar(x.titulo).includes(w)))
  const quien = persona?.nombre ?? suc?.nombre ?? 'esa persona'
  if (!t) {
    const r = base('verificar', `No encuentro una tarea así de ${quien}, así que no puedo decir si se hizo.`)
    r.pie = 'Lo que no está cargado como tarea no se puede verificar.'
    return r
  }
  const hecha = t.estado === 'completada'
  const r = base('verificar', hecha
    ? `Sí. ${t.titulo} se completó el ${fecha(t.fecha_completada)}.`
    : `No. ${t.titulo} está ${String(t.estado).replace(/_/g, ' ')}.`)
  r.cifras = [
    { k: 'Tarea', v: t.codigo ?? '—' },
    { k: 'Estado', v: String(t.estado).replace(/_/g, ' '), tono: hecha ? 'ok' : 'al' },
    { k: hecha ? 'Completada' : 'Vence', v: fecha(hecha ? t.fecha_completada : t.fecha_vencimiento) ?? 'sin fecha' },
  ]
  r.acciones = [{ label: 'Ver las tareas', tipo: 'navegar', href: '/admin/tareas' }]
  if (suc) r.mirar = suc.id
  return r
}

/* ══ HACÉ · siempre propone, nunca firma ═══════════════════════════════════ */

/** Palabras que dice la gente y el catálogo de tipos dice de otra forma. */
const SINONIMOS: Record<string, string> = {
  heladera: 'frio', heladeras: 'frio', freezer: 'frio', temperatura: 'frio',
  banos: 'banos', limpiar: 'limpieza', limpie: 'limpieza', vencidos: 'vencer',
  gondola: 'gondolas', gondolas: 'gondolas', reponer: 'reponer', recibir: 'recepcion',
}

async function hacerTarea(sb: Sb, e: EstadoCerebro, cat: Catalogo, i: Extract<Intencion, { cosa: 'hace'; que: 'tarea' }>) {
  const persona = i.quien ? cat.personas.find((p) => p.nombre === i.quien) ?? null : null
  if (!persona?.user_id) {
    const nombre = i.quien ? i.quien[0].toUpperCase() + i.quien.slice(1) : 'esa persona'
    const r = base('hace', `No encuentro a ${nombre} entre las personas con usuario: no le puedo asignar la tarea.`)
    r.pie = `Hay ${cat.personas.length} persona(s) cargada(s). Para asignarle algo a alguien tiene que tener usuario en el sistema.`
    r.acciones = [{ label: 'Cargar personas', tipo: 'navegar', href: '/admin/rrhh' }]
    return { r, propuesta: null }
  }
  const { data: tipos } = await sb.from('tipos_tareas').select('id, nombre, evidencia_requerida').eq('activo', true)
  const pal = normalizar(i.tarea).split(' ').filter((w) => w.length > 3).map((w) => SINONIMOS[w] ?? w)
  let mejor: any = null, puntos = 0
  for (const t of (tipos ?? []) as any[]) {
    const n = normalizar(t.nombre)
    const p = pal.filter((w) => n.includes(w)).length
    if (p > puntos) { mejor = t; puntos = p }
  }
  // La evidencia la exige el TIPO de tarea: sin tipo, el flujo no pide foto,
  // y decir «con foto» sería prometer algo que no se va a controlar.
  const evidencia: string[] = mejor?.evidencia_requerida?.length ? mejor.evidencia_requerida : []
  const conFoto = evidencia.some((x) => x.startsWith('foto'))
  const titulo = mejor ? mejor.nombre : i.tarea[0].toUpperCase() + i.tarea.slice(1)
  const suc = e.sucursales.find((s) => s.id === persona.sucursal_id) ?? null

  const r = base('hace', `Se la dejo a ${persona.nombre} para ${i.cuando === 'hoy' ? 'hoy' : 'mañana'}` +
    `${conFoto ? ', con evidencia por foto' : ''}. Confirmala vos.`)
  r.cifras = [
    { k: 'Quién', v: persona.nombre },
    { k: 'Qué', v: titulo },
    { k: 'Cuándo', v: i.cuando === 'hoy' ? 'hoy, antes de cerrar' : 'mañana' },
    { k: 'Evidencia', v: evidencia.length ? evidencia.join(' + ') : 'ninguna obligatoria', tono: conFoto ? '' : 'al' },
  ]
  r.acciones = [
    { label: 'Asignarla', tipo: 'confirmar', primaria: true },
    { label: 'Mejor no', tipo: 'descartar' },
  ]
  r.pie = 'Cuando la complete pasa a verificación: el control de la regla 5 lo hacés vos. ' +
    (mejor ? '' : 'No encontré un tipo de tarea así en el catálogo: va como tarea suelta, y sin tipo el sistema no exige foto.')
  r.propone = true
  r.mirar = suc?.id ?? null
  return {
    r,
    propuesta: {
      tipo: 'tarea', nodo: suc?.id ?? null,
      responsable_user_id: persona.user_id, responsable: persona.nombre,
      sucursal_id: persona.sucursal_id, tipo_tarea_id: mejor?.id ?? null,
      titulo, descripcion: `Pedido a la voz: «${i.tarea}».`,
      vence: i.cuando, evidencia,
    },
  }
}

async function hacerPedido(sb: Sb, i: Extract<Intencion, { cosa: 'hace'; que: 'pedido' }>) {
  const pal = i.producto.split(/\s+/).filter((w) => w.length > 1).slice(0, 4)
  let q = sb.from('productos_catalogo').select('id, nombre, precio_costo_promedio')
    .eq('es_demo', false).eq('activo', true).limit(5)
  for (const w of pal) q = q.ilike('nombre', `%${w}%`)
  const { data, error } = await q
  if (error) return { r: base('hace', 'No pude buscar en el catálogo, así que no preparo nada.'), propuesta: null }
  const prods = (data ?? []) as any[]
  if (!prods.length) {
    const r = base('hace', `No encuentro «${i.producto}» en el catálogo. No preparo nada para no pedir otra cosa.`)
    r.pie = 'Decímelo como figura en SIFACO, por ejemplo con la presentación.'
    return { r, propuesta: null }
  }
  if (prods.length > 1) {
    // D.6 · no adivina cuál de los cinco.
    const r = base('hace', `Encontré ${prods.length >= 5 ? 'varios' : prods.length} productos con ese nombre. ¿Cuál?`)
    r.acciones = prods.slice(0, 4).map((p) => ({
      label: p.nombre, tipo: 'preguntar' as const, texto: `pedí ${i.cantidad} de ${p.nombre}`,
    }))
    return { r, propuesta: null }
  }
  const p = prods[0]
  const r = base('hace', `Lo dejo preparado en borrador, pero esto lo firmás vos.`)
  r.cifras = [
    { k: 'Producto', v: p.nombre },
    { k: 'Cantidad', v: mil(i.cantidad) },
    { k: 'Costo unitario', v: p.precio_costo_promedio != null ? ars(p.precio_costo_promedio)! : 'sin costo cargado', tono: p.precio_costo_promedio != null ? '' : 'al' },
  ]
  r.acciones = [
    { label: 'Dejarlo en borrador', tipo: 'confirmar', primaria: true },
    { label: 'No', tipo: 'descartar' },
  ]
  r.pie = 'Nada que comprometa plata se ejecuta por voz: queda en borrador, sin droguería y sin emitir. ' +
    'Un error de transcripción en una cantidad no se ve hasta que pasó.'
  r.propone = true
  r.mirar = 'abasto'
  return {
    r,
    propuesta: { tipo: 'pedido', nodo: 'abasto', producto_id: p.id, producto: p.nombre, cantidad: i.cantidad, costo_unitario: p.precio_costo_promedio },
  }
}

function hacerTransferencia(e: EstadoCerebro, i: Extract<Intencion, { cosa: 'hace'; que: 'transferencia' }>) {
  const hacia = e.sucursales.find((s) => s.id === i.hacia) ?? null
  const desde = e.sucursales.find((s) => s.id === i.desde) ?? null
  if (!hacia) {
    const r = base('hace', 'No entendí para qué sucursal es la transferencia. Decime «para Arabia», por ejemplo.')
    return { r, propuesta: null }
  }
  const r = base('hace',
    `Armo el pedido de transferencia para ${hacia.nombre} con lo que le falta y sobra en otra sucursal. Queda en solicitada: lo confirma el encargado.`)
  r.cifras = [
    { k: 'Para', v: hacia.nombre },
    { k: 'Desde', v: desde ? `${desde.nombre} (lo decide Reparto por lo que sobra)` : 'donde sobre' },
  ]
  r.acciones = [
    { label: 'Armar el pedido', tipo: 'confirmar', primaria: true },
    { label: 'No', tipo: 'descartar' },
  ]
  r.pie = 'El stock se mueve en SIFACO. Esto es el pedido entre encargados, con sus tres fotos.'
  r.propone = true
  r.mirar = hacia.id
  return { r, propuesta: { tipo: 'transferencia', nodo: hacia.id, hacia: hacia.id, desde: desde?.id ?? null } }
}

/* ══ CAMBIÁ · con registro y reversible ════════════════════════════════════ */

/** «1 mes», «2 meses», «0,5 meses». */
function conUnidad(v: number, unidad: string): string {
  const n = String(v).replace('.', ',')
  if (v === 1 && unidad === 'meses') return '1 mes'
  if (v === 1 && unidad === 'dias') return '1 día'
  return `${n} ${unidad === 'dias' ? 'días' : unidad}`
}

async function cambiar(sb: Sb, i: Extract<Intencion, { cosa: 'cambia'; clave: string }>) {
  const { data: p } = await sb.from('compras_parametros').select('clave, valor, unidad, que_decide')
    .eq('clave', i.clave).maybeSingle<any>()
  if (!p) return { r: base('cambia', 'Ese parámetro no existe, así que no cambio nada.'), propuesta: null }
  const v = i.valor
  if (!(v > 0) || (p.unidad === '%' && v > 100) || (p.unidad === 'meses' && v > 24)) {
    return { r: base('cambia', `No lo cambio: ${String(v).replace('.', ',')} ${p.unidad} no es un valor posible para esto.`), propuesta: null }
  }
  if (Number(p.valor) === v) {
    return { r: base('cambia', `Ya está en ${conUnidad(v, p.unidad)}. No cambio nada.`), propuesta: null }
  }
  const r = base('cambia', `Cambio ${p.clave.replace(/_/g, ' ')} de ${conUnidad(Number(p.valor), p.unidad)} a ${conUnidad(v, p.unidad)}. Confirmalo y queda registrado, con el botón de volver atrás.`)
  r.cifras = [
    { k: 'Antes', v: conUnidad(Number(p.valor), p.unidad) },
    { k: 'Después', v: conUnidad(v, p.unidad), tono: 'al' },
  ]
  r.texto = null
  r.pie = p.que_decide
  r.acciones = [
    { label: 'Cambiarlo', tipo: 'confirmar', primaria: true },
    { label: 'No', tipo: 'descartar' },
  ]
  r.propone = true
  r.mirar = 'abasto'
  return { r, propuesta: { tipo: 'parametro', nodo: 'abasto', clave: p.clave, antes: Number(p.valor), despues: v, unidad: p.unidad } }
}

async function deshacer(sb: Sb) {
  const { data, error } = await sb.from('voz_parametro_cambios')
    .select('id, clave, antes, despues, cambiado_at').is('revertido_at', null)
    .order('cambiado_at', { ascending: false }).limit(1).maybeSingle<any>()
  if (error || !data) {
    return { r: base('cambia', 'No hay ningún cambio hecho por voz para volver atrás.'), propuesta: null }
  }
  const r = base('cambia', `Vuelvo ${data.clave.replace(/_/g, ' ')} a como estaba. Confirmalo.`)
  r.cifras = [
    { k: 'Ahora', v: String(data.despues).replace('.', ',') },
    { k: 'Vuelve a', v: String(data.antes).replace('.', ','), tono: 'ok' },
  ]
  r.acciones = [{ label: 'Volver atrás', tipo: 'confirmar', primaria: true }, { label: 'No', tipo: 'descartar' }]
  r.propone = true
  return { r, propuesta: { tipo: 'revertir', nodo: 'abasto', cambio_id: data.id, clave: data.clave } }
}

/* ══ LO QUE NO PUEDE HACER ═════════════════════════════════════════════════ */

const NO: Record<Extract<Intencion, { cosa: 'prohibido' }>['accion'], { dicho: string; pie: string; href?: string; label?: string }> = {
  cambiar_precio_venta: {
    dicho: 'Eso no. SIFACO es la autoridad del precio de venta: yo mido y comparo, nunca escribo un precio.',
    pie: 'Regla de oro 1. Es uno de los límites que ninguna conversación cambia. Queda registrado que lo pediste.',
  },
  pagar_sin_firma: {
    dicho: 'Eso no lo hago por voz. Pagar se firma con un toque en pantalla, con el monto a la vista.',
    pie: 'Regla de oro 7: retiros de fondo solo con aprobación. Un error de transcripción en un monto no se ve hasta que pasó. Queda registrado que lo pediste.',
    href: '/admin/finanzas/deuda', label: 'Ir a la deuda',
  },
  firmar_por_voz: {
    dicho: 'Firmar no. Por voz preparo, la firma es un toque tuyo en la pantalla de lo que firmás.',
    pie: 'Así el monto está a la vista cuando lo confirmás. Queda registrado que lo pediste.',
    href: '/admin/direccion/bandeja', label: 'Ir a lo que espera',
  },
  publicar_en_canal: {
    dicho: 'Publicar no. Se ve desde afuera y no se deshace, y además no tengo credenciales de ningún canal.',
    pie: 'Puedo dejar el lote armado para que lo firmes y lo cargue alguien. Queda registrado que lo pediste.',
    href: '/admin/canales', label: 'Ir a los canales',
  },
  tocar_personal: {
    dicho: 'Eso no. Las decisiones sobre personas las toma una persona, no la voz.',
    pie: 'Queda registrado que lo pediste.',
  },
}

/* ══ LA PUERTA ═════════════════════════════════════════════════════════════ */

/**
 * Entiende, responde y registra. Devuelve la respuesta con el id de la
 * bitácora, que es lo que después confirma o descarta la pantalla.
 */
export async function responder(sb: Sb, texto: string, via: 'texto' | 'voz' = 'texto'): Promise<Respuesta> {
  const lec = await leerCerebro(sb)
  if (!lec.ok) {
    const r = base('no_entendi', 'No puedo contestarte ahora: no pude leer el estado del sistema.')
    r.pie = lec.por_que
    return r
  }
  const e = lec.estado
  const cat = await catalogo(sb, e)
  const i = entender(texto, cat)

  let r: Respuesta
  let propuesta: Record<string, unknown> | null = null
  let estado: string = 'respondido'

  switch (i.cosa) {
    case 'prohibido': {
      const n = NO[i.accion]
      r = base('prohibido', n.dicho)
      r.pie = n.pie
      if (n.href) r.acciones = [{ label: n.label!, tipo: 'navegar', href: n.href }]
      estado = 'negado'
      break
    }
    case 'control':
      r = base('control', i.que === 'callate' ? 'Listo, me callo. Sigo escribiendo.' : 'Listo, vuelvo a hablar.')
      r.voz = i.que === 'callate' ? 'off' : 'on'
      break
    case 'llevame':
      r = base('llevame', `Te llevo a ${i.destino}.`)
      r.navegar = i.href
      break
    case 'contame':
      r = i.sobre === 'general' ? contameGeneral(e)
        : i.sobre === 'espera' ? contameEspera(e)
        : i.sobre === 'apagados' ? contameApagados(e)
        : i.sobre === 'equipo' ? contameEquipo(e)
        : i.sobre === 'sucursal' ? contameSucursal(e.sucursales.find((s) => s.id === i.id)!)
        : contameAgente(e, i.id!)
      break
    case 'verificar':
      r = await verificar(sb, e, cat, i)
      break
    case 'hace': {
      const x = i.que === 'tarea' ? await hacerTarea(sb, e, cat, i)
        : i.que === 'pedido' ? await hacerPedido(sb, i)
        : i.que === 'transferencia' ? hacerTransferencia(e, i)
        : {
            r: Object.assign(base('hace',
              'Preparar un pago todavía no está conectado: no hay con qué armarlo en borrador. Te llevo a la deuda y lo armás ahí.'),
              { acciones: [{ label: 'Ir a la deuda', tipo: 'navegar', href: '/admin/finanzas/deuda', primaria: true }] as Accion[] }),
            propuesta: null,
          }
      r = x.r; propuesta = x.propuesta
      break
    }
    case 'cambia': {
      const x = 'deshacer' in i ? await deshacer(sb) : await cambiar(sb, i)
      r = x.r; propuesta = x.propuesta
      break
    }
    default:
      r = base('no_entendi', `No te entendí: ${i.por_que}. ¿Me lo decís de otra forma?`)
      r.acciones = EJEMPLOS.slice(0, 4).map((t) => ({ label: t, tipo: 'preguntar' as const, texto: t }))
      estado = 'no_entendido'
  }
  if (propuesta) estado = 'propuesto'

  // e · todo a la bitácora, con el texto original.
  const { data: id, error } = await sb.rpc('voz_registrar', {
    p_texto: texto, p_via: via,
    p_entendido: i as unknown as Record<string, unknown>,
    p_respuesta: r.dicho, p_estado: estado, p_propuesta: propuesta,
  })
  if (error) {
    console.error('[cerebro] voz_registrar:', error.message)
    // Sin registro no se puede confirmar nada: la propuesta se retira.
    if (propuesta) {
      r = base(r.cosa, 'Lo entendí, pero no pude dejarlo registrado, así que no te lo propongo.')
    }
  }
  return { ...r, id: (id as string | null) ?? null }
}
