/**
 * PRUEBA ADVERSARIA DE LOS INDICADORES.
 *
 * Uso: npx tsx scripts/fabrica-indicadores-adversario.ts
 *
 * Los cinco indicadores que mintieron hasta v0.66 se encontraron TODOS por
 * casualidad, probando otra cosa. Esto los busca a propósito.
 *
 * La forma es siempre la misma: se le pone al indicador una situación donde no
 * hay nada que medir —o donde lo que hay está roto— y se verifica que NO
 * devuelva un número tranquilizador. Un indicador que contesta "0 problemas"
 * cuando no miró nada es peor que uno que se rompe: el que se rompe se arregla,
 * el que miente se cree.
 *
 * NO TOCA NADA DE PRODUCCIÓN. Todos los casos son en memoria o sobre claves
 * inexistentes. Sale 1 si algún indicador miente.
 */
import { carrilDeCampo } from '../lib/fabrica/carriles'
import { colaDeConstruccion } from '../lib/fabrica/pedidos'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { cambiarEstadoLector } from '../lib/fabrica/flag'
import { camposQueCambian } from '../lib/fabrica/procedencia'
import { obtenerDefinicion } from '../lib/fabrica/lector'
import { procedenciaDe } from '../lib/fabrica/procedencia'
import { resolver, validarOverrides } from '../lib/fabrica/overrides'
import { salud } from '../lib/fabrica/propuestas'
import { validarManifiesto } from '../lib/fabrica/validador'
import { coberturaDe } from '../lib/fabrica/cobertura-lector'
import { verificarPool } from '../lib/fabrica/verificador'
import { versionActual } from '../lib/fabrica/versiones'
import type { Manifiesto } from '../lib/fabrica/tipos'

let fallo = false
let n = 0

/**
 * `esperado` describe qué tendría que pasar. Si no pasa, el indicador miente y
 * la corrida sale en rojo.
 */
function caso(nombre: string, ok: boolean, observado: string) {
  n++
  if (!ok) fallo = true
  console.log(`  ${ok ? '✓' : '✗ MIENTE'} ${nombre}`)
  console.log(`      ${observado}`)
}

const MANIFIESTO_VACIO: Manifiesto = {
  formato: '1.5.0',
  clave: 'inexistente',
  nombre: 'Pieza que no existe',
  categoria: 'operacion',
  version: '1.0.0',
  pantallas: [],
} as unknown as Manifiesto

