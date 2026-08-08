/**
 * Siembra la cola de construcción con los pedidos que aparecieron DE VERDAD en
 * las corridas de v0.66.
 *
 * Uso: npx tsx scripts/fabrica-sembrar-pedidos.ts
 *
 * NO INVENTA NINGUNO. Los cuatro salieron de conversaciones registradas en
 * fab_chat_turnos, y cada uno apunta al turno del que salió: se puede volver a
 * leer la conversación entera si el resumen no alcanza.
 *
 * Es idempotente: si ya está sembrado, no duplica.
 */
import { anotarPedido, colaDeConstruccion, type QueFalta } from '../lib/fabrica/pedidos'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

interface Semilla {
  pedido: string
  contexto: string
  falta: QueFalta
  pool: string
  seParece?: string
  /** El turno de fab_chat_turnos del que salió. */
  turnoId: string
}

const SEMILLAS: Semilla[] = [
  {
    pedido: 'Una pantalla de rentabilidad por vendedor dentro de documentos, con ranking mensual.',
    contexto:
      'NORA contestó que no existe y ofreció anotarlo. Preguntó dos cosas que quedaron sin responder y que hacen falta para que el pedido sirva: qué se entiende por "vendedor" (¿el proveedor, el usuario que cargó, otra cosa?) y contra qué dato se calcularía la rentabilidad. Además avisó que "rentabilidad" roza doc_precios_historial, que está bajo autoridad de precio.',
    falta: 'molde',
    pool: 'documentos',
    turnoId: '89da8dca-8684-425d-9b22-e9695dce16af',
  },
  {
    pedido:
      'Revisión por excepción: que sólo frene a revisar lo que está por debajo de cierta confianza, en vez de documento por documento.',
    contexto:
      'Salió tres veces, siempre como alternativa cuando alguien pidió sacar la revisión humana —que es constitucional y no se puede—. El problema real que se describe es el volumen de comprobantes a revisar. NORA lo ofreció explícitamente como pedido y aclaró que no promete que se construya.',
    falta: 'comportamiento',
    pool: 'documentos',
    seParece: 'umbral_confianza_auto, que ya está declarado pero no se lee',
    turnoId: '8e5f163d-5ad2-4471-bbf0-ed1bc52c9af7',
  },
  {
    pedido:
      'Que el sistema lea de verdad umbral_confianza_auto: hoy está declarado en documentos y el código lo ignora.',
    contexto:
      'NORA lo dijo en cada conversación sobre documentos: "está declarado pero el sistema no lo lee. Queda escrito en la declaración y no cambia nada en pantalla ni en el comportamiento". Es la brecha entre declarar y gobernar, con nombre propio.',
    falta: 'capacidad_lector',
    pool: 'documentos',
    turnoId: '8e5f163d-5ad2-4471-bbf0-ed1bc52c9af7',
  },
  {
    pedido: 'Que los repositores puedan ver los documentos a pagar; hoy no les aparece.',
    contexto:
      'NORA no pudo: los permisos no se leen de la declaración, y además users_admin.rol y users_admin.permisos_custom están en los intocables de Configuración. Quedó sin responder si los repositores tienen permiso y no les figura en el menú, o directamente no tienen permiso: son problemas distintos.',
    falta: 'capacidad_lector',
    pool: 'documentos',
    turnoId: '8b156b8b-ff10-44f8-af57-117690aa0885',
  },
]

async function main() {
  const yaHay = (await colaDeConstruccion({ conAdmin: true })).flatMap((g) => g.miembros)
  let nuevos = 0

  for (const s of SEMILLAS) {
    if (yaHay.some((p) => p.pedido === s.pedido)) {
      console.log(`  = ya estaba: ${s.pedido.slice(0, 64)}…`)
      continue
    }
    const r = await anotarPedido({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      poolClave: s.pool,
      pedido: s.pedido,
      contexto: s.contexto,
      falta: s.falta,
      seParece: s.seParece,
      turnoId: s.turnoId,
      autorId: AUTOR,
    })
    if (!r.ok) {
      console.error(`  ✗ ${r.error}`)
      process.exit(1)
    }
    nuevos++
    console.log(`  + [${s.falta}] ${s.pedido.slice(0, 64)}…`)
    if (r.parecidos?.length) {
      console.log(`      ${r.parecidos.length} parecido(s) sugerido(s), sin juntar`)
    }
  }

  console.log(`\n${nuevos} pedido(s) nuevo(s). La cola:\n`)
  for (const g of await colaDeConstruccion({ conAdmin: true })) {
    console.log(
      `  ${String(g.veces).padStart(2)}× · ${g.proyectos.length} proy · ${g.cabeza.falta.padEnd(16)} ${g.cabeza.pedido.slice(0, 62)}`,
    )
  }
  console.log('')
}

main()
