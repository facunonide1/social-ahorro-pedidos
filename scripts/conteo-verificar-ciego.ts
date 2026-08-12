/**
 * ¿EL CONTEO ES CIEGO DE VERDAD?
 *
 * Uso: npx tsx scripts/conteo-verificar-ciego.ts
 *
 * ── QUÉ SE VERIFICA, Y CONTRA QUÉ ───────────────────────────────────────────
 *
 * Contra la SALIDA REAL de lo que sirve la pantalla, no contra el componente.
 * Que el componente no muestre la esperada no dice nada: si el dato viaja,
 * alcanza con abrir la pestaña de red para dejar de contar a ciegas.
 *
 * Se arma un conteo real, con un item que tiene stock cargado —o sea, con una
 * esperada que existe y podría filtrarse— y se busca ese número en el JSON
 * serializado. Buscarlo en un conteo sin stock daría verde sin haber probado
 * nada: la pregunta 2, cero porque está bien o cero porque no había qué mirar.
 *
 * Y una capa más: se le pide a la base que escriba la esperada con el conteo
 * abierto. Tiene que rechazarlo.
 *
 * Deja la base como estaba. Sale 1 si algo falla.
 */
import { createClient } from '@supabase/supabase-js'

import { payloadParaContar } from '../lib/conteo/payload'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

let fallo = false
function caso(ok: boolean, texto: string, detalle = '') {
  if (!ok) fallo = true
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`)
  if (detalle) console.log(`      ${detalle}`)
}

async function main() {
  console.log('\n═══ EL CONTEO CIEGO, SOBRE LA RESPUESTA REAL ═══\n')

  /* ── Un item que SÍ tiene stock: si no, no habría nada que filtrar ────── */
  const { data: conStock } = await sb
    .from('stock_items')
    .select('producto_id, sucursal_id, cantidad, productos_catalogo(sku, nombre)')
    .gt('cantidad', 0)
    .limit(1)
  const base = (conStock ?? [])[0] as unknown as
    | { producto_id: string; sucursal_id: string; cantidad: number; productos_catalogo: { sku: string; nombre: string } | null }
    | undefined

  if (!base) {
    console.log('  ✗ No hay ningún producto con stock > 0: sin eso esta prueba daría')
    console.log('    verde sin haber mirado nada. Cargá stock y volvé a correrla.\n')
    process.exit(1)
  }
  const esperada = Number(base.cantidad)
  console.log(`  item de prueba: ${base.productos_catalogo?.nombre} · el sistema dice ${esperada}\n`)

  /* ── Se arma el conteo ────────────────────────────────────────────────── */
  const { data: lista } = await sb
    .from('cnt_listas')
    .insert({ zona: 'ZZ verificación del ciego', punto_id: base.sucursal_id, descripcion: 'se borra al terminar' })
    .select('id')
    .single()
  const listaId = (lista as { id: string }).id

  const { data: item } = await sb
    .from('cnt_lista_items')
    .insert({
      lista_id: listaId,
      item_id: base.producto_id,
      sku: base.productos_catalogo?.sku ?? null,
      descripcion: base.productos_catalogo?.nombre ?? 'item',
      orden: 1,
    })
    .select('id')
    .single()
  const itemId = (item as { id: string }).id

  const { data: conteo } = await sb
    .from('cnt_conteos')
    .insert({ lista_id: listaId, punto_id: base.sucursal_id, estado: 'contando' })
    .select('id')
    .single()
  const conteoId = (conteo as { id: string }).id

  // Se cuenta un número DISTINTO del esperado a propósito: si contara lo mismo,
  // encontrar el número en el JSON no distinguiría la filtración de lo contado.
  const contada = esperada + 7
  await sb.from('cnt_renglones').insert({
    conteo_id: conteoId,
    lista_item_id: itemId,
    cantidad_contada: contada,
    contado_at: new Date().toISOString(),
  })

  /* ── 1 · el payload que sirve la pantalla ─────────────────────────────── */
  const payload = await payloadParaContar(sb, conteoId)
  const json = JSON.stringify(payload)

  caso(!!payload && payload.items.length === 1, 'el payload trae el item que hay que contar')
  caso(
    !/esperad|stock|sistema_dice|cantidad_esperada/i.test(json),
    'no hay ningún campo que hable de lo esperado',
    Object.keys(payload?.items[0] ?? {}).join(', '),
  )
  caso(
    !json.includes(`:${esperada}`) && !json.includes(`:${esperada},`),
    `el número que el sistema espera (${esperada}) no aparece en la respuesta`,
    json.length > 400 ? `${json.slice(0, 400)}…` : json,
  )
  caso(json.includes(String(contada)), `lo contado (${contada}) sí viaja, que es lo que hace falta`)

  /* ── 2 · y la base lo rechaza aunque alguien lo intente ───────────────── */
  const { error } = await sb
    .from('cnt_renglones')
    .update({ cantidad_esperada: esperada })
    .eq('conteo_id', conteoId)
  caso(!!error, 'la base rechaza escribir la esperada con el conteo abierto', error?.message ?? 'LA DEJÓ ESCRIBIR')

  /* ── 3 · la ruta no consulta el stock ─────────────────────────────────── */
  const { readFileSync } = await import('node:fs')
  const fuentes = [
    'app/api/conteo/conteos/[id]/route.ts',
    'app/(admin)/admin/operaciones/conteos/[id]/contar/page.tsx',
    'lib/conteo/payload.ts',
  ]
  for (const f of fuentes) {
    const src = readFileSync(f, 'utf8')
    // Se ignoran los comentarios: los tres archivos EXPLICAN por qué no leen el
    // stock, y buscar la palabra suelta daría rojo sobre la explicación.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    caso(
      !codigo.includes('stock_items') && !codigo.includes('cantidad_esperada'),
      `${f.split('/').pop()} no consulta el stock ni la esperada`,
    )
  }

  /* ── Limpieza ─────────────────────────────────────────────────────────── */
  await sb.from('cnt_renglones').delete().eq('conteo_id', conteoId)
  await sb.from('cnt_conteos').delete().eq('id', conteoId)
  await sb.from('cnt_lista_items').delete().eq('lista_id', listaId)
  await sb.from('cnt_listas').delete().eq('id', listaId)

  console.log(`\n${fallo ? 'HAY FILTRACIONES' : 'CIEGO: verificado sobre la respuesta real'}\n`)
  process.exit(fallo ? 1 : 0)
}

main()