async function main() {
  console.log('\n═══ PRUEBA ADVERSARIA DE INDICADORES ═══\n')

  /* ── 1 · salud del Taller sin propuestas ──────────────────────────── */
  console.log('SALUD DEL TALLER')
  const vacia = salud([])
  caso(
    'sin propuestas, la tasa de ignoradas no dice 0%',
    vacia.tasaIgnoradas === null,
    `tasaIgnoradas = ${vacia.tasaIgnoradas} (null = "nada que medir"; 0 se leería como "todo bien")`,
  )
  caso(
    'sin decisiones, el tiempo hasta decidir no dice 0 horas',
    vacia.horasHastaDecision === null,
    `horasHastaDecision = ${vacia.horasHastaDecision}`,
  )

  /* ── 2 · verificación de un pool que no existe ────────────────────── */
  console.log('\nVERIFICACIÓN')
  const inexistente = await verificarPool({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: 'pool-que-no-existe',
    origen: 'provocada',
  })
  caso(
    'un pool inexistente no da "0 diferencias" a secas',
    inexistente.diferencias === 0 && !!inexistente.motivo,
    `diferencias=${inexistente.diferencias} · motivo: ${inexistente.motivo}`,
  )

  const apagado = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).find(
    (e) => e.lector === 'apagado',
  )
  if (apagado) {
    const r = await verificarPool({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave: apagado.clave,
      origen: 'provocada',
    })
    // Ojo con la afirmación: `declaradas` SÍ puede ser > 0 —el pool declara
    // pantallas aunque no se verifiquen—. Lo que no puede faltar es el motivo,
    // y lo que no puede pasar es que quien lo muestre se lo coma.
    caso(
      `un pool apagado (${apagado.clave}) no se reporta como verificado`,
      !!r.motivo && r.diferencias === 0 && r.cableadas === 0,
      `declaradas=${r.declaradas} cableadas=${r.cableadas} diferencias=${r.diferencias} · motivo: ${r.motivo}`,
    )
  }

  /* ── 3 · cobertura sin consultas ──────────────────────────────────── */
  console.log('\nCOBERTURA')
  const cob = await coberturaDe(PROYECTO_SOCIAL_AHORRO, 'pool-que-no-existe', 'prendido', {
    conAdmin: true,
  })
  caso(
    'un pool sin declaración no da "verificado sin diferencias"',
    cob.veredicto === 'no_verificado',
    `veredicto=${cob.veredicto} · ${cob.motivo}`,
  )

  /* ── 4 · el lector con un manifiesto inválido ─────────────────────── */
  console.log('\nLECTOR')
  const def = await obtenerDefinicion('pool-que-no-existe', 'pantallas')
  caso(
    'un pool inexistente devuelve null y no una definición vacía',
    def === null,
    `obtenerDefinicion → ${def === null ? 'null (el sector usa su código)' : JSON.stringify(def)}`,
  )
  const errores = validarManifiesto(MANIFIESTO_VACIO).filter((p) => p.gravedad === 'error')
  caso(
    'un manifiesto sin pantallas ni campos obligatorios no valida',
    errores.length > 0,
    `${errores.length} error(es): ${errores.slice(0, 2).map((e) => e.campo).join(', ')}`,
  )

  /* ── 5 · el interruptor con un estado que no existe ───────────────── */
  console.log('\nINTERRUPTOR DEL LECTOR')
  const mal = await cambiarEstadoLector({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: 'stock',
    hasta: 'encendidisimo' as never,
    usuarioId: '5bf8468f-c6a2-4231-8bcb-3c943777bf03',
    motivo: 'Prueba adversaria: un estado que no existe.',
  })
  caso(
    'un estado inexistente no contesta que sí',
    mal.ok === false,
    `retorno: ${JSON.stringify(mal)}`,
  )

  /* ── 6 · el origen de un override que no cambia nada ──────────────── */
  console.log('\nORIGEN DE LOS VALORES')
  const version = await versionActual('stock')
  if (version) {
    const primera = version.manifiesto.pantallas[0]
    const { origenes } = resolver(version.manifiesto, { titulos: { [primera.ruta]: primera.titulo } })
    caso(
      'un override idéntico a la pieza no se marca como decisión del negocio',
      origenes[`pantallas.${primera.ruta}.titulo`] === 'pool',
      `origen de ${primera.ruta}.titulo = ${origenes[`pantallas.${primera.ruta}.titulo`]}`,
    )
    const rechazos = validarOverrides(version.manifiesto, {
      vocabulario: { [primera.ruta]: primera.titulo },
    })
    caso(
      'un vocabulario idéntico al término del oficio se rechaza al escribir',
      rechazos.length > 0,
      rechazos[0]?.motivo ?? 'no lo rechazó',
    )
  }

  /* ── 7 · el diff de procedencia con un cambio que no cambia ───────── */
  console.log('\nPROCEDENCIA')
  const sinCambio = camposQueCambian({ titulos: { '/x': 'A' } }, { titulos: { '/x': 'A' } })
  caso(
    'reescribir el mismo valor no genera una decisión falsa en la historia',
    sinCambio.length === 0,
    `${sinCambio.length} campo(s) detectados como cambiados`,
  )
  const conCambio = camposQueCambian({ titulos: { '/x': 'A' } }, { titulos: { '/x': 'B' } })
  caso(
    'y un cambio real SÍ se detecta (si no, el cero de arriba sería ciego)',
    conCambio.length === 1,
    `${conCambio.length} campo(s): ${conCambio.map((c) => c.campo).join(', ')}`,
  )
  const proc = await procedenciaDe('pool-que-no-existe', PROYECTO_SOCIAL_AHORRO)
  caso(
    'la procedencia de un pool inexistente da vacío, no inventa',
    proc.size === 0,
    `${proc.size} campo(s)`,
  )

  /* ── 8 · el carril de un campo desconocido ────────────────────────── */
  console.log('\nCARRILES')
  const desconocido = carrilDeCampo({
    campo: 'campo.que.no.existe',
    nivel: 'instalacion',
    delPool: version?.manifiesto ?? MANIFIESTO_VACIO,
    valor: 'lo que sea',
    verdeHabilitado: () => true,
  })
  caso(
    'un campo desconocido NO cae en verde ni con el interruptor abierto',
    desconocido.carril !== 'verde',
    `carril=${desconocido.carril} — ${desconocido.motivo.slice(0, 90)}`,
  )

  /* ── 9 · la cola de construcción vacía ────────────────────────────── */
  console.log('\nCOLA DE CONSTRUCCIÓN')
  const cola = await colaDeConstruccion({ conAdmin: true })
  caso(
    'la cola informa cuántos pedidos hay y no un total inventado',
    cola.every((g) => g.veces === g.miembros.length && g.proyectos.length > 0),
    `${cola.length} grupo(s); cada uno cuenta sus miembros y sus proyectos`,
  )

  console.log(`\n${n} casos · ${fallo ? 'HAY INDICADORES QUE MIENTEN' : 'ninguno mintió'}\n`)
  process.exit(fallo ? 1 : 0)
}

main()
