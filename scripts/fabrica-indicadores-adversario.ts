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
import { resumenCableado, revisarCableado } from '../lib/fabrica/cableado'
import { MANIFIESTOS } from '../lib/fabrica/manifiestos'
import { esGobernable, tieneConflictoDeFuente } from '../lib/fabrica/tipos'
import { PESOS_GOBERNADOS } from '../lib/fabrica/lector'
import {
  corteParaRegistrar,
  diferenciasAbiertas,
  sigueVivo,
  SIN_CORTE,
} from '../lib/fabrica/corte'
import { colaDeConstruccion } from '../lib/fabrica/pedidos'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { cambiarEstadoLector } from '../lib/fabrica/flag'
import { camposQueCambian } from '../lib/fabrica/procedencia'
import { obtenerDefinicion, parametroGobernante } from '../lib/fabrica/lector'
import { automatizacionActiva, parametro } from '../lib/os/definicion'
import { campoDelEvento } from '../lib/fabrica/corte'
import { estadoDeLaFabrica, laCifra } from '../lib/fabrica/estado'
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

  /* ── 9 · CORTE + DEDUPE, la combinación ───────────────────────────── */
  //
  // El hallazgo 13 de v0.67 no estaba en el corte ni en el dedupe: estaba en
  // cómo se combinaban. Por eso este caso ejercita LOS DOS JUNTOS y no cada
  // uno por separado, que es lo que los dejó pasar la primera vez.
  console.log('\nCORTE + DEDUPE (la combinación)')
  {
    const cortes = new Map<string, string>([['pantallas./x.titulo', '2026-01-02T00:00:00Z']])
    const viejo = { aspecto: 'pantallas', detalle: { ruta: '/x' }, ocurrido_at: '2026-01-01T00:00:00Z' }
    const nuevo = { aspecto: 'pantallas', detalle: { ruta: '/x' }, ocurrido_at: '2026-01-03T00:00:00Z' }
    const otraRuta = { aspecto: 'pantallas', detalle: { ruta: '/y' }, ocurrido_at: '2026-01-01T00:00:00Z' }

    caso(
      'un evento anterior al cambio DE SU CAMPO no cuenta',
      !sigueVivo(viejo, cortes, SIN_CORTE),
      'evento del 01, el campo cambió el 02 → resuelto',
    )
    caso(
      'y uno posterior SÍ cuenta (si no, el corte esconde todo)',
      sigueVivo(nuevo, cortes, SIN_CORTE),
      'evento del 03, el campo cambió el 02 → sigue abierto',
    )
    caso(
      'tocar un campo NO resuelve las diferencias de otro',
      sigueVivo(otraRuta, cortes, SIN_CORTE),
      '/y del 01 sigue vivo aunque /x haya cambiado el 02 — es el hallazgo 12',
    )
    caso(
      'la ventana del dedupe nunca empieza antes del corte del campo',
      (await corteParaRegistrar('stock', 'pantallas', { ruta: '/admin/operaciones/alertas' }, SIN_CORTE)) >=
        SIN_CORTE,
      'si empezara antes, el corte esconde y el dedupe impide volver a registrar — hallazgo 13',
    )
    const cinco = Array.from({ length: 5 }, (_, i) => ({
      aspecto: 'pantallas',
      detalle: { ruta: '/x' },
      ocurrido_at: `2026-01-0${i + 3}T00:00:00Z`,
    }))
    const abiertas = diferenciasAbiertas(cinco, cortes, SIN_CORTE)
    caso(
      'cinco eventos del mismo campo son UN problema, no cinco',
      abiertas.campos.size === 1 && abiertas.sinCampo === 0,
      `${abiertas.campos.size} campo(s) abierto(s) de ${cinco.length} eventos — inflar es tan malo como esconder`,
    )
    const dos = diferenciasAbiertas([...cinco, otraRuta], cortes, SIN_CORTE)
    caso(
      'y dos campos distintos son DOS (si no, el 1 de arriba sería ciego)',
      dos.campos.size === 2,
      `${dos.campos.size} campo(s) abierto(s)`,
    )
  }

  /* ── 10 · EL FALLBACK TOTAL SOBRE PARÁMETROS ──────────────────────── */
  //
  // Un título mal leído se ve feo; un parámetro mal leído hace que el sistema se
  // comporte distinto sin que nadie lo note. Así que el fallback tiene que ser
  // total en TODOS los caminos, y cada caso trae su contraprueba.
  //
  // NO se corrompe un manifiesto de producción para probar el camino del
  // manifiesto inválido: ese camino ya está cubierto por el caso del validador
  // más arriba —que ya no lanza— y romper producción para verlo sería peor que
  // no verlo.
  console.log('\nPARÁMETROS · fallback total')
  {
    caso(
      'un pool que no existe devuelve el valor del código',
      (await parametro('pool-que-no-existe', 'lo_que_sea', 30)) === 30,
      'sin pool → 30, el valor que el sector venía usando',
    )
    caso(
      'un parámetro no declarado devuelve el valor del código',
      (await parametro('stock', 'parametro-que-no-existe', 30)) === 30,
      'sin declaración → 30',
    )
    // Los 14 sensibles se declaran y NO se leen. Es el alcance del bloque C.
    const sensible = await parametro('documentos', 'umbral_confianza_auto', 0.5)
    const declarado = await parametroGobernante('documentos', 'umbral_confianza_auto')
    caso(
      'un parámetro SENSIBLE no se lee, aunque esté declarado',
      sensible === 0.5 && declarado?.valor === 0.9 && declarado?.gobernado === false,
      `el código dice 0.5, la declaración dice ${declarado?.valor} (peso ${declarado?.peso}) → gobierna 0.5`,
    )
    caso(
      'y uno OPERATIVO sí se lee (si no, el caso de arriba sería ciego)',
      (await parametro('stock', 'dias_aviso_vencimiento', 999)) !== 999,
      `el código dice 999, gobierna ${await parametro('stock', 'dias_aviso_vencimiento', 999)}`,
    )
    caso(
      'un tipo que no coincide no se convierte en silencio',
      (await parametro('stock', 'dias_aviso_vencimiento', 'treinta')) === 'treinta',
      'la declaración tiene un número y el código un texto → gana el código, no se adivina',
    )
    // Un pool apagado: el sector usa su código y NO se registra fallback, porque
    // con el flag abajo eso no es un fallback, es el funcionamiento normal.
    const apagado2 = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).find(
      (e) => e.lector === 'apagado',
    )
    if (apagado2) {
      caso(
        `un pool apagado (${apagado2.clave}) devuelve el código`,
        (await parametro(apagado2.clave, 'multi_punto', true)) === true,
        'flag abajo → el sector usa lo suyo',
      )
    }
  }

  /* ── 11 · CONFLICTO DE FUENTE ─────────────────────────────────────── */
  console.log('\nFUENTE DE UN PARÁMETRO')
  {
    const base = { clave: 'x', etiqueta: 'X', tipo: 'entero' as const, peso: 'operativo' as const }
    const limpio = { ...base }
    const enConflicto = {
      ...base,
      fuente: { tipo: 'variable_de_entorno' as const, nombre: 'X_ENV', resuelto: 'sin_resolver' as const },
    }
    const ordenado = {
      ...base,
      fuente: { tipo: 'variable_de_entorno' as const, nombre: 'X_ENV', resuelto: 'es_el_fallback' as const },
    }
    caso(
      'un parámetro con dos fuentes sin resolver NO es gobernable',
      !esGobernable(enConflicto, PESOS_GOBERNADOS) && tieneConflictoDeFuente(enConflicto),
      'el lector no arbitra una discusión entre dos fuentes',
    )
    caso(
      'y uno sin otra fuente SÍ lo es (si no, el de arriba sería ciego)',
      esGobernable(limpio, PESOS_GOBERNADOS) && !tieneConflictoDeFuente(limpio),
      'sin segunda fuente, manda el peso y nada más',
    )
    caso(
      'una fuente RESUELTA como fallback no bloquea: quedó ordenada',
      esGobernable(ordenado, PESOS_GOBERNADOS) && !tieneConflictoDeFuente(ordenado),
      'la variable de entorno pasa a ser el valor del código, no una fuente que compite',
    )
    // La contraprueba sobre datos reales.
    //
    // La primera versión afirmaba `conflictosDeFuente > 0`, y ROMPIÓ cuando el
    // bloque B cerró el último conflicto: la prueba dependía de que el defecto
    // existiera. Un caso así no verifica el indicador, verifica el estado — y
    // el día que el estado mejora, se lee como si el indicador se hubiera roto.
    //
    // Lo que sí se puede afirmar siempre: el conteo COINCIDE con los que
    // declaran la fuente sin resolver. Da cero cuando no hay y distinto de cero
    // cuando hay, sin depender de cuál sea el caso hoy.
    const manifiestos = []
    for (const clave of Object.keys(MANIFIESTOS)) {
      const v = await versionActual(clave)
      if (v) manifiestos.push({ clave, manifiesto: v.manifiesto })
    }
    const declarados = manifiestos.flatMap((m) =>
      (m.manifiesto.configurable ?? [])
        .filter((c) => c.fuente?.resuelto === 'sin_resolver')
        .map((c) => `${m.clave}.${c.clave}`),
    )
    const r = resumenCableado(revisarCableado(manifiestos))
    caso(
      'el conteo de conflictos coincide con los declarados sin resolver',
      r.conflictosDeFuente === declarados.length &&
        declarados.every((d) => r.conflictos.includes(d)),
      `${r.conflictosDeFuente} contado(s) · ${declarados.length} declarado(s) sin resolver${declarados.length ? `: ${declarados.join(', ')}` : ' (hoy ninguno, y el conteo lo refleja)'}`,
    )
  }

  /* ── 12 · AUTOMATIZACIONES ────────────────────────────────────────── */
  console.log('\nAUTOMATIZACIONES')
  {
    // El fallback tiene que devolver el valor del CÓDIGO, no `false`: lo que no
    // pasa no deja rastro, así que ante la duda la automatización corre.
    caso(
      'un pool inexistente devuelve el valor del código, no false',
      (await automatizacionActiva('pool-que-no-existe', 'x', true)) === true,
      'ante cualquier duda, corre como venía corriendo',
    )
    caso(
      'y con el código en false devuelve false (si no, lo de arriba sería ciego)',
      (await automatizacionActiva('pool-que-no-existe', 'x', false)) === false,
      'el fallback es el valor del código, no un true fijo',
    )
    // Una automatización NUNCA es candidata a verde, ni con el interruptor.
    const v = await versionActual('stock')
    const verde = carrilDeCampo({
      campo: 'automatizaciones.recalcular_rotacion',
      nivel: 'instalacion',
      delPool: v!.manifiesto,
      valor: false,
      verdeHabilitado: () => true,
    })
    caso(
      'apagar una automatización nunca cae en verde, ni con el interruptor abierto',
      verde.carril === 'amarillo',
      `carril=${verde.carril} — ${verde.motivo.slice(0, 80)}`,
    )
    // Prender desde una instalación algo que la pieza declara apagado: rechazo.
    const conApagada = JSON.parse(JSON.stringify(v!.manifiesto))
    const acc = conApagada.agentes.flatMap((a: { acciones: unknown[] }) => a.acciones).find(
      (c: { clave: string }) => c.clave === 'recalcular_rotacion',
    )
    acc.automatizacion.activa = false
    const rechazo = validarOverrides(conApagada, { automatizaciones: { recalcular_rotacion: true } })
    caso(
      'prender lo que la pieza declara apagado se rechaza',
      rechazo.length > 0,
      rechazo[0]?.motivo.slice(0, 90) ?? 'lo aceptó (mal)',
    )
    caso(
      'y apagarlo se acepta (si no, el rechazo de arriba sería un no a todo)',
      validarOverrides(v!.manifiesto, { automatizaciones: { recalcular_rotacion: false } }).length === 0,
      'apagar es ser más conservador que la pieza: siempre se puede',
    )
  }

  /* ── 13 · EL DOMINIO ENTERO ───────────────────────────────────────── */
  console.log('\nDOMINIO DE AUTOMATIZACIONES')
  {
    const est = await estadoDeLaFabrica(PROYECTO_SOCIAL_AHORRO)
    const sum = (f: (p: (typeof est.pools)[number]) => number) => est.pools.reduce((a, p) => a + f(p), 0)
    const total = sum((p) => p.automatizaciones.total)
    const cableadas = sum((p) => p.automatizaciones.cableadas)
    const gobernadas = sum((p) => p.automatizaciones.gobernadas)

    // CON EL MÁXIMO: cableadas son las 15, y si gobernadas dijera lo mismo el
    // indicador estaría contando pools apagados como si gobernara.
    caso(
      'cableadas y gobernadas no son el mismo número',
      cableadas === total && gobernadas < cableadas,
      `${cableadas} cableadas de ${total} · ${gobernadas} gobernadas: la diferencia son los pools apagados`,
    )
    // CON CERO: ningún pool apagado aporta gobernadas.
    caso(
      'un pool con el lector apagado aporta 0 gobernadas',
      est.pools.filter((p) => p.lector !== 'prendido').every((p) => p.automatizaciones.gobernadas === 0),
      'el código pregunta y la fábrica no contesta: eso no es gobernar',
    )
    // Y el pool prendido las aporta TODAS: sin esto, lo de arriba sería cierto
    // con un indicador que devuelve cero siempre.
    const prendido = est.pools.find((p) => p.lector === 'prendido' && p.automatizaciones.total > 0)
    caso(
      'y el pool prendido las aporta todas',
      !!prendido && prendido.automatizaciones.gobernadas === prendido.automatizaciones.total,
      `${prendido?.clave}: ${prendido?.automatizaciones.gobernadas} de ${prendido?.automatizaciones.total} — el dominio completo`,
    )

    // La cifra no puede decir más de lo que gobierna.
    const cifra = laCifra(est.pools)
    caso(
      'la cifra dice las gobernadas, no las cableadas',
      cifra.includes(`${gobernadas} automatización(es) de ${total}`),
      cifra,
    )

    // El registro de la ausencia: el aspecto tiene que estar en el corte por
    // campo, o sus eventos caen al corte del pool (hallazgo 12).
    caso(
      'un evento de automatización tiene campo propio para el corte',
      campoDelEvento({ aspecto: 'automatizaciones', detalle: { automatizacion: 'x' } }) ===
        'automatizaciones.x.activa',
      'sin esto, arreglar una borra las alarmas de las otras',
    )
    caso(
      'y uno sin clave no inventa un campo',
      campoDelEvento({ aspecto: 'automatizaciones', detalle: {} }) === null,
      'cae al corte del pool, que es lo correcto cuando no se sabe de cuál es',
    )
  }

  /* ── 14 · la cola de construcción vacía ───────────────────────────── */
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
