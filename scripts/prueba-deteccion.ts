/**
 * LOS DETECTORES, PROBADOS CONTRA LOS DATOS REALES.
 *
 * ── LO QUE PRUEBA ───────────────────────────────────────────────────────────
 *
 * La regla de los seis bloques · que ningún hecho use una palabra que se
 *   pueda leer como acusación, y que ninguno nombre una causa.
 * B.2 · que ningún hallazgo de caja lleve el nombre de una persona, ni en el
 *   hecho ni en la evidencia.
 * C.7 · que cada detector declare su historia mínima, y que el que no la
 *   tenga diga por qué no puede correr en vez de reportar cero.
 * D.1 · que todo hallazgo con plata traiga de dónde sale esa plata.
 *
 * ── POR QUÉ MIRA LAS PALABRAS ───────────────────────────────────────────────
 *
 * Porque es lo único que no se puede verificar leyendo el esquema. Un
 * detector puede estar perfecto y la frase decir «faltan 16 unidades», que es
 * una causa disfrazada de hecho.
 *
 *   npx tsx --env-file=.env.local scripts/prueba-deteccion.ts
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

/**
 * ── LAS PALABRAS QUE NO VAN ─────────────────────────────────────────────────
 *
 * Dos listas distintas y por motivos distintos.
 *
 * Las de ACUSACIÓN señalan a alguien: «robo», «sustracción», «responsable».
 * Las de CAUSA afirman un porqué que el sistema no sabe: «porque», «se debe
 * a», «por culpa de». Un hallazgo puede ser correcto y seguir estando mal
 * escrito.
 *
 * «falta» entra en la lista de causa y no de acusación: «faltan 16 unidades»
 * afirma que se fueron, cuando el hecho es que hay 16 menos de las que la
 * cuenta dice.
 */
const ACUSACION = [
  'robo', 'robaron', 'hurto', 'sustra', 'culpa', 'responsable de',
  'sospech', 'fraude', 'desvi', 'se llev', 'irregularidad',
]
const CAUSA = [
  'porque', 'se debe a', 'por culpa', 'motivo:', 'la razon es', 'la razón es',
  'faltan ', 'falta de ', 'evidentemente', 'claramente', 'seguramente',
]

type Fila = {
  clave: string; sucursal_id: string | null; producto_id: string | null
  hecho: string; plata: number | null; como_se_calculo: string; evidencia: any
}

const DETECTORES: { clave: string; rpc: string; bloque: string }[] = [
  { bloque: 'B.1', clave: 'stock_no_cuadra', rpc: 'detectar_stock_no_cuadra' },
  { bloque: 'B.2', clave: 'caja_diferencias_repetidas', rpc: 'detectar_caja_diferencias_repetidas' },
  { bloque: 'B.3', clave: 'comprobante_duplicado', rpc: 'detectar_comprobante_duplicado' },
  { bloque: 'B.4', clave: 'monto_fuera_de_lo_habitual', rpc: 'detectar_monto_fuera_de_lo_habitual' },
  { bloque: 'B.5', clave: 'faltante_sin_nota_credito', rpc: 'detectar_faltante_sin_nota_credito' },
  { bloque: 'B.6', clave: 'barras_con_dos_precios', rpc: 'detectar_barras_con_dos_precios' },
  { bloque: 'C.1', clave: 'dejo_de_venderse', rpc: 'detectar_dejo_de_venderse' },
  { bloque: 'C.2', clave: 'empezo_a_vender_mas', rpc: 'detectar_empezo_a_vender_mas' },
  { bloque: 'C.3', clave: 'proveedor_cambio', rpc: 'detectar_proveedor_cambio' },
  { bloque: 'C.4', clave: 'sucursal_bajo', rpc: 'detectar_sucursal_bajo' },
]

