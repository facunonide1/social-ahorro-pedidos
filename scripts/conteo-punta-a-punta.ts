/**
 * LOS OCHO PASOS, PUNTA A PUNTA.
 *
 * Uso: npx tsx scripts/conteo-punta-a-punta.ts
 *
 * Importa una lista de 10 items, cuenta con dos diferencias a propósito, cierra,
 * y verifica que aparezcan las tres consecuencias. Borra todo lo que crea.
 *
 * El paso 3 —que la esperada no viaje— lo cubre
 * `scripts/conteo-verificar-ciego.ts`, que mira la respuesta real; acá se repite
 * la aserción sobre el payload para que esta prueba no dependa de que alguien
 * corra la otra.
 *
 * Sale 1 si algún paso falla.
 */
import { createClient } from '@supabase/supabase-js'

import { cerrarConteo } from '../lib/conteo/cerrar'
import { aplicar, previsualizar } from '../lib/conteo/importar'
import { payloadParaContar } from '../lib/conteo/payload'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: string, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function main() {
  /* ── Los datos de partida, del catálogo real ──────────────────────────── */
  // Se pide de más y se filtra por punto: el stock está por punto, y diez items
  // repartidos entre cuatro puntos no son una zona — son cuatro góndolas.
  const { data: stock } = await sb
    .from('stock_items')
    .select('producto_id, sucursal_id, cantidad, productos_catalogo(sku, nombre, precio_sugerido)')
    .gt('cantidad', 0)
    .limit(500)
  const base = (stock ?? []) as unknown as {
    producto_id: string
    sucursal_id: string
    cantidad: number
    productos_catalogo: { sku: string; nombre: string; precio_sugerido: number | null } | null
  }[]
  if (base.length < 10) {
    console.log(`\nHacen falta 10 productos con stock y hay ${base.length}. La prueba no corre.\n`)
    process.exit(1)
  }
  // El punto con más items cargados, no el primero que salga.
  const porPunto = new Map<string, typeof base>()
  for (const b of base) porPunto.set(b.sucursal_id, [...(porPunto.get(b.sucursal_id) ?? []), b])
  const [punto, items10] = [...porPunto.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ['', []]
  const delPunto = items10.filter((b) => b.productos_catalogo?.sku).slice(0, 10)
  if (delPunto.length < 10) {
    console.log(`\nHacen falta 10 items del MISMO punto y hay ${delPunto.length}.\n`)
    process.exit(1)
  }

  /* ── 1 · Importar ─────────────────────────────────────────────────────── */
  const filas = delPunto.map((b, i) => ({
    sku: b.productos_catalogo!.sku,
    descripcion: b.productos_catalogo!.nombre,
    unidad: 'un',
    orden: i + 1,
  }))
  // Una fila más que NO está en el catálogo: es el caso que importa.
  filas.push({ sku: 'ZZ-NO-EXISTE-9', descripcion: 'Item que no está en el catálogo', unidad: 'un', orden: 11 })

  const previa = await previsualizar(filas)
  const r1 = await aplicar({
    zona: 'ZZ prueba punta a punta',
    puntoId: punto,
    descripcion: 'se borra al terminar',
    // Los tres ámbitos los prueba `conteo-probar-ambitos.ts`. Acá va `total`
    // porque las cantidades del catálogo de prueba se comparan contra el total.
    ambito: 'total',
    filas,
    autorId: AUTOR,
  })
  paso(
    '1',
    r1.ok && previa.conCatalogo === 10 && previa.sinCatalogo === 1,
    `importados ${r1.ok ? r1.creados : 0} items · ${previa.conCatalogo} con catálogo · ${previa.sinCatalogo} sin catálogo (entra igual)`,
  )
  if (!r1.ok) process.exit(1)
  const listaId = r1.listaId

  /* ── 2 · Empezar el conteo ────────────────────────────────────────────── */
  const { data: c } = await sb
    .from('cnt_conteos')
    .insert({ lista_id: listaId, punto_id: punto, contado_por: AUTOR, estado: 'contando', created_by: AUTOR })
    .select('id')
    .single()
  const conteoId = (c as { id: string }).id
  paso('2', !!conteoId, `conteo abierto: ${conteoId.slice(0, 8)}`)

  /* ── 3 · La esperada NO viaja ─────────────────────────────────────────── */
  const payload = await payloadParaContar(sb, conteoId)
  //
  // Se compara CADA ITEM CONTRA SU PROPIA esperada, no el JSON entero contra
  // todos los números. Buscar `38` suelto en el texto da rojo cuando el item 38
  // de la lista existe: la primera versión de esta prueba falló así, y el
  // sistema estaba bien. Un número igual no es el mismo dato.
  //
  // `orden` se excluye a propósito: es 1..11 y puede coincidir con una cantidad
  // por casualidad. Excluirlo es honesto sólo porque el campo se sirve siempre
  // y no depende del stock — si dependiera, esta exclusión taparía la fuga.
  const fugas: string[] = []
  for (const it of payload?.items ?? []) {
    const suEsperada = delPunto.find((b) => b.productos_catalogo?.sku === it.sku)
    if (!suEsperada) continue
    for (const [campo, valor] of Object.entries(it)) {
      if (campo === 'orden') continue
      if (typeof valor === 'number' && valor === Number(suEsperada.cantidad)) {
        fugas.push(`${it.sku}.${campo} = ${valor}`)
      }
    }
  }
  paso(
    '3',
    payload?.items.length === 11 && fugas.length === 0,
    `${payload?.items.length} items para contar · ${fugas.length} campo(s) con la esperada de su propio item` +
      (fugas.length ? `: ${fugas.join(', ')}` : ' — ninguno'),
  )

  /* ── 4 · Contar los 11, con 2 diferencias a propósito ─────────────────── */
  const items = payload!.items
  const conDiferenciaEsperada = new Set([items[0].id, items[1].id])
  for (const [i, it] of items.entries()) {
    const original = delPunto.find((b) => b.productos_catalogo?.sku === it.sku)
    const real = original ? Number(original.cantidad) : 0
    // Los dos primeros se cuentan mal a propósito; el resto, igual al sistema.
    // La diferencia tiene que superar el umbral del 5%, si no la prueba
    // verifica el umbral en vez de las consecuencias. Se le saca la mitad.
    const contada = conDiferenciaEsperada.has(it.id) ? Math.max(0, real - Math.max(1, Math.floor(real / 2))) : real
    await sb.from('cnt_renglones').insert({
      conteo_id: conteoId,
      lista_item_id: it.id,
      cantidad_contada: contada,
      nota: i === 0 ? 'había tres rotos en el fondo' : null,
      contado_at: new Date().toISOString(),
    })
  }
  const { count: contados } = await sb
    .from('cnt_renglones')
    .select('id', { count: 'exact', head: true })
    .eq('conteo_id', conteoId)
  paso('4', contados === 11, `${contados} renglones contados, 2 con diferencia a propósito`)

  /* ── 5 · Cerrar y ver el resultado ────────────────────────────────────── */
  const cierre = await cerrarConteo(conteoId, AUTOR)
  if (!cierre.ok) {
    paso('5', false, cierre.error)
    process.exit(1)
  }
  const { resultado, consecuencias } = cierre
  paso(
    '5',
    resultado.conDiferencia === 2 && resultado.sinComparar === 1 && resultado.coinciden === 8,
    `${resultado.total} contados · ${resultado.coinciden} coinciden · ${resultado.conDiferencia} con diferencia · ${resultado.sinComparar} sin poder comparar`,
  )
  console.log(
    `    la más grande: ${resultado.renglones[0].descripcion} — contaste ${resultado.renglones[0].contada}, el sistema dice ${resultado.renglones[0].esperada}`,
  )
  console.log(`    el que no se pudo comparar: ${resultado.renglones.find((x) => x.esperada === null)?.motivo}`)

  /* ── 6 · Las tres consecuencias ───────────────────────────────────────── */
  const { data: tareas } = await sb
    .from('tareas')
    .select('id, titulo, tipos_tareas(codigo)')
    .eq('entidad_relacionada', 'conteo')
    .eq('entidad_id', conteoId)
  const codigos = ((tareas ?? []) as unknown as { tipos_tareas: { codigo: string } | null }[]).map(
    (t) => t.tipos_tareas?.codigo,
  )
  paso(
    '6',
    // La cuenta se DERIVA del umbral, no se asume: si una diferencia quedara
    // abajo, la irregularidad que falta está explicada y no es un error.
    consecuencias.irregularidades + consecuencias.irregularidadesOmitidas ===
      2 - consecuencias.bajoUmbral &&
      consecuencias.bajoUmbral === 0 &&
      codigos.includes('cnt_recuento') &&
      codigos.includes('cnt_ajuste_sistema_autoridad'),
    `${consecuencias.irregularidades} irregularidad(es) nueva(s)` +
      (consecuencias.irregularidadesOmitidas
        ? ` (${consecuencias.irregularidadesOmitidas} ya existía(n) para ese SKU y ese día: no se pisan)`
        : '') +
      ` · tareas: ${codigos.join(', ')}`,
  )
  console.log(
    `    umbral: $${consecuencias.umbral.valor} o ${consecuencias.umbral.pct}% · fijado hace ${consecuencias.umbral.fijadoHaceDias} día(s)` +
      (consecuencias.bajoUmbral ? ` · ${consecuencias.bajoUmbral} diferencia(s) quedaron abajo` : ''),
  )

  /* ── 7 · El .xlsx de la tarea ─────────────────────────────────────────── */
  const { data: rgs } = await sb
    .from('cnt_renglones')
    .select('cantidad_contada, cantidad_esperada, diferencia, valor_diferencia, cnt_lista_items(sku, descripcion)')
    .eq('conteo_id', conteoId)
  const paraExcel = ((rgs ?? []) as unknown as {
    cantidad_contada: number | null
    cantidad_esperada: number | null
    diferencia: number | null
    cnt_lista_items: { sku: string | null } | null
  }[]).filter((r) => r.diferencia !== null && r.diferencia !== 0)
  paso(
    '7',
    paraExcel.length === 2 && paraExcel.every((r) => r.cnt_lista_items?.sku),
    `el Excel de la tarea sale de ${paraExcel.length} renglón(es), todos con SKU (regla de oro 6)`,
  )

  /* ── 8 · Borrar los datos de prueba ───────────────────────────────────── */
  const skus = delPunto.map((b) => b.productos_catalogo!.sku)
  await sb.from('tareas').delete().eq('entidad_relacionada', 'conteo').eq('entidad_id', conteoId)
  await sb
    .from('irregularidades_stock')
    .delete()
    .eq('sucursal_id', punto)
    .in('sku', skus)
    .like('nota', 'Conteo de zona «ZZ prueba punta a punta»%')
  await sb.from('cnt_renglones').delete().eq('conteo_id', conteoId)
  await sb.from('cnt_conteos').delete().eq('id', conteoId)
  await sb.from('cnt_lista_items').delete().eq('lista_id', listaId)
  await sb.from('cnt_listas').delete().eq('id', listaId)

  const { count: quedan } = await sb
    .from('cnt_conteos')
    .select('id', { count: 'exact', head: true })
    .eq('id', conteoId)
  const { count: irregQuedan } = await sb
    .from('irregularidades_stock')
    .select('id', { count: 'exact', head: true })
    .like('nota', 'Conteo de zona «ZZ prueba punta a punta»%')
  paso('8', quedan === 0 && irregQuedan === 0, 'no quedó nada de la prueba')

  console.log(`\n${fallo ? 'ALGO FALLÓ' : 'PUNTA A PUNTA: 8/8'}\n`)
  process.exit(fallo ? 1 : 0)
}

main()
