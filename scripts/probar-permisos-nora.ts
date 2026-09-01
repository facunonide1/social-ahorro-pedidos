/**
 * ¿QUÉ HERRAMIENTAS RECIBE NORA SEGÚN QUIÉN LE HABLA?
 *
 * ── LO QUE ESTA PRUEBA VERIFICA, Y LO QUE NO ────────────────────────────────
 *
 * NO verifica que el modelo se haya negado. Verifica que **la herramienta no
 * está en el catálogo que sale hacia el modelo**, que es otra cosa y es la
 * única segura.
 *
 * Un modelo al que se le pide que no use algo, algún día lo usa: basta una
 * pregunta ambigua, un historial largo o una versión nueva. Un modelo que nunca
 * recibió la herramienta no la puede usar de ninguna manera.
 *
 * Por eso la prueba mira la lista, no la respuesta.
 *
 *   npx tsx scripts/probar-permisos-nora.ts
 */

import { AI_TOOLS, toolsPara } from '../lib/ai/tools'
import { PERMISOS_TOOLS, puedeUsar, porQueNo, type QuienHabla } from '../lib/ai/permisos-tools'
import type { AdminRole } from '../lib/types/admin'

const ROLES: { nombre: string; rol: AdminRole }[] = [
  { nombre: 'dueño (super_admin)', rol: 'super_admin' },
  { nombre: 'encargado de sucursal', rol: 'encargado_sucursal' },
  { nombre: 'mostrador', rol: 'empleado_general' },
]

/** Las de plata: ninguna puede llegarle al mostrador. */
const DE_PLATA = [
  'get_cash_flow_resumen',
  'get_facturas_vencer',
  'get_resumen_ventas',
  'ventas_dia',
]

let fallos = 0

function main() {
  const todas = Object.keys(AI_TOOLS)
  console.log(`herramientas declaradas: ${todas.length}\n`)

  // Ninguna sin declarar: el default es negar, así que una herramienta que
  // alguien agregue y olvide declarar simplemente no llega — pero conviene
  // saberlo, porque «no llega» también es un error.
  const sinDeclarar = todas.filter((id) => !(id in PERMISOS_TOOLS))
  if (sinDeclarar.length) {
    console.log(`SIN DECLARAR (no llegan a nadie): ${sinDeclarar.join(', ')}\n`)
    fallos += sinDeclarar.length
  }

  for (const { nombre, rol } of ROLES) {
    const quien: QuienHabla = { rol, permisosCustom: null }
    const defs = toolsPara(quien)
    const ids = defs.map((d) => d.name)
    console.log(`${nombre.padEnd(24)} recibe ${String(ids.length).padStart(2)} de ${todas.length}`)

    if (rol === 'empleado_general') {
      const filtradas = DE_PLATA.filter((id) => ids.includes(id))
      if (filtradas.length) {
        fallos++
        console.log(`   MAL  el mostrador recibe herramientas de plata: ${filtradas.join(', ')}`)
      } else {
        console.log(`   ok   ninguna de plata en su catalogo (${DE_PLATA.join(', ')})`)
      }
    }
  }

  console.log('\n── los cuatro motivos de negativa, textuales ──')
  const mostrador: QuienHabla = { rol: 'empleado_general', permisosCustom: null }
  console.log('  3 · sin permiso   →', porQueNo('get_cash_flow_resumen', mostrador))
  console.log('  2 · no existe     →', porQueNo('pedir_prestamo_al_banco', mostrador))

  console.log('\n── el mismo id, tres roles ──')
  for (const { nombre, rol } of ROLES) {
    const q: QuienHabla = { rol, permisosCustom: null }
    console.log(`  get_cash_flow_resumen · ${nombre.padEnd(24)} ${puedeUsar('get_cash_flow_resumen', q) ? 'LO RECIBE' : 'no lo recibe'}`)
  }

  console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLO(S)`}`)
  process.exit(fallos === 0 ? 0 : 1)
}

main()
