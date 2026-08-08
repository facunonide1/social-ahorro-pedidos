/**
 * La prueba que justifica la sesión: dos proyectos, la misma pieza.
 *
 * Crea un proyecto de prueba VACÍO —sólo el registro, sin datos ni usuarios—,
 * le instala el pool de documentos y verifica que lo de cada uno sea suyo.
 * Después lo borra.
 *
 * Es la primera vez que la fábrica se ejercita como multiproyecto. Hasta ahora
 * todo lo que decía sobre "compartir una pieza" era una afirmación sin probar.
 *
 * Uso: npx tsx scripts/fabrica-probar-multiproyecto.ts
 */
import { createClient } from '@supabase/supabase-js'
import { escribirOverride, escribirVersion } from '../lib/fabrica/escritor'
import { overridesActuales, resolver } from '../lib/fabrica/overrides'
import { versionActual } from '../lib/fabrica/versiones'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const POOL = 'documentos'
const RUTA = '/admin/finanzas/documentos'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const SLUG_PRUEBA = 'prueba-multiproyecto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function tituloEfectivo(proyectoId: string): Promise<string | undefined> {
  const v = await versionActual(POOL)
  const { data } = await sb
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .eq('fab_pools.clave', POOL)
    .maybeSingle()
  const inst = (data as unknown as { id: string } | null)?.id
  const propios = inst ? await overridesActuales(inst) : null
  const { manifiesto } = resolver(v!.manifiesto, propios?.overrides ?? null)
  return manifiesto.pantallas.find((p) => p.ruta === RUTA)?.titulo
}

async function main() {
  /* ── preparar el proyecto de prueba ─────────────────────────────── */
  await sb.from('fab_proyectos').delete().eq('slug', SLUG_PRUEBA)
  const { data: nuevo, error: e1 } = await sb
    .from('fab_proyectos')
    .insert({
      nombre: 'Proyecto de prueba',
      slug: SLUG_PRUEBA,
      rubro: 'prueba',
      descripcion: 'Registro vacío para verificar aislamiento entre proyectos. Se borra al terminar.',
      estado: 'alta',
    })
    .select('id')
    .single()
  if (e1 || !nuevo) {
    console.error('No se pudo crear el proyecto de prueba:', e1?.message)
    process.exit(1)
  }
  const PRUEBA = (nuevo as { id: string }).id

  const { data: pool } = await sb.from('fab_pools').select('id').eq('clave', POOL).single()
  const version = await versionActual(POOL)
  await sb.from('fab_instalaciones').insert({
    proyecto_id: PRUEBA,
    pool_id: (pool as { id: string }).id,
    version_id: version!.id,
    estado: 'activa',
    lector: 'prendido',
    notas: 'Instalación de prueba de aislamiento.',
  })

  const enLaPieza = version!.manifiesto.pantallas.find((p) => p.ruta === RUTA)?.titulo
  console.log(`\nPieza compartida: "${enLaPieza}"`)
  console.log(`Social Ahorro:    "${await tituloEfectivo(PROYECTO_SOCIAL_AHORRO)}"`)
  console.log(`Prueba (sin override): "${await tituloEfectivo(PRUEBA)}"`)

  /* ── 1 · cambiar el título en el proyecto de prueba ──────────────── */
  const antesEnSA = await tituloEfectivo(PROYECTO_SOCIAL_AHORRO)
  const r1 = await escribirOverride({
    proyectoId: PRUEBA,
    clave: POOL,
    overrides: { titulos: { [RUTA]: 'Comprobantes por pagar' } },
    motivo: 'Prueba de aislamiento: este negocio les dice comprobantes.',
    autorId: AUTOR,
  })
  const enPrueba = await tituloEfectivo(PRUEBA)
  paso(1, r1.ok && enPrueba === 'Comprobantes por pagar', `el proyecto de prueba ahora dice "${enPrueba}"`)

  /* ── 2 · Social Ahorro NO cambió ─────────────────────────────────── */
  const despuesEnSA = await tituloEfectivo(PROYECTO_SOCIAL_AHORRO)
  paso(
    2,
    despuesEnSA === antesEnSA && despuesEnSA === 'Documentos a pagar',
    `Social Ahorro sigue diciendo "${despuesEnSA}" — no se contagió`,
  )

  /* ── 3 · cambiar algo de la PIEZA ────────────────────────────────── */
  const m = JSON.parse(JSON.stringify(version!.manifiesto))
  m.descripcion = 'DESCRIPCIÓN COMPARTIDA DE PRUEBA'
  const r3 = await escribirVersion({
    clave: POOL,
    manifiesto: m,
    motivo: 'Prueba de aislamiento: un cambio de la pieza tiene que verse en los dos.',
    autorId: AUTOR,
    gobernando: true,
  })
  paso(3, r3.ok, `se cambió la descripción de la pieza (versión ${r3.numero})`)

  /* ── 4 · se ve en los dos ────────────────────────────────────────── */
  const vNueva = await versionActual(POOL)
  const resueltos = await Promise.all(
    [PROYECTO_SOCIAL_AHORRO, PRUEBA].map(async (p) => {
      const { data } = await sb
        .from('fab_instalaciones')
        .select('id, pool:fab_pools!inner(clave)')
        .eq('proyecto_id', p)
        .eq('fab_pools.clave', POOL)
        .maybeSingle()
      const inst = (data as unknown as { id: string } | null)?.id
      const propios = inst ? await overridesActuales(inst) : null
      return resolver(vNueva!.manifiesto, propios?.overrides ?? null).manifiesto
    }),
  )
  const losDos = resueltos.every((x) => x.descripcion === 'DESCRIPCIÓN COMPARTIDA DE PRUEBA')
  const titulosSiguenPropios =
    resueltos[0].pantallas.find((p) => p.ruta === RUTA)?.titulo === 'Documentos a pagar' &&
    resueltos[1].pantallas.find((p) => p.ruta === RUTA)?.titulo === 'Comprobantes por pagar'
  paso(
    4,
    losDos && titulosSiguenPropios,
    'el cambio de la pieza llegó a los dos, y cada uno conservó su título',
  )

  /* ── limpieza: dejar la pieza como estaba ────────────────────────── */
  await escribirVersion({
    clave: POOL,
    manifiesto: version!.manifiesto,
    motivo: 'Fin de la prueba de aislamiento: la pieza vuelve a su descripción.',
    autorId: AUTOR,
    gobernando: true,
  })

  /* ── 5 · borrar el proyecto de prueba ────────────────────────────── */
  const { error: e5 } = await sb.from('fab_proyectos').delete().eq('id', PRUEBA)
  const { count } = await sb
    .from('fab_instalaciones')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
  const saIntacto = (await tituloEfectivo(PROYECTO_SOCIAL_AHORRO)) === 'Documentos a pagar'
  paso(
    5,
    !e5 && saIntacto && (count ?? 0) === 10,
    `proyecto de prueba borrado · Social Ahorro intacto: ${count} instalaciones y sigue diciendo "Documentos a pagar"`,
  )

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
