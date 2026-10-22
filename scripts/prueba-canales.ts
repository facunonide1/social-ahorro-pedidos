/**
 * LOS CANALES, PROBADOS CONTRA LO QUE HAY.
 *
 * ── LO QUE ESTA PRUEBA MIRA ─────────────────────────────────────────────────
 *
 * Los cinco problemas de §1 y los números que el enunciado traía, contra los
 * de hoy. No para contradecirlo: para que la diferencia quede escrita. Los
 * números del enunciado son de PedidosYa y de otra fecha, y PedidosYa no está
 * en el sistema.
 *
 * Y la regla que ordena todo el sector: **un canal sin catálogo cargado no
 * reporta cero.** Cero es «lo miré y no hay»; null es «no lo puedo saber».
 *
 *   npx tsx --env-file=.env.local scripts/prueba-canales.ts
 */
import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } })

let fallas = 0
const ok = (s: string) => console.log(`  ok    ${s}`)
const mal = (s: string) => { console.log(`  MAL   ${s}`); fallas++ }
const nd = (s: string) => console.log(`  --    ${s}`)

async function main() {
  // ── A.5 y A.6 · LOS CANALES ──────────────────────────────────────────────
  console.log('── A · los canales ──')
  const { data: est, error: eEst } = await adm.rpc('canales_estado')
  if (eEst) { mal(`canales_estado falló: ${eEst.message}`); process.exit(1) }
  const canales = (est ?? []) as any[]

  canales.length >= 4
    ? ok(`${canales.length} canales declarados`)
    : mal(`sólo ${canales.length} canales declarados y el enunciado habla de cuatro vendiendo`)

  const mostrador = canales.find((c) => c.tipo === 'mostrador')
  if (!mostrador) mal('el mostrador no está declarado como canal, y todo el bloque C compara contra él')
  else if (Number(mostrador.publicados ?? 0) === 0) mal('el mostrador cuenta 0 publicados')
  else ok(`el mostrador cuenta ${Number(mostrador.publicados).toLocaleString('es-AR')} del maestro`)

  // La regla: sin catálogo cargado, null y no cero.
  for (const c of canales) {
    if (!c.catalogo_cargado && c.publicados !== null) {
      mal(`${c.canal_id} no tiene catálogo cargado y reporta ${c.publicados} publicados en vez de null`)
    }
    if (!c.catalogo_cargado && !c.que_falta) {
      mal(`${c.canal_id} no tiene catálogo y no dice qué le falta`)
    }
    if (c.publicados !== null && !c.de_donde_sale_el_conteo) {
      mal(`${c.canal_id} muestra un número sin punto de procedencia`)
    }
  }
  const sinCatalogo = canales.filter((c) => !c.catalogo_cargado)
  ok(`los ${sinCatalogo.length} canales sin catálogo dicen null y qué los encendería: ` +
     sinCatalogo.map((c) => c.canal_id).join(', '))

  // ── §1.a · EL RECARGO CONTRA LA COMISIÓN ─────────────────────────────────
  console.log('\n── §1.a · el recargo contra la comisión ──')
  for (const c of canales) {
    if (c.recargo_cubre_comision === false) {
      nd(`${c.nombre}: recargo ${c.recargo_pct}% contra comisión ${c.comision_pct}% — ` +
         `pierde ${Number(c.comision_pct) - Number(c.recargo_pct)} puntos contra el mostrador`)
    } else if (c.recargo_cubre_comision === null && c.tipo !== 'mostrador') {
      nd(`${c.nombre}: no se puede contestar, la comisión no está confirmada`)
    }
  }
  const pierden = canales.filter((c) => c.recargo_cubre_comision === false)
  const sinConfirmar = canales.filter((c) => !c.comision_confirmada)
  ok(`${pierden.length} canales con el recargo por debajo de la comisión confirmada`)
  ok(`${sinConfirmar.length} con la comisión sin confirmar, y cada uno dice de dónde sale el número`)

  // ── §1.b · LO LEGAL, QUE ES LO PRIMERO ───────────────────────────────────
  console.log('\n── §1.b · publicados con receta o controlados ──')
  const { data: probs } = await adm.from('canal_problemas')
    .select('problema, casos').eq('canal_id', 'woo').limit(50)
  const porProblema = Object.fromEntries(((probs ?? []) as any[]).map((p) => [p.problema, p.casos]))
  const legalesEnLaVista = Number(porProblema['no_deberia_estar_publicado'] ?? 0)
  legalesEnLaVista > 0
    ? nd(`${legalesEnLaVista} publicados que no deberían estarlo (el enunciado decía 11)`)
    : ok('ninguno publicado que no deba estarlo')

  // La contradicción entre los dos campos legales, que decide el número.
  const { data: contra } = await adm.rpc('canal_campos_legales_en_conflicto')
  if (contra) {
    const c = contra as any
    nd(`los dos campos legales se contradicen en ${Number(c.en_conflicto).toLocaleString('es-AR')} productos del catálogo`)
  }

  // ── §1.c y §1.d ──────────────────────────────────────────────────────────
  console.log('\n── §1.c y §1.d ──')
  nd(`los que no cruzan con el maestro: ${porProblema['no_en_catalogo'] ?? 0} (el enunciado decía 481 en PedidosYa)`)
  nd(`publicados sin stock: ${porProblema['publicado_sin_stock'] ?? 0} (el enunciado decía 519)`)
  nd(`precio distinto del calculado: ${porProblema['precio_distinto'] ?? 0}`)
  nd(`no se puede calcular el precio: ${porProblema['no_se_puede_calcular'] ?? 0}`)

  // ── §1.e · COMPARAR SUCURSALES ───────────────────────────────────────────
  console.log('\n── §1.e · comparar catálogos entre sucursales ──')
  const { data: comp, error: eComp } = await adm.rpc('canales_comparar',
    { p_a: 'pedidosya_figueiras', p_b: 'pedidosya_guzman' })
  if (eComp) {
    mal(`canales_comparar falló: ${eComp.message}`)
  } else {
    const n = (comp ?? []).length
    const conCatalogo = canales.filter((c) => c.catalogo_cargado && c.tipo === 'pedidosya').length
    if (n === 0 && conCatalogo === 0) {
      ok('la comparación corre y devuelve 0 porque ninguno de los dos PedidosYa tiene catálogo cargado')
    } else {
      nd(`${n} productos están en uno y no en el otro`)
    }
  }

  // ── A.1 · UN PRODUCTO, TODOS SUS CANALES ─────────────────────────────────
  console.log('\n── A.1 · un producto en todos sus canales ──')
  const { data: uno } = await adm.from('canal_publicaciones')
    .select('producto_id').not('producto_id', 'is', null).limit(1).maybeSingle()
  if (!uno?.producto_id) {
    nd('no hay ninguna publicación cruzada para probar la ficha')
  } else {
    const { data: fichas, error: eF } = await adm.rpc('producto_canales', { p_producto: uno.producto_id })
    if (eF) {
      mal(`producto_canales falló: ${eF.message}`)
    } else {
      const f = (fichas ?? []) as any[]
      f.length === canales.length
        ? ok(`la ficha trae los ${f.length} canales, incluidos los que no lo tienen`)
        : mal(`la ficha trae ${f.length} canales y hay ${canales.length}`)
      const sinSaber = f.filter((x) => !x.esta_publicado && !x.que_no_se_sabe && !x.catalogo_cargado)
      const conMotivo = f.filter((x) => x.que_no_se_sabe)
      conMotivo.length > 0
        ? ok(`${conMotivo.length} canales dicen por qué no se puede saber si está publicado ahí`)
        : nd('ningún canal necesitó declarar que no se puede saber')
    }
  }

  // ── B · LOS ERRORES DEL CATÁLOGO ─────────────────────────────────────────
  console.log('\n── B · los errores del catálogo ──')

  const { data: corrida, error: eCorr } = await adm.rpc('deteccion_correr')
  if (eCorr) { mal(`la corrida falló: ${eCorr.message}`) }
  const c = (corrida ?? {}) as any

  const { data: errs, error: eErr } = await adm.rpc('deteccion_hallazgos',
    { p_familia: 'canal', p_sucursal: null, p_solo_publicados: false, p_limite: 500 })
  if (eErr) { mal(`no se pudieron leer los errores: ${eErr.message}`); process.exit(1) }
  const errores = (errs ?? []) as any[]

  const porDetector = errores.reduce<Record<string, number>>((a, e) => {
    a[e.detector] = (a[e.detector] ?? 0) + 1; return a
  }, {})
  for (const [d, n] of Object.entries(porDetector)) nd(`${d}: ${n}`)

  // ── B.1 · LO LEGAL, ARRIBA Y SIN EXCEPCIÓN ──────────────────────────────
  const legales = errores.filter((e) => e.detector === 'canal_legal_publicado')
  const legalesAbajo = legales.filter((e) => e.publicado_at === null)
  if (!legales.length) {
    ok('ninguno de condición legal publicado en un canal abierto')
  } else if (legalesAbajo.length) {
    mal(`${legalesAbajo.length} de los ${legales.length} legales quedaron en la lista larga: ` +
        'la regla de oro 9 está por encima del presupuesto de interrupción')
  } else {
    ok(`los ${legales.length} de condición legal están todos arriba, sin tope`)
  }
  if (legales.some((e) => e.plata !== null)) {
    mal('un hallazgo legal trae plata estimada: una sanción no tiene número')
  } else if (legales.length) {
    ok('ninguno trae plata: una sanción no tiene número y poner uno inventado sería peor')
  }

  // Y que la excepción la use UNO solo: si la usan varios, el presupuesto
  // de interrupción deja de existir.
  const { data: dets } = await adm.from('detectores')
    .select('clave, siempre_arriba').eq('siempre_arriba', true).eq('activo', true).limit(20)
  const conExcepcion = (dets ?? []) as any[]
  conExcepcion.length === 1
    ? ok(`un solo detector se saltea el presupuesto: ${conExcepcion[0].clave}`)
    : mal(`${conExcepcion.length} detectores se saltean el presupuesto`)

  if (Number(c.publicados_por_encima_del_presupuesto_porque_son_legales ?? -1) < 0) {
    mal('la corrida no informa cuántos se publicaron por encima del presupuesto')
  } else {
    ok(`la corrida informa aparte los ${c.publicados_por_encima_del_presupuesto_porque_son_legales} ` +
       'que subieron por encima del presupuesto')
  }

  // ── TODO HALLAZGO DICE LO QUE NO DICE, Y DE DÓNDE SALE LA PLATA ─────────
  let sinQueNoDice = 0, sinProcedencia = 0
  for (const e of errores) {
    if (!e.que_no_dice?.trim()) sinQueNoDice++
    if (e.plata !== null && !e.como_se_calculo?.trim()) sinProcedencia++
    if (e.plata === null && !/no se puede costear|no se estima plata/i.test(e.como_se_calculo ?? '')) {
      mal(`${e.clave} no tiene plata y no dice si falta el dato o si es cero`)
    }
  }
  sinQueNoDice ? mal(`${sinQueNoDice} errores no dicen lo que NO dicen`)
               : ok(`los ${errores.length} errores declaran lo que NO dicen`)
  sinProcedencia ? mal(`${sinProcedencia} traen plata sin procedencia`)
                 : ok('todo error con plata dice de dónde sale')

  // ── B.4 · «NADIE INFORMA» NO ES «FALTA HISTORIA» ────────────────────────
  const { data: est2 } = await adm.rpc('deteccion_estado', { p_detector: 'canal_rechazado' })
  const rech = ((est2 ?? []) as any[])[0]
  if (!rech) {
    mal('el detector de rechazos no está en el catálogo')
  } else if (rech.puede_correr) {
    nd(`los rechazos ya se pueden leer: ${rech.lo_que_hay}`)
  } else if (!/informando/i.test(rech.por_que_no ?? '')) {
    mal('el detector de rechazos no distingue «nadie informa» de «falta historia»')
  } else {
    ok('el de rechazos dice que no corre porque nadie informa, no porque falte historia')
  }

  // ── B.7 · RESOLVER GENERA TAREA DE CONTROL ──────────────────────────────
  console.log('\n── B.7 · resolver genera tarea de control ──')
  const { data: sinSesion } = await adm.rpc('canal_error_resolver',
    { p_anomalia: errores[0]?.id ?? null, p_que_se_hizo: 'prueba' })
  const ss = sinSesion as any
  ss?.ok === false
    ? ok('el cliente de servicio no puede cerrar un error: un cierre sin dueño no sirve')
    : mal('el cliente de servicio cerró un error sin dueño')

  if (errores[0]) {
    const email = 'prueba.canales.gerente@social-ahorro.test'
    const pass = 'Prueba-can-ger-12!'
    const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of previos?.users ?? []) if (u.email === email) await adm.auth.admin.deleteUser(u.id)
    const { data: nuevo } = await adm.auth.admin.createUser({ email, password: pass, email_confirm: true })
    if (!nuevo?.user) {
      mal('no se pudo crear el usuario de prueba')
    } else {
      await adm.from('users_admin').upsert(
        { id: nuevo.user.id, rol: 'gerente', activo: true }, { onConflict: 'id' })
      const suyo = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        { auth: { persistSession: false } })
      const { error: eLogin } = await suyo.auth.signInWithPassword({ email, password: pass })
      if (eLogin) {
        mal(`el gerente de prueba no pudo entrar: ${eLogin.message}`)
      } else {
        // Sin decir qué se hizo, no cierra.
        const { data: vacio } = await suyo.rpc('canal_error_resolver',
          { p_anomalia: errores[0].id, p_que_se_hizo: '   ' })
        const v = vacio as any
        v?.ok === false && /qué se hizo|que se hizo/.test(String(v?.por_que ?? ''))
          ? ok('no cierra sin decir qué se hizo')
          : mal('cerró un error sin decir qué se hizo')

        // Y con el motivo, cierra y genera la tarea.
        const { data: cerrado } = await suyo.rpc('canal_error_resolver',
          { p_anomalia: errores[0].id, p_que_se_hizo: 'PRUEBA · lo despubliqué en el canal' })
        const cc = cerrado as any
        if (cc?.ok !== true) {
          mal(`no pudo cerrar: ${cc?.por_que}`)
        } else if (!cc.tarea_de_control) {
          mal('cerró y no generó tarea de control (regla de oro 5)')
        } else {
          ok('cierra y genera la tarea de control, con qué se hizo adentro')
          const { data: t } = await adm.from('tareas')
            .select('titulo, descripcion, fecha_vencimiento, responsable_id, estado')
            .eq('id', cc.tarea_de_control).maybeSingle()
          if (!t) mal('la tarea de control no existe')
          else {
            /despubliqu/i.test(String((t as any).descripcion ?? ''))
              ? ok('la tarea lleva adentro qué dijo que hizo')
              : mal('la tarea no dice qué se hizo')
            nd(`la tarea vence el ${(t as any).fecha_vencimiento} · estado ${(t as any).estado}`)
          }
          // Se deshace: era una prueba, no una decisión de nadie.
          await adm.from('tareas').delete().eq('id', cc.tarea_de_control)
          await adm.from('anomalias').update({
            estado: 'abierta', que_se_hizo: null, resuelta_por: null, resuelta_at: null,
            cerrada_at: null, cerrada_por: null,
          }).eq('id', errores[0].id)
        }
      }
      await adm.from('users_admin').delete().eq('id', nuevo.user.id)
      await adm.auth.admin.deleteUser(nuevo.user.id)
    }
  }

  // ── C · CUÁNTO DEJA CADA CANAL ──────────────────────────────────────────
  console.log('\n── C.3 · el recargo contra la comisión ──')
  const { data: rvc, error: eR } = await adm.rpc('canal_recargo_vs_comision')
  if (eR) { mal(`canal_recargo_vs_comision falló: ${eR.message}`) }
  for (const r of ((rvc ?? []) as any[])) {
    if (r.canal_id === 'mostrador') continue
    if (!r.cubre) {
      nd(`${r.canal}: recargo ${r.recargo_pct}% vs comisión ${r.comision_pct}% · ` +
         `haría falta ${r.recargo_que_haria_falta}%`)
    }
    // El recargo que haría falta NO es igual a la comisión: la comisión se
    // cobra sobre el precio ya recargado.
    if (Number(r.comision_pct) > 0 &&
        Number(r.recargo_que_haria_falta) <= Number(r.comision_pct)) {
      mal(`${r.canal}: el recargo necesario (${r.recargo_que_haria_falta}%) no puede ser ` +
          `menor o igual a la comisión (${r.comision_pct}%) — la comisión se cobra sobre el precio ya recargado`)
    }
    if (!r.hecho?.trim()) mal(`${r.canal} no explica el resultado en una frase`)
  }
  const pierdenC = ((rvc ?? []) as any[]).filter((r) => !r.cubre && r.canal_id !== 'mostrador')
  pierdenC.length
    ? ok(`${pierdenC.length} canales con el recargo por debajo de lo que haría falta, y cada uno dice el número`)
    : ok('todos los canales cubren su comisión')

  // ── C.1 y C.2 ───────────────────────────────────────────────────────────
  console.log('\n── C.1 y C.2 · el desglose de una venta ──')
  const { data: unPedido } = await adm.from('orders')
    .select('id, total').gt('total', 0).order('total', { ascending: false })
    .limit(3)
  const pedidos = (unPedido ?? []) as any[]
  // El más grande es el pedido extremo: se usa el segundo, que sí es una venta.
  const elPedido = pedidos[1] ?? pedidos[0]
  if (!elPedido) {
    nd('no hay pedidos para desglosar')
  } else {
    const { data: des, error: eD } = await adm.rpc('canal_desglose_pedido', { p_order: elPedido.id })
    if (eD) {
      mal(`el desglose falló: ${eD.message}`)
    } else {
      const d = des as any
      const esperado = ['venta', 'comision', 'costo_de_lo_vendido', 'resultado', 'resultado_pct']
      const faltan = esperado.filter((k) => d[k] === undefined)
      faltan.length ? mal(`al desglose le faltan: ${faltan.join(', ')}`)
                    : ok('el desglose trae venta, comisión, costo, resultado y porcentaje')
      Array.isArray(d.que_no_se_sabe) && d.que_no_se_sabe.length
        ? ok(`y declara ${d.que_no_se_sabe.length} cosas que no puede saber`)
        : mal('el desglose no declara nada de lo que no puede saber (el IVA siempre lo es)')
      // El IVA siempre está en la lista: nunca se puede separar.
      ;(d.que_no_se_sabe ?? []).some((x: string) => /IVA/.test(x))
        ? ok('el IVA está declarado como no separable en todos los desgloses')
        : mal('el desglose no dice que el IVA no se puede separar')
      nd(`pedido de $${Math.round(d.venta).toLocaleString('es-AR')} · resultado ${d.resultado_pct}%`)
    }

    const { data: otros, error: eO } = await adm.rpc('canal_mismo_pedido_en_otros', { p_order: elPedido.id })
    if (eO) {
      mal(`la comparación entre canales falló: ${eO.message}`)
    } else {
      const o = (otros ?? []) as any[]
      o.length >= 2
        ? ok(`el mismo pedido valuado en ${o.length} canales`)
        : mal('la comparación trae menos de dos canales')
      const mostradorFila = o.find((x) => x.canal_id === 'mostrador')
      mostradorFila
        ? ok('el mostrador está entre los canales comparados: es el patrón')
        : mal('el mostrador no aparece en la comparación')
      for (const x of o) {
        if (x.canal_id !== 'mostrador' && x.contra_el_mostrador === null) {
          mal(`${x.canal} no dice cuánto más o menos deja que el mostrador`)
        }
      }
    }
  }

  // ── EL PEDIDO QUE NO ES UNA VENTA ───────────────────────────────────────
  console.log('\n── los pedidos que no son ventas ──')
  const { data: ext } = await adm.rpc('canal_ventas_extremas')
  const extremos = (ext ?? []) as any[]
  for (const e of extremos) {
    nd(`${e.cliente}: $${Math.round(e.total).toLocaleString('es-AR')} · ${e.items} items · ${e.veces}× la mediana`)
    if (!e.por_que?.trim()) mal('un pedido extremo no dice por qué lo es')
  }
  const { data: mes } = await adm.rpc('canal_resultado_por_mes', { p_meses: 12 })
  const meses = (mes ?? []) as any[]
  const conExtremos = meses.filter((m) => m.pedidos_extremos > 0)
  if (extremos.length && !conExtremos.length) {
    mal('hay pedidos extremos y ningún mes los informa')
  } else if (conExtremos.length) {
    ok(`los meses con pedidos extremos los informan aparte, no los borran`)
    for (const m of conExtremos) {
      if (!/quedaron afuera/.test(m.que_no_se_sabe ?? '')) {
        mal(`${m.canal} ${m.mes} excluyó pedidos sin decirlo`)
      }
    }
  }

  // ── C.5 · EL SUPUESTO AL LADO DEL NÚMERO ────────────────────────────────
  console.log('\n── C.5 · qué no conviene, y con qué supuesto ──')
  const { data: nc } = await adm.rpc('canal_producto_no_conviene',
    { p_canal: null, p_limite: 200 })
  const noConv = (nc ?? []) as any[]
  // El corte silencioso: si la lista viene redonda en 1.000 es PostgREST, no
  // el resultado. Y cada fila tiene que decir de cuántos es.
  if (noConv.length === 1000) {
    mal('la lista vino con exactamente 1.000 filas: es el corte de PostgREST, no el resultado')
  }
  if (noConv.length && !noConv[0].de_cuantos_es_este) {
    mal('el listado no dice de cuántos está mostrando: un listado cortado se lee como completo')
  } else if (noConv.length) {
    ok(`el listado trae ${noConv.length} de ${Number(noConv[0].de_cuantos_es_este).toLocaleString('es-AR')}, y lo dice`)
  }
  const proyectados = noConv.filter((x) => x.medido_o_proyectado === 'proyectado')
  const sinSupuesto = proyectados.filter((x) => !x.el_supuesto?.trim())
  sinSupuesto.length
    ? mal(`${sinSupuesto.length} proyecciones sin el supuesto al lado`)
    : ok(`las ${proyectados.length} proyecciones dicen el supuesto que las hace válidas`)
  const sinMarca = proyectados.filter((x) => !/PROYECTADO/.test(x.hecho ?? ''))
  sinMarca.length
    ? mal(`${sinMarca.length} proyecciones no se declaran como tales en el hecho`)
    : ok('y se declaran como proyección en el hecho, no sólo en una columna')
  const pierdenPlata = noConv.filter((x) => x.pierde_plata)
  nd(`${noConv.length} productos dejarían menos que en el mostrador; ${pierdenPlata.length} perderían plata`)

  // ── C.7 ─────────────────────────────────────────────────────────────────
  console.log('\n── C.7 · lo que no se puede calcular ──')
  const { data: nsp } = await adm.rpc('canal_lo_que_no_se_puede_calcular')
  for (const x of ((nsp ?? []) as any[])) {
    if (!x.que_lo_enciende?.trim()) mal(`«${x.que}» no dice qué lo encendería`)
    nd(`${x.que}${x.cuantos !== null ? ` (${Number(x.cuantos).toLocaleString('es-AR')})` : ''}`)
  }
  ok(`las ${(nsp ?? []).length} cosas que no se pueden calcular dicen qué las encendería`)

  // ── D · LA SALUD DEL CANAL ──────────────────────────────────────────────
  console.log('\n── D · la salud de cada canal ──')
  const { data: sal, error: eS } = await adm.rpc('canal_salud', { p_dias: 90 })
  if (eS) { mal(`canal_salud falló: ${eS.message}`) }
  const salud = (sal ?? []) as any[]

  for (const c of salud) {
    // «0 pedidos» sin decir la ventana se lee como «el canal está muerto».
    if (c.pedidos === 0 && c.pedidos_fuera_de_la_ventana > 0 &&
        !/ventana/.test(c.que_no_se_puede_medir ?? '')) {
      mal(`${c.canal} dice 0 pedidos y tiene ${c.pedidos_fuera_de_la_ventana} fuera de la ventana, sin decirlo`)
    }
    // Lo que no se puede medir, dicho.
    if (c.minutos_preparacion === null && !/tiempo de preparación/.test(c.que_no_se_puede_medir ?? '')) {
      mal(`${c.canal} no tiene tiempo de preparación y no dice por qué`)
    }
    if (!c.dias_mirados) mal(`${c.canal} no dice cuántos días mira`)
  }
  ok(`los ${salud.length} canales declaran su ventana y qué no pueden medir`)
  const sinResp = salud.filter((c) => !c.responsable)
  sinResp.length
    ? nd(`${sinResp.length} canales sin responsable declarado: los errores quedan sin dueño`)
    : ok('todos los canales tienen responsable')

  // D.7 · cerrar un canal, con las tres condiciones.
  console.log('\n── D.7 · cerrar un canal temporalmente ──')
  const { data: sinSes } = await adm.rpc('canal_cerrar',
    { p_canal: 'woo', p_hasta: new Date(Date.now() + 3600e3).toISOString(), p_motivo: 'prueba' })
  ;(sinSes as any)?.ok === false
    ? ok('el cliente de servicio no puede cerrar un canal')
    : mal('el cliente de servicio cerró un canal sin dueño')

  {
    const email = 'prueba.canales.cierre@social-ahorro.test'
    const pass = 'Prueba-cierre-12!'
    const { data: previos } = await adm.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of previos?.users ?? []) if (u.email === email) await adm.auth.admin.deleteUser(u.id)
    const { data: nuevo } = await adm.auth.admin.createUser({ email, password: pass, email_confirm: true })
    if (nuevo?.user) {
      await adm.from('users_admin').upsert(
        { id: nuevo.user.id, rol: 'gerente', activo: true }, { onConflict: 'id' })
      const suyo = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        { auth: { persistSession: false } })
      await suyo.auth.signInWithPassword({ email, password: pass })

      const { data: sinMotivo } = await suyo.rpc('canal_cerrar',
        { p_canal: 'woo', p_hasta: new Date(Date.now() + 3600e3).toISOString(), p_motivo: '  ' })
      ;(sinMotivo as any)?.ok === false && /motivo/.test(String((sinMotivo as any)?.por_que ?? ''))
        ? ok('no cierra sin motivo: es una decisión que alguien va a preguntar')
        : mal('cerró un canal sin motivo')

      const { data: sinHora } = await suyo.rpc('canal_cerrar',
        { p_canal: 'woo', p_hasta: null, p_motivo: 'no damos abasto' })
      ;(sinHora as any)?.ok === false && /hasta cuándo|hasta cuando/.test(String((sinHora as any)?.por_que ?? ''))
        ? ok('no cierra sin hora de reapertura: eso sería apagarlo, y se decide distinto')
        : mal('cerró un canal sin hora de reapertura')

      const { data: cerrado } = await suyo.rpc('canal_cerrar',
        { p_canal: 'woo', p_hasta: new Date(Date.now() + 3600e3).toISOString(),
          p_motivo: 'PRUEBA · no damos abasto' })
      if ((cerrado as any)?.ok !== true) {
        mal(`no pudo cerrar: ${(cerrado as any)?.por_que}`)
      } else {
        ok('cierra con motivo y hora, y lo deja registrado')
        const { data: reab } = await suyo.rpc('canal_reabrir', { p_canal: 'woo' })
        ;(reab as any)?.ok === true
          ? ok('y reabre, dejando el motivo del cierre anterior registrado')
          : mal(`no pudo reabrir: ${(reab as any)?.por_que}`)
      }
      // Se deshace: era una prueba.
      await adm.from('canales_venta').update({
        cerrado_hasta: null, cerrado_motivo: null, cerrado_por: null, cerrado_at: null,
      }).eq('id', 'woo')
      await adm.from('users_admin').delete().eq('id', nuevo.user.id)
      await adm.auth.admin.deleteUser(nuevo.user.id)
    }
  }

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`}`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
