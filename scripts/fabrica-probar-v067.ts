/**
 * LOS SEIS PASOS DE v0.67, contra la base de producción.
 *
 * Uso: npx tsx scripts/fabrica-probar-v067.ts
 *
 * Prueba las tres cosas que el chat pidió en v0.66 y no existían: el pedido de
 * construcción, el vocabulario del negocio y la procedencia.
 *
 * Deja todo como estaba. Sale 1 si algún paso falla.
 */
import { anotarPedido, colaDeConstruccion } from '../lib/fabrica/pedidos'
import { conversar, type Turno } from '../lib/fabrica/chat'
import { createAdminClient } from '../lib/supabase/server'
import { escribirOverride } from '../lib/fabrica/escritor'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { historialDeCampo, procedenciaDe } from '../lib/fabrica/procedencia'
import { overridesActuales } from '../lib/fabrica/overrides'
// Se MIRA con `tituloGobernante`, que no compara ni registra: pasar un literal
// inventado como 'FALLBACK' lo dejaba en el log como una diferencia real.
import { tituloGobernante } from '../lib/fabrica/lector'
import { versionActual } from '../lib/fabrica/versiones'
import { abrirPrueba, cerrarPrueba } from './fabrica-marco-de-prueba'

// Antes de la primera escritura: lo que se escriba antes nace sin marca.
abrirPrueba()

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const POOL = 'stock'
const RUTA = '/admin/operaciones/inventarios'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

