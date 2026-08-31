/**
 * LA CONTRAPRUEBA DEL PAGINADO.
 *
 * ── POR QUÉ NO ALCANZA CON QUE "ANDE" ───────────────────────────────────────
 *
 * Una prueba que pasa con la tabla vacía no prueba nada: `paginar` sobre cero
 * filas devuelve cero, y una consulta rota también. Es la misma contraprueba
 * que aprendió la fábrica — hay que verificar que da DISTINTO de cero cuando sí
 * hay, y que ese número coincide con el que dice la base.
 *
 * ── POR QUÉ NO SE GENERAN DATOS DE PRUEBA ───────────────────────────────────
 *
 * No hace falta: ya hay tablas reales por encima de las mil filas —46.129
 * productos, 598.117 filas de ventas mensuales, 49.339 códigos de barras—. Y
 * generar filas para probar tiene un costo que ya se pagó dos veces en este
 * proyecto: artefactos de prueba que quedaron en la base y alguien contó como
 * reales. Si no hace falta ensuciar, no se ensucia.
 *
 *   npx tsx scripts/probar-paginado.ts
 */

import { createClient } from '@supabase/supabase-js'

import { paginar } from '../lib/supabase/paginar'
import { catalogoCompleto, indicePorCodigoBarras } from '../lib/catalogo/indice'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

let fallos = 0

function comprobar(nombre: string, obtenido: number, esperado: number) {
  const ok = obtenido === esperado
  if (!ok) fallos++
  const marca = ok ? 'ok  ' : 'MAL '
  console.log(`  ${marca} ${nombre.padEnd(44)} ${obtenido.toLocaleString('es-AR')} / ${esperado.toLocaleString('es-AR')}`)
}

async function contarEnLaBase(tabla: string, filtros?: (q: any) => any): Promise<number> {
  let q = adm.from(tabla).select('*', { count: 'exact', head: true })
  if (filtros) q = filtros(q)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

async function main() {
  console.log('CONTRAPRUEBA DEL PAGINADO — sobre tablas que YA pasan las 1000 filas\n')

  // 1 · Una tabla con 46.129 filas. Sin paginar, esto daria 1000.
  const totalCat = await contarEnLaBase('productos_catalogo')
  if (totalCat <= 1000) throw new Error(`productos_catalogo tiene ${totalCat} filas: la prueba no probaria nada`)
  const { filas: todos } = await paginar<{ id: string }>(
    adm.from('productos_catalogo').select('id').order('sku'), { maximo: 200_000 })
  comprobar('paginar() sobre productos_catalogo', todos.length, totalCat)

  // 2 · Y que no se repitan ni se pierdan filas entre paginas.
  comprobar('sin ids repetidos entre paginas', new Set(todos.map((x) => x.id)).size, totalCat)

  // 3 · El helper del catalogo, con sus filtros.
  const activosReales = await contarEnLaBase('productos_catalogo',
    (q) => q.eq('activo', true).eq('es_demo', false))
  const cat = await catalogoCompleto(adm)
  comprobar('catalogoCompleto()', cat.length, activosReales)

  // 4 · Codigos de barras: 49.339 filas.
  const totalBarras = await contarEnLaBase('producto_codigos_barras')
  const idx = await indicePorCodigoBarras(adm)
  console.log(`  info producto_codigos_barras: ${totalBarras.toLocaleString('es-AR')} filas -> ${idx.size.toLocaleString('es-AR')} codigos distintos`)
  if (idx.size <= 1000) { fallos++; console.log('  MAL  el indice de barras quedo en el techo de 1000') }

  // 5 · La tabla mas grande: 598.117 filas.
  const totalVentas = await contarEnLaBase('producto_ventas_mensuales')
  const { filas: ventas, truncado } = await paginar<{ periodo: string }>(
    adm.from('producto_ventas_mensuales').select('periodo').order('producto_id'), { maximo: 700_000 })
  comprobar('paginar() sobre 598.117 filas', ventas.length, totalVentas)
  if (truncado) { fallos++; console.log('  MAL  se alcanzo el tope: hay mas filas de las que se trajeron') }

  // 6 · El tope se respeta Y se avisa.
  const { filas: pocas, truncado: aviso } = await paginar<{ id: string }>(
    adm.from('productos_catalogo').select('id').order('sku'), { maximo: 2000 })
  comprobar('el tope corta donde dice', pocas.length, 2000)
  if (!aviso) { fallos++; console.log('  MAL  corto en el tope y NO aviso: es el error que veniamos a arreglar') }
  else console.log('  ok   corto en el tope y aviso (truncado = true)')

  console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLO(S)`}`)
  process.exit(fallos === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FALLO:', e.message ?? e); process.exit(1) })