async function main() {
  // ── C.7 · CADA DETECTOR DECLARA SU HISTORIA ─────────────────────────────
  console.log('── C.7 · cuánta historia necesita cada uno ──')
  const { data: estado, error: eEstado } = await adm.rpc('deteccion_estado')
  if (eEstado) { mal(`deteccion_estado falló: ${eEstado.message}`); process.exit(1) }
  const est = (estado ?? []) as {
    clave: string; nombre: string; historia_minima: string
    puede_correr: boolean; por_que_no: string | null; lo_que_hay: string | null
  }[]

  for (const d of est) {
    if (!d.historia_minima?.trim()) { mal(`${d.clave} no declara historia mínima`); continue }
    if (d.puede_correr) ok(`${d.clave} puede correr · ${d.lo_que_hay}`)
    else if (d.por_que_no?.trim()) nd(`${d.clave} NO corre · ${d.por_que_no}`)
    else mal(`${d.clave} no puede correr y no dice por qué`)
  }

  // ── LOS SEIS, CONTRA LOS DATOS REALES ───────────────────────────────────
  console.log('\n── B · los seis detectores contra los datos reales ──')
  const todos: Fila[] = []

  for (const d of DETECTORES) {
    const { data, error } = await adm.rpc(d.rpc)
    if (error) { mal(`${d.bloque} ${d.rpc} falló: ${error.message}`); continue }
    const filas = (data ?? []) as Fila[]
    todos.push(...filas)

    const e = est.find((x) => x.clave === d.clave)
    const conPlata = filas.filter((f) => f.plata !== null).length

    if (!e?.puede_correr && filas.length > 0) {
      mal(`${d.bloque} ${d.clave} devolvió ${filas.length} hallazgos y declaró que no puede correr`)
    } else if (!e?.puede_correr) {
      nd(`${d.bloque} ${d.clave}: no corre, 0 hallazgos. Coherente con lo que declara.`)
    } else {
      const suma = filas.reduce((a, f) => a + Number(f.plata ?? 0), 0)
      ok(`${d.bloque} ${d.clave}: ${filas.length} hallazgos, ${conPlata} con plata` +
         (suma > 0 ? ` ($${Math.round(suma).toLocaleString('es-AR')})` : ''))
    }

    // Claves repetidas: dos hallazgos con la misma clave son el mismo hallazgo
    // dos veces, y el tope de D.3 contaría mal.
    const claves = new Set(filas.map((f) => f.clave))
    if (claves.size !== filas.length) mal(`${d.bloque} ${d.clave} repite claves`)
  }

  // ── LA REGLA DE LOS SEIS BLOQUES ────────────────────────────────────────
  console.log('\n── la regla · el hecho, nunca la causa ──')

  /**
   * ── LO QUE VA ENTRE COMILLAS NO LO DICE EL SISTEMA ────────────────────
   *
   * La primera corrida marcó dos hechos de B.5:
   *
   *   «El comprobante 77296 de DISTRISAM declaró un faltante hace 169 días:
   *    "FALTAN 3 HIPOGLOS POMO"»
   *
   * La palabra «faltan» está ahí, pero la escribió a mano quien recibió la
   * mercadería. El sistema no está afirmando una causa: está citando el
   * comprobante, que es la evidencia.
   *
   * La regla se aplica a las palabras del sistema. Lo entrecomillado se saca
   * antes de mirar — y se saca con las comillas angulares, que son las que
   * usan los detectores para citar.
   */
  const sinCitas = (s: string) => (s ?? '').replace(/«[^»]*»/g, '« »')

  let acusa = 0, causa = 0, sinProcedencia = 0
  for (const f of todos) {
    const t = sinCitas(f.hecho).toLowerCase()
    for (const p of ACUSACION) if (t.includes(p)) { mal(`«${p}» en: ${f.hecho.slice(0, 90)}`); acusa++ }
    for (const p of CAUSA) if (t.includes(p)) { mal(`«${p}» en: ${f.hecho.slice(0, 90)}`); causa++ }
    // D.1 · si tiene plata, tiene que decir de dónde sale.
    if (f.plata !== null && !f.como_se_calculo?.trim()) {
      mal(`${f.clave} tiene plata y no dice cómo se calculó`); sinProcedencia++
    }
    // ── Y SI NO LA TIENE, TIENE QUE DECIR CUÁL DE LAS DOS COSAS PASA ────
    //
    // Son dos motivos distintos y conviene no mezclarlos:
    //
    //   «no se puede costear» · falta el dato. El producto no tiene precio,
    //     el faltante se escribió sin monto. Es una carencia que se puede
    //     arreglar cargando el dato.
    //   «no se estima plata» · el dato está y la plata es cero de verdad. Un
    //     producto que aceleró y tiene stock para seis meses no pone plata en
    //     riesgo: el hallazgo es el cambio de ritmo.
    //
    // Cualquiera de las dos sirve. Lo que no sirve es no decir nada.
    const sinPlata = (f.como_se_calculo ?? '').toLowerCase()
    if (f.plata === null &&
        !sinPlata.startsWith('no se puede costear') &&
        !sinPlata.startsWith('no se estima plata')) {
      mal(`${f.clave} no tiene plata y no dice si falta el dato o si la plata es cero`)
    }
  }
  if (!acusa) ok(`ninguno de los ${todos.length} hechos usa una palabra de acusación`)
  if (!causa) ok(`ninguno de los ${todos.length} hechos afirma una causa`)
  if (!sinProcedencia) ok('todo hallazgo con plata dice de dónde sale')

  // ── B.2 · NUNCA UNA PERSONA EN UN LISTADO ───────────────────────────────
  console.log('\n── B.2 · ninguna persona en un listado ──')
  const { data: gente } = await adm.from('empleados').select('nombre').limit(1000)
  const nombres = (gente ?? []).map((g: any) => String(g.nombre ?? '').trim())
    .filter((n) => n.length >= 4)
  const { data: cajeros } = await adm.from('arqueos_caja')
    .select('cajero_nombre').not('cajero_nombre', 'is', null).limit(1000)
  for (const c of (cajeros ?? []) as any[]) {
    const n = String(c.cajero_nombre ?? '').trim()
    if (n.length >= 4) nombres.push(n)
  }

  let filtrados = 0
  for (const f of todos) {
    const texto = `${f.hecho} ${f.como_se_calculo} ${JSON.stringify(f.evidencia)}`.toLowerCase()
    for (const n of new Set(nombres)) {
      if (texto.includes(n.toLowerCase())) { mal(`«${n}» aparece en ${f.clave}`); filtrados++ }
    }
  }
  if (!filtrados) {
    ok(`ninguno de los ${todos.length} hallazgos nombra a una de las ${new Set(nombres).size} personas`)
  }

  // ── C.4 · CONTRA LO SUYO, NO CONTRA LAS OTRAS ───────────────────────────
  //
  // No se puede leer en el SQL desde acá, pero sí se puede verificar la
  // consecuencia: si comparara entre sucursales, la más chica aparecería
  // siempre y la más grande nunca. Con tres meses de historia eso no se puede
  // demostrar, así que se verifica lo que sí: que la evidencia declare contra
  // qué comparó, y que no mencione a otra sucursal.
  console.log('\n── C.4 · contra su propia historia ──')
  const { data: bajo } = await adm.rpc('detectar_sucursal_bajo')
  const { data: todasSucs } = await adm.from('sucursales').select('id, nombre')
  for (const f of (bajo ?? []) as Fila[]) {
    const ev = f.evidencia ?? {}
    if (ev.comparado_contra !== 'su propia historia') {
      mal(`C.4 ${f.clave} no declara contra qué comparó`)
      continue
    }
    const otras = (todasSucs ?? []).filter((s: any) => s.id !== f.sucursal_id)
    const mencionaOtra = otras.filter((s: any) =>
      `${f.hecho} ${JSON.stringify(ev)}`.toLowerCase().includes(String(s.nombre).toLowerCase()))
    if (mencionaOtra.length) mal(`C.4 ${f.clave} menciona ${mencionaOtra.map((s: any) => s.nombre).join(', ')}`)
    else ok(`C.4 ${ev.sucursal}: compara contra su propia historia y no nombra a ninguna otra`)
  }
  if (!(bajo ?? []).length) nd('C.4 no encontró ninguna sucursal por debajo de su propia historia')

  // Y que el detector de caja no traiga el cajero ni en la evidencia.
  const { data: caja } = await adm.rpc('detectar_caja_diferencias_repetidas')
  const ev = JSON.stringify((caja ?? []).map((c: any) => c.evidencia))
  if (ev.includes('cajero')) mal('la evidencia de B.2 trae el cajero')
  else ok('la evidencia de B.2 agrupa por sucursal y turno, sin cajero')

  // ── D · QUE NO SE VUELVA RUIDO ──────────────────────────────────────────
  //
  // Es el bloque que decide si los doce detectores sirven. Se prueba la
  // consecuencia, que es lo único verificable: cuántos de los 1.235 llegan a
  // interrumpir a alguien.
  console.log('\n── D · que no se vuelva ruido ──')

  const { data: corrida, error: eCorrer } = await adm.rpc('deteccion_correr')
  if (eCorrer) { mal(`deteccion_correr falló: ${eCorrer.message}`) }
  const c = (corrida ?? {}) as any

  // ── D.3 · EL TOPE ES POR DIA, NO POR CORRIDA ──────────────────────────
  //
  // Se corre DOS VECES a propósito. Con el tope contado por corrida, la
  // segunda publicaba otros cinco por detector y el presupuesto del día
  // desaparecía sin que nadie lo notara. Es exactamente el error que tuvo
  // esta función antes de la 0241.
  const { data: segunda } = await adm.rpc('deteccion_correr')
  const s2 = (segunda ?? {}) as any
  if (Number(s2.publicados ?? 0) > 0) {
    mal(`la segunda corrida del día publicó ${s2.publicados} más: el tope es por corrida y no por día`)
  } else {
    ok('correrla dos veces el mismo día no publica nada más')
  }

  const { data: porDetector } = await adm.from('detectores')
    .select('clave, tope_diario, nombre').not('funcion', 'is', null)
  const hoy = new Date().toISOString().slice(0, 10)
  for (const d of (porDetector ?? []) as any[]) {
    const { count } = await adm.from('anomalias')
      .select('id', { count: 'exact', head: true })
      .eq('detector', d.clave).gte('publicado_at', `${hoy}T00:00:00Z`)
    const n = count ?? 0
    if (n > d.tope_diario) mal(`${d.clave} publicó ${n} hoy y su tope es ${d.tope_diario}`)
  }
  ok(`ningún detector pasó su tope del día`)

  // ── D.4 · EL PRESUPUESTO DE INTERRUPCION ──────────────────────────────
  const { count: publicadosHoy } = await adm.from('anomalias')
    .select('id', { count: 'exact', head: true }).gte('publicado_at', `${hoy}T00:00:00Z`)
  const presupuesto = Number(c.presupuesto_del_dia ?? 40)
  if ((publicadosHoy ?? 0) > presupuesto) {
    mal(`se publicaron ${publicadosHoy} hoy y el presupuesto es ${presupuesto}`)
  } else {
    ok(`${publicadosHoy} publicados hoy, con un presupuesto de ${presupuesto}`)
  }
  nd(`de ${c.encontrados} encontrados, ${publicadosHoy} interrumpen a alguien. ` +
     `${c.esperando_con_plata} esperan con plata y ${c.en_la_lista_larga_sin_plata} no se pueden costear.`)

  // ── D.1 · SIN PLATA NO APARECE ARRIBA ─────────────────────────────────
  const { data: arriba } = await adm.rpc('deteccion_hallazgos',
    { p_familia: null, p_sucursal: null, p_solo_publicados: true, p_limite: 200 })
  const sinPlataArriba = ((arriba ?? []) as Fila[]).filter((f) => f.plata === null)
  if (sinPlataArriba.length) {
    mal(`${sinPlataArriba.length} hallazgos sin plata estimada están arriba`)
  } else {
    ok(`ninguno de los ${(arriba ?? []).length} de arriba está sin plata estimada`)
  }

  // ── D.2 · ORDENADO POR PLATA, NO POR FECHA ────────────────────────────
  const platas = ((arriba ?? []) as Fila[]).map((f) => Number(f.plata ?? 0))
  const ordenado = platas.every((v, i) => i === 0 || platas[i - 1] >= v)
  ordenado
    ? ok('la lista de arriba viene ordenada por plata, de mayor a menor')
    : mal('la lista de arriba no está ordenada por plata')

  // Y que la lista larga tenga TODO: si el tope recortara lo guardado en vez
  // de lo publicado, D.1 no existiría.
  const { count: guardados } = await adm.from('anomalias')
    .select('id', { count: 'exact', head: true })
    .not('detector', 'is', null)
    .in('estado', ['abierta', 'reaparecio'])
  const encontrados = Number(c.encontrados ?? 0)
  if ((guardados ?? 0) < encontrados) {
    mal(`se encontraron ${encontrados} y en la lista larga hay ${guardados}: el tope recortó lo guardado`)
  } else {
    ok(`la lista larga tiene ${guardados}: el tope recorta lo que se publica, no lo que se guarda`)
  }

  // ── D.5 · DESCARTAR CON UN MOTIVO DEL CATALOGO ────────────────────────
  const { data: unHallazgo } = await adm.rpc('deteccion_hallazgos',
    { p_familia: null, p_sucursal: null, p_solo_publicados: true, p_limite: 1 })
  const uno = ((unHallazgo ?? []) as Fila[])[0]
  if (!uno) {
    nd('D.5 no se pudo probar: no hay ningún hallazgo publicado')
  } else {
    const { data: inventado } = await adm.rpc('deteccion_descartar',
      { p_anomalia: (uno as any).id, p_motivo: 'porque_no_me_gusta' })
    const inv = inventado as any
    inv?.ok === false && String(inv?.por_que ?? '').includes('no es un motivo del catalogo')
      ? ok('un motivo que no está en el catálogo se rechaza, y dice por qué')
      : mal('aceptó un motivo que no está en el catálogo')
  }

  // ── D.7 · EL MARCADOR NO REGALA ACIERTOS ──────────────────────────────
  const { data: mk } = await adm.rpc('deteccion_marcador')
  for (const m of ((mk ?? []) as any[])) {
    // La lección de la v0.99: lo que nadie miró no cuenta como acierto.
    if (m.aciertos > 0 && m.aciertos > m.abiertos + m.descartes) {
      mal(`${m.detector} dice ${m.aciertos} aciertos con ${m.abiertos} abiertos y ${m.descartes} descartes`)
    }
    if (!m.veredicto?.trim()) mal(`${m.detector} no dice nada en su veredicto`)
    if (!m.se_puede_juzgar && m.aciertos > 0) {
      mal(`${m.detector} cuenta aciertos sin poder ser juzgado todavía`)
    }
  }
  const juzgables = ((mk ?? []) as any[]).filter((m) => m.se_puede_juzgar).length
  ok(`los ${(mk ?? []).length} detectores tienen veredicto; ${juzgables} ya se pueden juzgar`)

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`} · ${todos.length} hallazgos mirados`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
