/**
 * Prueba de que el validador RECHAZA lo que tiene que rechazar.
 *
 * No alcanza con escribir la regla: hay que ver que falla. Un validador con una
 * regla que nunca se probó es una regla que puede estar rota desde el día que
 * se escribió, y el único momento en que se descubre es cuando alguien intenta
 * pasar justo eso.
 *
 * Uso: npx tsx scripts/fabrica-probar-constitucion.ts
 * Sale 1 si alguna prueba no dio lo esperado.
 */
import { validarManifiesto } from '../lib/fabrica/validador'
import { MANIFIESTO_FINANZAS } from '../lib/fabrica/manifiestos/finanzas'
import type { Manifiesto } from '../lib/fabrica/tipos'

interface Caso {
  nombre: string
  /** Fragmento que tiene que aparecer en el mensaje de error. */
  esperado: string
  manifiesto: Manifiesto
}

/** Copia profunda barata: los manifiestos son datos puros. */
function clonar(m: Manifiesto): Manifiesto {
  return JSON.parse(JSON.stringify(m)) as Manifiesto
}

const CASOS: Caso[] = [
  {
    nombre: 'marcar modificable un elemento constitucional',
    esperado: 'no se modifica por configuración',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      // El arqueo ciego, declarado como si se pudiera configurar.
      ;(m.constitucional![0] as { modificable?: boolean }).modificable = true
      return m
    })(),
  },
  {
    nombre: 'ofrecer como parámetro algo declarado constitucional',
    esperado: 'ofrecido como parámetro configurable',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      m.configurable!.push({
        clave: 'umbral_aprobacion_pago',
        etiqueta: 'Monto desde el que un pago necesita segunda firma',
        tipo: 'numero',
        default: 100000,
      })
      return m
    })(),
  },
  {
    nombre: 'límite constitucional inventado',
    esperado: 'límite desconocido',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      ;(m.constitucional![0] as { limite: string }).limite = 'lo_que_me_convenga'
      return m
    })(),
  },
  {
    nombre: 'elemento constitucional sin motivo',
    esperado: 'sin motivo',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      m.constitucional![0].motivo = ''
      return m
    })(),
  },
  {
    nombre: 'tabla declarada deprecada y a la vez como entidad propia',
    esperado: 'declarada deprecada y a la vez como entidad del pool',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      m.deprecadas!.push({
        tabla: 'pagos',
        desde: '2026-08',
        motivo: 'a propósito, para ver si el validador lo levanta',
      })
      return m
    })(),
  },
  {
    nombre: 'agente con aprobar en un pool con confirmación humana',
    esperado: 'no aprueba lo que él mismo tiene que pedir',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      m.agentes![0].permisos = [{ modulo: 'finanzas', acciones: ['ver', 'aprobar'] }]
      return m
    })(),
  },
  {
    nombre: 'agente pidiendo más permisos que su pool',
    esperado: 'nunca supera a quien lo creó',
    manifiesto: (() => {
      const m = clonar(MANIFIESTO_FINANZAS)
      // `eliminar` no está entre los permisos del pool: el techo tiene que cortarlo.
      m.agentes![0].permisos = [{ modulo: 'finanzas', acciones: ['ver', 'eliminar'] }]
      return m
    })(),
  },
]

let fallo = false

console.log('\n── EL VALIDADOR TIENE QUE RECHAZAR ──────────────────────')
for (const caso of CASOS) {
  const errores = validarManifiesto(caso.manifiesto).filter((p) => p.gravedad === 'error')
  const encontrado = errores.some((e) => e.mensaje.includes(caso.esperado))
  if (encontrado) {
    console.log(`  ✓ ${caso.nombre}`)
  } else {
    fallo = true
    console.log(`  ✗ ${caso.nombre}`)
    console.log(`      esperaba un error con "${caso.esperado}"`)
    console.log(`      obtuvo: ${errores.map((e) => e.mensaje).join(' | ') || '(ningún error)'}`)
  }
}

console.log('\n── Y TIENE QUE ACEPTAR LO CORRECTO ──────────────────────')
const limpio = validarManifiesto(MANIFIESTO_FINANZAS).filter((p) => p.gravedad === 'error')
if (limpio.length === 0) {
  console.log('  ✓ el manifiesto real de Finanzas pasa sin errores')
} else {
  fallo = true
  console.log(`  ✗ el manifiesto real de Finanzas falla: ${limpio.map((e) => e.mensaje).join(' | ')}`)
}

console.log('')
process.exit(fallo ? 1 : 0)
