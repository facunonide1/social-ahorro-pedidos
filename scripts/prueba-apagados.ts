/**
 * v1.5 · B · LOS APAGADOS CON STOCK, Y LA FÓRMULA QUE AHORA VIVE EN UN LUGAR.
 *
 * ── QUÉ PRUEBA ESTO ─────────────────────────────────────────────────────────
 *
 * 1. Que `canal_queda_por_unidad` y `canal_producto_no_conviene` dan el mismo
 *    número para el mismo producto. Antes la cuenta estaba escrita dos veces y
 *    nadie lo iba a notar hasta que dos pantallas dijeran cosas distintas del
 *    mismo producto.
 * 2. Que el total declarado es de los productos que SE PUEDEN valuar y no de
 *    todos: 542 de los 1.790 no tienen costo, su plata es null, y sumar nulls
 *    como ceros convierte un promedio inexistente en un número creíble.
 * 3. Que las razones del apagado son hipótesis y no causas: cada una trae el
 *    hecho que la sostiene, y cuando no hay ninguno lo dice.
 * 4. Que la oportunidad real excluye a los que pierden plata igual.
 * 5. Que la lista está ordenada por plata y declara de cuántos es.
 *
 *   npm run probar:apagados
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

const ars = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

async function main() {
  // ── 1 · LA FÓRMULA, EN UN SOLO LUGAR ───────────────────────────────────
  console.log('── B · la fórmula del margen vive en un solo lugar ──')

  // El canal lo busca el que llama: la funcion es pura a proposito, porque una
  // con FROM no se inlinea y canal_producto_no_conviene la llama 49.576 veces.
  const { data: cvs } = await adm.from('canales_venta')
    .select('id, comision_pct, margen_extra_pct, envio_lo_paga, costo_envio')
  const canales = new Map(((cvs ?? []) as any[]).map((c) => [c.id, c]))

  const { data: noConviene, error: eN } = await adm.rpc('canal_producto_no_conviene', {
    p_canal: null, p_limite: 25,
  })
  if (eN) { mal(`canal_producto_no_conviene falló: ${eN.message}`); process.exit(1) }

  const muestra = (noConviene ?? []) as any[]
  if (!muestra.length) {
    nd('no hay productos que dejen menos que el mostrador: no se puede comparar la fórmula')
  } else {
    let distintos = 0
    for (const p of muestra) {
      const canal = canales.get(p.canal_id)
      const { data: q, error } = await adm.rpc('canal_queda_por_unidad', {
        p_comision_pct: canal?.comision_pct ?? null,
        p_recargo_pct: canal?.margen_extra_pct ?? null,
        p_costo_envio_del_negocio:
          canal?.envio_lo_paga === 'negocio' ? (canal?.costo_envio ?? 0) : 0,
        p_mostrador: p.precio_mostrador,
        p_costo: p.costo,
      })
      if (error) { mal(`canal_queda_por_unidad falló: ${error.message}`); break }
      const r = q as any
      const iguales =
        Number(r.queda_para_el_negocio) === Number(p.queda_para_el_negocio) &&
        Number(r.precio_en_el_canal) === Number(p.precio_en_el_canal) &&
        Number(r.resultado_mostrador) === Number(p.resultado_mostrador)
      if (!iguales) {
        distintos++
        if (distintos === 1) {
          nd(`${p.sku}: la función dice ${r.queda_para_el_negocio} y la lista ${p.queda_para_el_negocio}`)
        }
      }
    }
    distintos === 0
      ? ok(`las dos dan el mismo número en los ${muestra.length} productos mirados`)
      : mal(`${distintos} de ${muestra.length} productos dan números distintos según quién calcule`)
  }

  // Y que la función declara cuándo NO puede calcular, en vez de devolver 0.
  const { data: sinCosto } = await adm.rpc('canal_queda_por_unidad', {
    p_comision_pct: 0, p_recargo_pct: 0, p_costo_envio_del_negocio: 0,
    p_mostrador: 1000, p_costo: null,
  })
  const sc = sinCosto as any
  sc?.se_puede === false && typeof sc?.por_que_no === 'string'
    ? ok('sin costo no devuelve cero: devuelve que no se puede y por qué')
    : mal('sin costo devolvió un número en vez de declarar que no se puede')

  // ── 2 · EL TOTAL ES DE LOS QUE SE PUEDEN VALUAR ────────────────────────
  console.log('\n── B.6 · el titular cuenta más productos de los que valúa ──')

  const { data: res, error: eR } = await adm.rpc('canal_apagados_resumen', { p_canal: null })
  if (eR) { mal(`canal_apagados_resumen falló: ${eR.message}`); process.exit(1) }
  const r = res as any

  const suma = Number(r.productos_con_plata) + Number(r.productos_sin_plata)
  suma === Number(r.productos)
    ? ok(`los ${r.productos} se reparten en ${r.productos_con_plata} con plata y ${r.productos_sin_plata} sin`)
    : mal(`${r.productos_con_plata} + ${r.productos_sin_plata} no da ${r.productos}`)

  Number(r.productos_sin_plata) === 0 || /no entran en el total/.test(r.por_que_el_total_no_es_de_todos ?? '')
    ? ok('y el resumen dice que los que no tienen costo no entran en el total')
    : mal('hay productos sin plata y el resumen no lo aclara: el total se lee como de todos')

  nd(`titular ${ars(Number(r.plata_declarada))} sobre ${r.productos_con_plata} productos, no ${r.productos}`)

  // ── 3 · LA OPORTUNIDAD REAL SACA A LOS QUE PIERDEN ─────────────────────
  console.log('\n── B.4 y B.6 · la oportunidad real ──')

  Number(r.oportunidad_real) <= Number(r.plata_declarada)
    ? ok('la oportunidad real nunca es mayor que el titular')
    : mal('la oportunidad real quedó por encima del total declarado')

  if (Number(r.pierden_igual) > 0) {
    Number(r.oportunidad_real) < Number(r.plata_declarada)
      ? ok(`hay ${r.pierden_igual} que pierden plata igual y están afuera de la oportunidad`)
      : mal(`hay ${r.pierden_igual} que pierden plata y la oportunidad no los descontó`)
    nd(`oportunidad real ${ars(Number(r.oportunidad_real))} sobre ${r.productos_de_la_oportunidad} productos`)
  } else {
    nd('ningún producto pierde plata igual: la oportunidad coincide con el titular')
  }

  // ── 4 · LAS RAZONES SON HIPÓTESIS ──────────────────────────────────────
  console.log('\n── B.3 · por qué podría estar apagado ──')

  const { data: lista, error: eL } = await adm.rpc('canal_apagados_con_stock', {
    p_canal: null, p_limite: 200,
  })
  if (eL) { mal(`canal_apagados_con_stock falló: ${eL.message}`); process.exit(1) }
  const filas = (lista ?? []) as any[]

  if (!filas.length) {
    mal('la lista vino vacía y el resumen dice que hay apagados: algo no cruza')
  } else {
    const sinHipotesis = filas.filter((f) => !Array.isArray(f.hipotesis) || !f.hipotesis.length)
    sinHipotesis.length
      ? mal(`${sinHipotesis.length} filas no traen ninguna razón, ni «no se sabe»`)
      : ok('toda fila trae al menos una razón posible, incluso cuando es «no se sabe»')

    const sinElHecho = filas.flatMap((f) => f.hipotesis as any[])
      .filter((h) => !h?.el_hecho?.trim())
    sinElHecho.length
      ? mal(`${sinElHecho.length} hipótesis no dicen qué hecho las sostiene: son corazonadas`)
      : ok('y cada razón trae el hecho verificable que la sostiene')

    const noSabe = filas.filter((f) => !f.se_sabe_por_que)
    noSabe.length
      ? ok(`${noSabe.length} de ${filas.length} declaran que no se sabe por qué están apagados`)
      : nd('todas las filas de la muestra tienen algún hecho que podría explicarlas')

    // Y que ninguna hipótesis se presenta como causa.
    const afirma = filas.flatMap((f) => f.hipotesis as any[])
      .filter((h) => /^está apagado porque/i.test(h?.que ?? ''))
    afirma.length
      ? mal(`${afirma.length} razones están redactadas como causa y no como hipótesis`)
      : ok('ninguna razón está redactada como causa')

    // ── 5 · ORDEN Y CORTE DECLARADO ──────────────────────────────────────
    console.log('\n── B.2 · ordenada por plata, y de cuántos es ──')

    const conPlata = filas.filter((f) => f.plata_quieta !== null).map((f) => Number(f.plata_quieta))
    const ordenada = conPlata.every((v, i) => i === 0 || conPlata[i - 1] >= v)
    ordenada
      ? ok('los que tienen plata vienen de mayor a menor')
      : mal('la lista no está ordenada por plata')

    const sinPlataPrimero = filas.findIndex((f) => f.plata_quieta === null)
    const conPlataUltimo = filas.map((f) => f.plata_quieta !== null).lastIndexOf(true)
    sinPlataPrimero === -1 || sinPlataPrimero > conPlataUltimo
      ? ok('y los que no se pueden valuar van al final, no mezclados')
      : mal('hay filas sin plata intercaladas entre las que sí tienen')

    typeof filas[0].de_cuantos_es_este === 'number' && filas[0].de_cuantos_es_este >= filas.length
      ? ok(`cada fila dice de cuántos es: ${filas[0].de_cuantos_es_este}`)
      : mal('la lista no declara de cuántos es: un listado cortado se lee como completo')
  }

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`}`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
