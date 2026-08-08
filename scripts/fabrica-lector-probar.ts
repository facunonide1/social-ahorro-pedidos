/**
 * Prueba del lector de punta a punta, sin navegador.
 *
 * Recorre los tres estados sobre un pool y verifica lo único que importa en
 * esta sesión: que con el flag apagado todo sea exactamente lo de hoy, que en
 * sombra no gobierne nada, y que prendido devuelva la declaración sin cambiar
 * lo que la persona ve.
 *
 * Uso: npx tsx scripts/fabrica-lector-probar.ts [pool]
 * Deja el pool en el estado en que lo encontró.
 */
import { createClient } from '@supabase/supabase-js'
import { compararEnSombra, obtenerDefinicion } from '../lib/fabrica/lector'
import { tituloDePantalla } from '../lib/os/definicion'
import { PROYECTO_SOCIAL_AHORRO, type EstadoLector } from '../lib/fabrica/flag'

const POOL = process.argv[2] ?? 'documentos'

/** Las pantallas cableadas, con el título que el código usaría. */
const CABLEADAS: Record<string, [string, string][]> = {
  documentos: [
    ['/admin/finanzas/documentos', 'Documentos a pagar'],
    ['/admin/finanzas/documentos/lote', 'Cargar facturas en lote'],
    ['/admin/finanzas/documentos/revision/[id]', 'Revisar documento'],
  ],
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function poner(estado: EstadoLector) {
  const { data: pool } = await sb.from('fab_pools').select('id').eq('clave', POOL).single()
  await sb
    .from('fab_instalaciones')
    .update({ lector: estado })
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('pool_id', pool!.id)
}

async function estadoActual(): Promise<EstadoLector> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', POOL)
    .maybeSingle()
  return ((data as unknown as { lector: EstadoLector } | null)?.lector) ?? 'apagado'
}

async function titulos(): Promise<[string, string, string][]> {
  const out: [string, string, string][] = []
  for (const [ruta, enCodigo] of CABLEADAS[POOL] ?? []) {
    out.push([ruta, enCodigo, await tituloDePantalla(POOL, ruta, enCodigo)])
  }
  return out
}

async function main() {
  const original = await estadoActual()
  let fallo = false
  console.log(`\nPool: ${POOL} · estado al empezar: ${original}\n`)

  /* ── apagado ─────────────────────────────────────────────────────── */
  await poner('apagado')
  console.log('── APAGADO · tiene que ser exactamente lo de hoy ────────')
  for (const [ruta, enCodigo, devuelto] of await titulos()) {
    const ok = devuelto === enCodigo
    if (!ok) fallo = true
    console.log(`  ${ok ? '✓' : '✗'} ${ruta} → "${devuelto}"`)
  }
  const defApagado = await obtenerDefinicion(POOL, 'pantallas')
  if (defApagado !== null) fallo = true
  console.log(`  ${defApagado === null ? '✓' : '✗'} el lector no devuelve definición`)

  /* ── sombra ──────────────────────────────────────────────────────── */
  await poner('sombra')
  console.log('\n── SOMBRA · compara pero no gobierna ────────────────────')
  const antes = await contarEventos()
  for (const [ruta, enCodigo] of CABLEADAS[POOL] ?? []) {
    await compararEnSombra(POOL, ruta, enCodigo)
  }
  for (const [ruta, enCodigo, devuelto] of await titulos()) {
    const ok = devuelto === enCodigo
    if (!ok) fallo = true
    console.log(`  ${ok ? '✓' : '✗'} ${ruta} sigue mostrando "${devuelto}"`)
  }
  const despues = await contarEventos()
  const nuevas = despues.diferencias - antes.diferencias
  if (nuevas > 0) fallo = true
  console.log(`  ${nuevas === 0 ? '✓' : '✗'} diferencias nuevas: ${nuevas}`)

  /* ── prendido ────────────────────────────────────────────────────── */
  await poner('prendido')
  console.log('\n── PRENDIDO · gobierna la declaración ───────────────────')
  for (const [ruta, enCodigo, devuelto] of await titulos()) {
    const igual = devuelto === enCodigo
    if (!igual) fallo = true
    console.log(
      `  ${igual ? '✓' : '✗'} ${ruta} → "${devuelto}"` +
        (igual ? ' (idéntico al código)' : ` ✗ el código decía "${enCodigo}"`),
    )
  }
  const defPrendido = await obtenerDefinicion(POOL, 'pantallas')
  const gobierna = defPrendido !== null
  if (!gobierna) fallo = true
  console.log(
    `  ${gobierna ? '✓' : '✗'} el lector devuelve la declaración ` +
      `(${Object.keys((defPrendido as { titulos?: object })?.titulos ?? {}).length} títulos)`,
  )

  /* ── reversión en caliente ───────────────────────────────────────── */
  console.log('\n── REVERSIÓN EN CALIENTE · sin deploy ───────────────────')
  await poner('apagado')
  const trasApagar = await obtenerDefinicion(POOL, 'pantallas')
  const revirtio = trasApagar === null
  if (!revirtio) fallo = true
  console.log(`  ${revirtio ? '✓' : '✗'} apagado: vuelve al código en la request siguiente`)
  await poner('prendido')
  const trasPrender = await obtenerDefinicion(POOL, 'pantallas')
  if (trasPrender === null) fallo = true
  console.log(`  ${trasPrender !== null ? '✓' : '✗'} prendido de nuevo: vuelve a gobernar`)

  const fallbacks = (await contarEventos()).fallbacks
  console.log(`\n  fallbacks registrados en todo el recorrido: ${fallbacks}`)

  await poner(original)
  console.log(`\nEstado restaurado a: ${original}\n`)
  process.exit(fallo ? 1 : 0)
}

async function contarEventos(): Promise<{ diferencias: number; fallbacks: number }> {
  const { data } = await sb
    .from('fab_lector_eventos')
    .select('tipo')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('pool_clave', POOL)
  const filas = (data ?? []) as { tipo: string }[]
  return {
    diferencias: filas.filter((f) => f.tipo === 'diferencia').length,
    fallbacks: filas.filter((f) => f.tipo === 'fallback').length,
  }
}

main()
