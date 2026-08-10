/**
 * ¿EL CÓDIGO USA LO QUE GOBIERNA? Verificación sobre los parámetros gobernados.
 *
 * Uso: npx tsx scripts/fabrica-verificar-cableado.ts
 *
 * Se corre contra la declaración QUE GOBIERNA —la de la base, no la semilla del
 * repo—, porque es la que manda. Preguntarle a la semilla sería preguntarle al
 * código, que es justo lo que la fábrica no quiere hacer.
 *
 * OBSERVA Y NO AFIRMA: lee archivos y no escribe en ninguna parte. Sale 1 si
 * hay algún cableado a medias, porque un cableado a medias es un problema y no
 * una advertencia.
 */
import { ETIQUETA_CABLEADO, resumenCableado, revisarCableado } from '../lib/fabrica/cableado'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { versionActual } from '../lib/fabrica/versiones'

async function main() {
  const manifiestos = []
  for (const clave of Object.keys(MANIFIESTOS)) {
    const v = await versionActual(clave)
    if (v) manifiestos.push({ clave, manifiesto: v.manifiesto })
  }

  const revisiones = revisarCableado(manifiestos)
  const r = resumenCableado(revisiones)

  console.log(`\n${r.total} parámetros · ${r.gobernados} gobernados (inocuo + operativo)\n`)

  for (const estado of ['parcial', 'sin_cablear', 'completo', 'sin_declarar'] as const) {
    const los = revisiones.filter((x) => x.gobernado && x.estado === estado)
    if (los.length === 0) continue
    console.log(`■ ${ETIQUETA_CABLEADO[estado].toUpperCase()} · ${los.length}`)
    for (const x of los) {
      console.log(`   ${x.poolClave}.${x.clave}`)
      if (estado === 'sin_declarar') continue
      console.log(`     ${x.motivo}`)
      for (const v of x.verificados) console.log(`     ✓ ${v}`)
      for (const d of x.desmentidos) console.log(`     ✗ DESMIENTE AL MANIFIESTO: ${d}`)
      for (const f of x.faltan) console.log(`     · falta cablear: ${f}`)
      for (const i of x.inexistentes) console.log(`     ✗ no existe: ${i}`)
    }
    console.log('')
  }

  // El denominador honesto: no se puede decir "3 de 23 completos" cuando 19 no
  // declaran dónde van. Eso mezcla "lo revisamos y está mal" con "no se pudo
  // revisar", que es la distinción entera de este proyecto.
  console.log(
    `DE LOS ${r.gobernados} GOBERNADOS: ${r.verificables} verificables · ` +
      `${r.completos} completo(s) · ${r.parciales} A MEDIAS · ${r.sinCablear} sin cablear · ` +
      `${r.sinDeclarar} sin declarar dónde se usan (no verificables)`,
  )
  console.log('')
  process.exit(r.parciales > 0 ? 1 : 0)
}

main()