const hablar = (mensaje: string, historia: Turno[] = []) =>
  conversar({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    usuarioId: AUTOR,
    puedeProponer: true,
    historia,
    mensaje,
    conAdmin: true,
  })

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY.')
    process.exit(1)
  }
  const adm = createAdminClient()
  const antes = (await colaDeConstruccion({ conAdmin: true })).flatMap((g) => g.miembros)

  /* ── 1 · pedir algo que no existe ─────────────────────────────────── */
  const m1 =
    'Necesitaríamos que el sistema avise por WhatsApp al encargado cuando un inventario cierra con diferencias. Hoy se entera al otro día.'
  console.log(`\nPERSONA: ${m1}`)
  const r1 = await hablar(m1)
  console.log(`NORA: ${r1.texto}`)
  const ofrece = /anot|pedido de construcci/i.test(r1.texto)
  paso(1, ofrece && !r1.pedidoId, 'dijo que no existe y OFRECIÓ anotarlo, sin anotarlo todavía')

  /* ── 2 · aceptar → se crea el pedido ──────────────────────────────── */
  const historia: Turno[] = [
    { rol: 'usuario', texto: m1 },
    { rol: 'nora', texto: r1.texto },
  ]
  const m2 = 'Sí, dale, anotalo. Lo usaría el encargado de cada sucursal, son cuatro.'
  console.log(`\nPERSONA: ${m2}`)
  const r2 = await hablar(m2, historia)
  console.log(`NORA: ${r2.texto}`)

  const nuevos = (await colaDeConstruccion({ conAdmin: true }))
    .flatMap((g) => g.miembros)
    .filter((p) => !antes.some((a) => a.id === p.id))
  const pedido = nuevos.find((p) => p.id === r2.pedidoId)
  paso(2, !!pedido, `se creó el pedido con su clasificación${pedido ? '' : ' — NO se creó'}`)
  if (pedido) {
    console.log(`    pedido:   ${pedido.pedido}`)
    console.log(`    falta:    ${pedido.falta}`)
    console.log(`    contexto: ${pedido.contexto ?? '—'}`)
    console.log(`    turno:    ${pedido.turnoId ? 'atado a la conversación' : 'SIN atar'}`)
  }

  /* ── 3 · verlo en la cola con su clasificación ────────────────────── */
  const cola = await colaDeConstruccion({ conAdmin: true })
  const grupo = cola.find((g) => g.miembros.some((m) => m.id === pedido?.id))
  paso(
    3,
    !!grupo && cola.length > 0,
    `la cola tiene ${cola.length} grupo(s), ordenada por demanda`,
  )
  for (const g of cola) {
    console.log(
      `    ${String(g.veces).padStart(2)}× · ${g.proyectos.length} proy · ${g.cabeza.falta.padEnd(16)} ${g.cabeza.pedido.slice(0, 56)}`,
    )
  }

  /* ── 4 · renombrar con vocabulario del negocio ────────────────────── */
  const estado = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).find(
    (e) => e.clave === POOL,
  )!
  const previos = await overridesActuales(estado.instalacionId)
  const pieza = (await versionActual(POOL))!.manifiesto.pantallas.find((p) => p.ruta === RUTA)!
  const original = await tituloGobernante(POOL, RUTA)

  const r4 = await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: {
      ...previos?.overrides,
      vocabulario: { ...previos?.overrides.vocabulario, [RUTA]: 'Conteos de sucursal' },
    },
    motivo:
      'Vocabulario de este negocio: al inventario físico acá le dicen "conteo de sucursal". El término del oficio no se toca. Prueba de v0.67.',
    autorId: AUTOR,
  })
  const conVocabulario = await tituloGobernante(POOL, RUTA)
  const efectivo = (await versionActual(POOL))!
  const propios = await overridesActuales(estado.instalacionId)
  const { resolver } = await import('../lib/fabrica/overrides')
  const resuelto = resolver(efectivo.manifiesto, propios?.overrides ?? null).manifiesto.pantallas.find(
    (p) => p.ruta === RUTA,
  )!
  paso(
    4,
    r4.ok && conVocabulario === 'Conteos de sucursal' && resuelto.titulo_de_oficio === pieza.titulo,
    `la pantalla muestra "${conVocabulario}" y el término del oficio sigue siendo "${resuelto.titulo_de_oficio}"`,
  )

  /* ── 5 · preguntarle a NORA por el término viejo ──────────────────── */
  const m5 = `¿Qué pasó con la pantalla de ${pieza.titulo.toLowerCase()}? No la encuentro con ese nombre.`
  console.log(`\nPERSONA: ${m5}`)
  const r5 = await hablar(m5)
  console.log(`NORA: ${r5.texto}`)
  const entiendeAmbas =
    r5.texto.includes('Conteos de sucursal') && r5.texto.toLowerCase().includes('inventarios físicos'.toLowerCase().slice(0, 10))
  paso(5, entiendeAmbas, 'entendió el término del oficio y contestó con el nombre del negocio')

  /* ── 6 · quién decidió un campo cambiado, y por qué ───────────────── */
  const proc = await procedenciaDe(POOL, PROYECTO_SOCIAL_AHORRO)
  const deEste = proc.get(`pantallas.${RUTA}.vocabulario`)
  const hist = await historialDeCampo(
    'documentos',
    'pantallas./admin/finanzas/documentos/lote.titulo',
    PROYECTO_SOCIAL_AHORRO,
  )
  paso(
    6,
    !!deEste && hist.length > 1,
    `${RUTA} tiene procedencia, y documentos/lote tiene ${hist.length} decisiones registradas`,
  )
  if (deEste) {
    console.log(`    por qué:  ${deEste.motivo}`)
    console.log(`    nivel:    ${deEste.nivel} · ${deEste.decididoAt.slice(0, 16).replace('T', ' ')}`)
  }
  for (const h of hist.slice(0, 4)) {
    console.log(
      `    ${h.decididoAt.slice(0, 16).replace('T', ' ')} ${h.esReversion ? '[revert]' : '        '} ${JSON.stringify(h.valorAnterior)} → ${JSON.stringify(h.valorNuevo)}`,
    )
  }

  /* ── Se deja todo como estaba ─────────────────────────────────────── */
  await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: { ...previos?.overrides },
    motivo: 'Fin de la prueba de v0.67: se saca el vocabulario de prueba.',
    autorId: AUTOR,
  })
  const alFinal = await tituloGobernante(POOL, RUTA)
  console.log(`\nla pantalla volvió a "${alFinal}"${alFinal === original ? '' : ' ✗ NO VOLVIÓ'}`)
  if (alFinal !== original) fallo = true

  if (pedido) {
    await adm.from('fab_pedidos_construccion').delete().eq('id', pedido.id)
    console.log('el pedido de prueba se borró de la cola')
  }

  await cerrarPrueba()
  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
