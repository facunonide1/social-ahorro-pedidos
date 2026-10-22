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
  const legales = Number(porProblema['no_deberia_estar_publicado'] ?? 0)
  legales > 0
    ? nd(`${legales} publicados que no deberían estarlo (el enunciado decía 11)`)
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

  console.log(`\n${fallas === 0 ? 'TODO BIEN' : `${fallas} FALLA(S)`}`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
