/**
 * ANOTA LOS DEFECTOS DE LA PIEZA Y LOS CORRIGE.
 *
 * Uso: npx tsx scripts/fabrica-corregir-piezas.ts [--corregir]
 *
 * Sin `--corregir` sólo anota y muestra qué haría. Con `--corregir` escribe las
 * versiones de pieza y borra los overrides que quedan redundantes.
 *
 * ── LA DECISIÓN QUE IMPLEMENTA ──────────────────────────────────────────────
 *
 * Los 13 se corrigen en la pieza con el literal real del código.
 *
 * Hoy la pieza dice cosas que ninguna implementación usa: "Inventarios" contra
 * "Inventarios físicos". Eso no es neutro, es una declaración inventada — y es
 * más honesto tener el término que alguien usa que uno que nadie usa. Cuando
 * aparezca el segundo negocio se verá cuál de los dos es el término del oficio,
 * y ése será un cambio de pieza con su procedencia.
 *
 * ── DE DÓNDE SALE EL LITERAL ────────────────────────────────────────────────
 *
 * Del tercer argumento de `tituloDePantalla(pool, ruta, 'Literal')`, leído del
 * archivo. Es el único lugar donde vive, y es exactamente lo que se ve si la
 * fábrica no contesta.
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { anotarDefecto, cerrarDefecto, defectos } from '../lib/fabrica/defectos'
import { escribirOverride, escribirVersion } from '../lib/fabrica/escritor'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { overridesActuales } from '../lib/fabrica/overrides'
import { versionActual } from '../lib/fabrica/versiones'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'
const CORREGIR = process.argv.includes('--corregir')

function literalesDelCodigo(): Map<string, string> {
  const salida = new Map<string, string>()
  const archivos = execSync('grep -rl "tituloDePantalla(" app --include="*.tsx"', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const re = /tituloDePantalla\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g
  for (const f of archivos) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) {
      salida.set(`${m[1]}|${m[2]}`, m[3].replace(/\\'/g, "'"))
    }
  }
  return salida
}

async function main() {
  const literales = literalesDelCodigo()
  const estados = await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })

  /* ── 1 · anotar los defectos ───────────────────────────────────────── */
  const porPool = new Map<string, { ruta: string; dice: string; deberia: string }[]>()

  for (const e of estados) {
    const version = await versionActual(e.clave)
    if (!version) continue
    for (const p of version.manifiesto.pantallas) {
      const codigo = literales.get(`${e.clave}|${p.ruta}`)
      // Sin literal en el código no se puede afirmar nada: la pantalla puede no
      // estar cableada. No se clasifica lo que no se pudo leer.
      if (!codigo) continue
      if (codigo === p.titulo) continue

      porPool.set(e.clave, [
        ...(porPool.get(e.clave) ?? []),
        { ruta: p.ruta, dice: p.titulo, deberia: codigo },
      ])
      const r = await anotarDefecto({
        poolClave: e.clave,
        campo: `pantallas.${p.ruta}.titulo`,
        dice: p.titulo,
        deberiaDecir: codigo,
        detectadoPor:
          'Dos caminos independientes: el clasificador de overrides leyendo el literal del código, y la comparación en sombra de la PIEZA contra el código.',
        evidencia: `La pieza declara "${p.titulo}". El código pasa "${codigo}" como fallback en tituloDePantalla, que es lo que se ve si la fábrica no contesta. El override de instalación lo tapaba.`,
        enQueProyectos: [PROYECTO_SOCIAL_AHORRO],
      })
      if (!r.ok) console.error(`  ✗ ${e.clave} ${p.ruta}: ${r.error}`)
    }
  }

  const abiertos = await defectos({ soloAbiertos: true })
  console.log(`\nDEFECTOS DE PIEZA ABIERTOS: ${abiertos.length}`)
  for (const d of abiertos) {
    console.log(`  ${d.poolClave.padEnd(11)} ${d.campo.padEnd(52)} "${d.dice}" → "${d.deberiaDecir}"`)
  }

  if (!CORREGIR) {
    console.log('\nSin --corregir: no se escribió nada. Volvé a correrlo con --corregir.\n')
    return
  }

  /* ── 2 · corregir la PIEZA ─────────────────────────────────────────── */
  console.log('\nCORRIGIENDO LAS PIEZAS')
  for (const [clave, cambios] of porPool) {
    const version = await versionActual(clave)
    if (!version) continue
    const nuevo = {
      ...version.manifiesto,
      pantallas: version.manifiesto.pantallas.map((p) => {
        const c = cambios.find((x) => x.ruta === p.ruta)
        return c ? { ...p, titulo: c.deberia } : p
      }),
    }
    const r = await escribirVersion({
      clave,
      manifiesto: nuevo,
      motivo:
        `Se corrigen ${cambios.length} título(s) que la pieza declaraba distinto de lo que muestra el código. ` +
        'La pieza decía términos que ninguna implementación usa, tapados por overrides de instalación: una declaración inventada. ' +
        'Es más honesto tener el término que alguien usa que uno que nadie usa. Cuando aparezca el segundo negocio se verá cuál es el del oficio, y ése será otro cambio de pieza con su procedencia.',
      autorId: AUTOR,
      gobernando: true,
    })
    console.log(
      `  ${clave.padEnd(11)} ${r.ok ? `versión nueva · ${cambios.length} corregido(s)` : `✗ ${r.error ?? JSON.stringify(r.rechazos)}`}`,
    )
    if (!r.ok) continue

    // Cerrar los defectos de este pool, apuntando a la versión que los corrigió.
    for (const d of abiertos.filter((x) => x.poolClave === clave)) {
      await cerrarDefecto({
        id: d.id,
        estado: 'corregido',
        motivo: `Corregido en la pieza: ahora declara "${d.deberiaDecir}", el literal que muestra el código.`,
        versionId: r.versionId,
        autorId: AUTOR,
      })
    }

    /* ── 3 · borrar los overrides que quedaron redundantes ──────────── */
    const e = estados.find((x) => x.clave === clave)
    if (!e) continue
    const propios = await overridesActuales(e.instalacionId)
    const titulos = propios?.overrides.titulos ?? {}
    const quedan: Record<string, string> = {}
    let sacados = 0
    const piezaAhora = (await versionActual(clave))!.manifiesto
    for (const [ruta, valor] of Object.entries(titulos)) {
      const enLaPieza = piezaAhora.pantallas.find((p) => p.ruta === ruta)?.titulo
      if (valor === enLaPieza) sacados++
      else quedan[ruta] = valor
    }
    if (sacados === 0) continue
    const r2 = await escribirOverride({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave,
      overrides: {
        ...propios?.overrides,
        ...(Object.keys(quedan).length ? { titulos: quedan } : { titulos: undefined }),
      },
      motivo: `Se sacan ${sacados} override(s) de título que quedaron redundantes: la pieza ya dice lo mismo. Un override que no cambia nada hace que el origen mienta.`,
      autorId: AUTOR,
    })
    console.log(
      `  ${clave.padEnd(11)} ${r2.ok ? `${sacados} override(s) redundante(s) sacado(s)` : `✗ ${r2.error}`}`,
    )
  }

  console.log('')
}

main()
