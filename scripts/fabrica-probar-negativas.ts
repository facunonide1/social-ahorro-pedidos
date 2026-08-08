/**
 * LAS CUATRO NEGATIVAS, probadas textualmente.
 *
 * Uso: npx tsx scripts/fabrica-probar-negativas.ts
 *
 * Dos capas, a propósito:
 *
 *   CAPA 1 · el código. `porQueNo()` decide sin modelo. Es determinista y es
 *            donde vive la garantía: acá se afirma que cada caso da el motivo
 *            correcto, y si falla, sale 1.
 *   CAPA 2 · el chat de verdad, con el modelo, sobre la base de producción. Se
 *            afirma lo único afirmable sin leer la mente del modelo: que NO
 *            dejó ninguna propuesta en la cola. El texto se imprime entero para
 *            leerlo, porque un "no" que técnicamente es un no pero suena a
 *            "quizás después" sigue siendo una promesa.
 *
 * No crea nada. Si alguna de las cuatro deja una propuesta, es un fallo.
 */
import { conversar } from '../lib/fabrica/chat'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { porQueNo, type MotivoNegativa } from '../lib/fabrica/negativas'
import { overridesActuales, resolver } from '../lib/fabrica/overrides'
import { versionActual } from '../lib/fabrica/versiones'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

interface Caso {
  motivo: MotivoNegativa
  titulo: string
  /** Lo que escribiría una persona. */
  mensaje: string
  /** El mismo pedido, ya traducido a un override, para la capa determinista. */
  pedido: { clave: string; campos: string[]; rutas?: string[]; configurables?: string[] }
}

const CASOS: Caso[] = [
  {
    motivo: 'constitucional',
    titulo: 'Toca la constitución',
    mensaje:
      'En finanzas, subí el umbral de aprobación de pagos a un millón: pedir segunda firma por montos chicos nos traba todo.',
    // Finanzas además está APAGADO, así que este caso prueba de paso el orden:
    // gana la constitución, no "el proyecto no está listo". Si ganara lo
    // segundo, la persona entendería que prendiendo un flag lo consigue.
    pedido: { clave: 'finanzas', campos: ['configurable'], configurables: ['umbral_aprobacion_pago'] },
  },
  {
    motivo: 'no_existe',
    titulo: 'Necesita algo que no existe',
    mensaje:
      'Quiero una pantalla de rentabilidad por vendedor dentro de documentos, con ranking mensual.',
    pedido: {
      clave: 'documentos',
      campos: ['titulos'],
      rutas: ['/admin/finanzas/documentos/rentabilidad-por-vendedor'],
    },
  },
  {
    motivo: 'fuera_del_lector',
    titulo: 'Está fuera de lo que el lector gobierna',
    mensaje:
      'Que el asistente de documentos extraiga y confirme solo los comprobantes, sin que nadie los revise.',
    pedido: { clave: 'documentos', campos: ['agentes'] },
  },
  {
    motivo: 'proyecto_no_listo',
    titulo: 'El proyecto no está listo',
    mensaje:
      'En finanzas, la pantalla de caja debería llamarse "Cierre de caja" en vez de como se llama hoy.',
    pedido: { clave: 'finanzas', campos: ['titulos'], rutas: ['/admin/finanzas/caja'] },
  },
]

let fallo = false
function afirmar(ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`  ${ok ? '✓' : '✗'} ${texto}`)
}

async function main() {
  const estados = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })

  console.log('\n═══ CAPA 1 · el código decide, sin modelo ═══')
  for (const c of CASOS) {
    const estado = estados.find((e) => e.clave === c.pedido.clave)
    const version = await versionActual(c.pedido.clave)
    const propios = estado ? await overridesActuales(estado.instalacionId) : null
    const manifiesto = version
      ? resolver(version.manifiesto, propios?.overrides ?? null).manifiesto
      : null

    const r = porQueNo(c.pedido, manifiesto, estado)
    console.log(`\n${c.titulo}`)
    afirmar(r?.motivo === c.motivo, `motivo: ${r?.motivo ?? 'ninguno (dejó pasar)'} — esperado ${c.motivo}`)
    if (r) {
      console.log(`    dice:   ${r.texto}`)
      console.log(`    ofrece: ${r.salida}`)
      afirmar(!!r.salida, 'ofrece una salida: nunca dice que no a secas')
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠ Sin ANTHROPIC_API_KEY: no se puede probar la capa 2.')
    process.exit(fallo ? 1 : 0)
  }

  console.log('\n\n═══ CAPA 2 · el chat de verdad, sobre la base de producción ═══')
  for (const c of CASOS) {
    console.log(`\n─── ${c.titulo} ───`)
    console.log(`PERSONA: ${c.mensaje}\n`)
    const r = await conversar({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      usuarioId: AUTOR,
      puedeProponer: true,
      historia: [],
      mensaje: c.mensaje,
      conAdmin: true,
    })
    console.log(`NORA: ${r.texto}\n`)
    afirmar(!r.propuestaId, 'no dejó ninguna propuesta en la cola')
  }

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
