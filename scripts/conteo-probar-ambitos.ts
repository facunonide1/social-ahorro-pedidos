/**
 * LOS TRES ÁMBITOS, SOBRE LA MISMA LISTA FÍSICA.
 *
 * Uso: npx tsx scripts/conteo-probar-ambitos.ts
 *
 * ── QUÉ PRUEBA, Y POR QUÉ ASÍ ───────────────────────────────────────────────
 *
 * Se cuenta EXACTAMENTE LO MISMO tres veces —los mismos items, las mismas
 * cantidades contadas— cambiando sólo contra qué se compara. Si el ámbito
 * manda, las tres diferencias tienen que dar distinto; si diera lo mismo, el
 * ámbito sería decorativo y nadie se enteraría hasta que alguien persiguiera un
 * faltante inventado.
 *
 * Los items se eligen con góndola ≠ depósito ≠ total. Sobre un producto donde
 * los tres números coinciden, esta prueba daría verde sin haber probado nada:
 * es la pregunta 2 —cero porque está bien, o cero porque no había qué mirar.
 *
 * Borra todo lo que crea. Sale 1 si algo falla.
 */
import { createClient } from '@supabase/supabase-js'

import { aplicar } from '../lib/conteo/importar'
import { cerrarConteo } from '../lib/conteo/cerrar'
import { AMBITOS, AMBITO_TEXTO, type Ambito } from '../lib/conteo/esperado'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const MARCA = 'ZZ ámbitos'

let fallo = false
function caso(ok: boolean, texto: string, detalle = '') {
  if (!ok) fallo = true
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`)
  if (detalle) console.log(`      ${detalle}`)
}

async function main() {
  console.log('\n═══ LOS TRES ÁMBITOS SOBRE LA MISMA LISTA ═══\n')

  /* ── Items donde los tres números son distintos ───────────────────────── */
  const { data } = await sb
    .from('stock_items')
    .select('producto_id, sucursal_id, cantidad, cantidad_gondola, cantidad_deposito, productos_catalogo(sku, nombre)')
    .gt('cantidad_gondola', 0)
    .gt('cantidad_deposito', 0)
    .limit(200)

  const candidatos = ((data ?? []) as unknown as {
    producto_id: string
    sucursal_id: string
    cantidad: number
    cantidad_gondola: number
    cantidad_deposito: number
    productos_catalogo: { sku: string; nombre: string } | null
  }[]).filter(
    (r) =>
      r.productos_catalogo?.sku &&
      Number(r.cantidad_gondola) !== Number(r.cantidad_deposito) &&
      Number(r.cantidad) !== Number(r.cantidad_gondola),
  )

  if (candidatos.length === 0) {
    console.log('  ✗ No hay ningún producto con góndola, depósito y total distintos.')
    console.log('    Sin eso, los tres ámbitos darían el mismo número y la prueba')
    console.log('    daría verde sin haber probado nada.\n')
    process.exit(1)
  }

  const punto = candidatos[0].sucursal_id
  const items = candidatos.filter((c) => c.sucursal_id === punto).slice(0, 3)
  const { data: suc } = await sb.from('sucursales').select('nombre').eq('id', punto).maybeSingle()

  console.log(`  punto: ${(suc as { nombre: string } | null)?.nombre}`)
  for (const i of items) {
    console.log(
      `  ${i.productos_catalogo!.sku} ${i.productos_catalogo!.nombre}: góndola ${i.cantidad_gondola} · depósito ${i.cantidad_deposito} · total ${i.cantidad}`,
    )
  }

  // Lo mismo contado en los tres casos. Un número fijo y distinto de los tres
  // esperados, para que ninguna diferencia dé cero por casualidad.
  const CONTADO = 7
  console.log(`\n  en los tres casos se cuenta ${CONTADO} de cada uno\n`)

  const filas = items.map((i, n) => ({
    sku: i.productos_catalogo!.sku,
    descripcion: i.productos_catalogo!.nombre,
    unidad: null,
    orden: n + 1,
  }))

  const resultados: Record<string, { esperadas: number[]; valor: number; conDif: number }> = {}
  const listas: string[] = []

  for (const ambito of AMBITOS) {
    const r = await aplicar({
      zona: `${MARCA} · ${ambito}`,
      puntoId: punto,
      descripcion: 'se borra al terminar',
      ambito,
      filas,
      autorId: AUTOR,
    })
    if (!r.ok) {
      caso(false, `no se pudo crear la lista de ${ambito}`, r.error)
      continue
    }
    listas.push(r.listaId)

    const { data: c } = await sb
      .from('cnt_conteos')
      .insert({ lista_id: r.listaId, punto_id: punto, contado_por: AUTOR, estado: 'contando', created_by: AUTOR })
      .select('id')
      .single()
    const conteoId = (c as { id: string }).id

    const { data: li } = await sb.from('cnt_lista_items').select('id, sku').eq('lista_id', r.listaId)
    for (const it of (li ?? []) as { id: string; sku: string }[]) {
      await sb.from('cnt_renglones').insert({
        conteo_id: conteoId,
        lista_item_id: it.id,
        cantidad_contada: CONTADO,
        contado_at: new Date().toISOString(),
      })
    }

    const cierre = await cerrarConteo(conteoId, AUTOR)
    if (!cierre.ok) {
      caso(false, `no se pudo cerrar el conteo de ${ambito}`, cierre.error)
      continue
    }
    resultados[ambito] = {
      esperadas: cierre.resultado.renglones.map((x) => Number(x.esperada)).sort((a, b) => a - b),
      valor: cierre.resultado.valorDiferencia,
      conDif: cierre.resultado.conDiferencia,
    }
  }

  /* ── Lo que tiene que pasar ───────────────────────────────────────────── */
  console.log('')
  const porAmbito = (a: Ambito, campo: 'cantidad_gondola' | 'cantidad_deposito' | 'cantidad') =>
    items.map((i) => Number(i[campo])).sort((x, y) => x - y)

  caso(
    JSON.stringify(resultados.gondola?.esperadas) === JSON.stringify(porAmbito('gondola', 'cantidad_gondola')),
    'góndola se compara contra la góndola',
    `esperadas ${JSON.stringify(resultados.gondola?.esperadas)} · góndola real ${JSON.stringify(porAmbito('gondola', 'cantidad_gondola'))}`,
  )
  caso(
    JSON.stringify(resultados.deposito?.esperadas) === JSON.stringify(porAmbito('deposito', 'cantidad_deposito')),
    'depósito se compara contra el depósito',
    `esperadas ${JSON.stringify(resultados.deposito?.esperadas)} · depósito real ${JSON.stringify(porAmbito('deposito', 'cantidad_deposito'))}`,
  )
  caso(
    JSON.stringify(resultados.total?.esperadas) === JSON.stringify(porAmbito('total', 'cantidad')),
    'total se compara contra el total del punto',
    `esperadas ${JSON.stringify(resultados.total?.esperadas)} · total real ${JSON.stringify(porAmbito('total', 'cantidad'))}`,
  )

  // Y el que prueba que el ámbito NO es decorativo: las tres tienen que dar
  // distinto sobre lo mismo contado.
  const valores = AMBITOS.map((a) => resultados[a]?.valor)
  caso(
    new Set(valores).size === AMBITOS.length,
    'contando lo mismo, los tres ámbitos dan diferencias distintas',
    AMBITOS.map((a) => `${AMBITO_TEXTO[a].corto}: $${Math.abs(valores[AMBITOS.indexOf(a)] ?? 0).toLocaleString('es-AR')}`).join(' · '),
  )

  // El faltante inventado, mostrado con números: contar la góndola y compararla
  // contra el total infla el faltante en todo lo que hay en depósito.
  const gond = Math.abs(resultados.gondola?.valor ?? 0)
  const tot = Math.abs(resultados.total?.valor ?? 0)
  caso(
    tot > gond,
    'comparar una góndola contra el total infla el faltante',
    `contra góndola: $${gond.toLocaleString('es-AR')} · contra el total: $${tot.toLocaleString('es-AR')} — la diferencia es lo que está en el depósito`,
  )

  /* ── Limpieza ─────────────────────────────────────────────────────────── */
  for (const listaId of listas) {
    const { data: cs } = await sb.from('cnt_conteos').select('id').eq('lista_id', listaId)
    const ids = ((cs ?? []) as { id: string }[]).map((x) => x.id)
    if (ids.length > 0) {
      await sb.from('tareas').delete().eq('entidad_relacionada', 'conteo').in('entidad_id', ids)
      await sb.from('cnt_renglones').delete().in('conteo_id', ids)
      await sb.from('cnt_conteos').delete().in('id', ids)
    }
    await sb.from('cnt_lista_items').delete().eq('lista_id', listaId)
    await sb.from('cnt_listas').delete().eq('id', listaId)
  }
  await sb.from('irregularidades_stock').delete().like('nota', `Conteo de zona «${MARCA}%`)

  const { count } = await sb
    .from('cnt_listas')
    .select('id', { count: 'exact', head: true })
    .like('zona', `${MARCA}%`)
  caso(count === 0, 'no quedó nada de la prueba')

  console.log(`\n${fallo ? 'ALGO FALLÓ' : 'LOS TRES ÁMBITOS: verificados sobre la misma lista'}\n`)
  process.exit(fallo ? 1 : 0)
}

main()
