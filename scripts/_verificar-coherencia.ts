/**
 * E.3 · LO QUE MUESTRA UNA PANTALLA CONTRA LA CONSULTA DIRECTA A LA BASE.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 *
 * El corte de la v0.98 lo destapó una verificación escrita a mano para el
 * informe: el código de la pantalla decía 635 productos y la base decía 1.687.
 * Nadie lo habría visto sin ese cruce, porque 635 es un número plausible.
 *
 * Esto lo hace automático y lo corre el build.
 *
 * ── LA FORMA DEL CHEQUEO ────────────────────────────────────────────────────
 *
 * Cada verificación llama **la misma función que llama la pantalla** y compara
 * el número que sale de ahí contra el mismo hecho obtenido por un camino
 * distinto: un `count` en la base, o todas las filas paginadas.
 *
 * Eso es lo importante. Un chequeo que escribe su propia consulta no prueba
 * nada: prueba la consulta del chequeo. Si el camino del código y el camino
 * directo no dan lo mismo, uno de los dos miente — y el que está en pantalla
 * es el que le importa a alguien.
 *
 * ── LO QUE NO PRUEBA ────────────────────────────────────────────────────────
 *
 * Que el número sea el correcto. Si la vista de la base está mal definida, los
 * dos caminos van a estar mal igual. Lo que caza es el truncamiento silencioso,
 * que es el error que se repitió tres veces en este proyecto.
 */
import { createClient } from '@supabase/supabase-js'
import { paginar } from '../lib/supabase/paginar'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

let fallas = 0
let salteados = 0
const num = (x: number) => x.toLocaleString('es-AR')

function ok(s: string) { console.log(`  ok     ${s}`) }
function saltear(s: string) { console.log(`  --     ${s}`); salteados++ }

/**
 * Compara dos números que tienen que ser el mismo hecho.
 *
 * `delCodigo` sale del camino que usa la pantalla. `deLaBase`, de un camino
 * independiente. El diagnóstico dice de qué lado está el problema porque el
 * que lee esto en un build roto tiene treinta segundos de paciencia.
 */
function comparar(que: string, delCodigo: number, deLaBase: number, como: string) {
  if (delCodigo === deLaBase) {
    ok(`${que}: ${num(delCodigo)} por los dos caminos (${como})`)
    return
  }
  fallas++
  console.log(
    `  FALLA  ${que}\n` +
    `         el código de la pantalla dice ${num(delCodigo)}\n` +
    `         ${como} dice ${num(deLaBase)}\n` +
    `         ${delCodigo < deLaBase
      ? 'La pantalla devuelve de MENOS. Si la diferencia deja el número del código en\n' +
        '         un múltiplo exacto de 1.000, es el corte de PostgREST: la consulta no\n' +
        '         pasa por paginar() ni cuenta con count: exact.'
      : 'La pantalla devuelve de MÁS: hay filas repetidas en algún join.'}`,
  )
}

/** Cuenta filas en la base sin traerlas. */
async function contar(relacion: string, col: string): Promise<number> {
  const { count, error } = await adm.from(relacion).select(col, { count: 'exact', head: true })
  if (error) throw new Error(`no se pudo contar ${relacion}: ${error.message}`)
  return count ?? 0
}

async function main() {
  // ── 1 · EL NÚMERO QUE ESTABA MAL ────────────────────────────────────────
  //
  // Abasto dice cuántos productos conviene transferir en vez de comprar. Ese
  // número sale de un agregado en la base (`agentes_resumen`). El camino
  // independiente es traer TODAS las filas de la vista —paginadas— y contar
  // los productos distintos acá.
  //
  // Son dos implementaciones distintas del mismo hecho. Si coinciden, ninguna
  // de las dos está cortada.
  // Se recalcula primero. El resumen es un snapshot diario (migración 0204) y
  // comparar un snapshot de ayer contra las filas de hoy daría diferencias que
  // no son cortes. Recalcular es idempotente: no cambia datos, los vuelve a
  // contar.
  const { data: resumen, error: eRes } =
    await adm.rpc('agentes_resumen_calcular', { p_sucursal: null })
  if (eRes) throw new Error(`no se pudo calcular el resumen de agentes: ${eRes.message}`)
  if (resumen == null) throw new Error('el resumen de agentes volvió vacío')
  const abasto = (resumen as any)?.abasto ?? {}

  const { filas: transf, truncado } = await paginar<{ producto_id: string }>(
    adm.from('transferir_antes_de_comprar').select('producto_id').order('producto_id'),
    { maximo: 200_000 },
  )
  if (truncado) throw new Error('la vista de transferencias no entró en el tope de paginado')

  if (transf.length === 0) {
    saltear('Abasto · transferencias: la vista está vacía, el cruce no prueba nada')
  } else {
    comparar('Abasto · productos para transferir en vez de comprar',
      Number(abasto.productos_a_transferir ?? 0),
      new Set(transf.map((f) => f.producto_id)).size,
      `las ${num(transf.length)} filas de la vista, paginadas y contadas distintas`)
  }

  // ── 2 · QUE paginar() SIGA TRAYENDO TODO ────────────────────────────────
  //
  // Once pantallas se arreglaron en la v0.99 cambiándolas a paginar(). Si el
  // helper se rompiera, las once volverían a cortar en silencio a la vez y no
  // habría ninguna otra señal. Esto lo prueba contra la relación más grande
  // que hay.
  const itemsBase = await contar('stock_items', 'id')
  if (itemsBase <= 1000) {
    saltear(`stock_items tiene ${num(itemsBase)} filas: por debajo del corte, no prueba nada`)
  } else {
    const { filas } = await paginar<{ id: string }>(
      adm.from('stock_items').select('id').order('id'), { maximo: 500_000 },
    )
    comparar('paginar() sobre stock_items', filas.length, itemsBase,
      'el count exacto en la base')
  }

  // ── 3 · LOS QUIEBRES QUE MUESTRA LA PANTALLA DE COMPRAS ─────────────────
  //
  // `cuantosQuiebres()` cuenta en la base con head: true. El camino
  // independiente es paginar la misma vista.
  const quiebresBase = await contar('quiebres_por_sucursal', 'producto_id')
  const { filas: quiebresFilas } = await paginar<{ producto_id: string }>(
    adm.from('quiebres_por_sucursal').select('producto_id').order('producto_id'),
    { maximo: 100_000 },
  )
  comparar('Quiebres', quiebresBase, quiebresFilas.length,
    'las filas de la vista, paginadas')

  // ── 4 · LA PLATA PARADA ─────────────────────────────────────────────────
  //
  // Una suma, no un conteo: un corte en las filas da una suma más chica y
  // plausible, que es exactamente la forma de fallar que no se nota.
  const plataCodigo = Math.round(Number(abasto.plata_a_transferir ?? 0))
  const { filas: plataFilas } = await paginar<{ plata_que_no_hay_que_gastar: number }>(
    adm.from('transferir_antes_de_comprar')
      .select('producto_id, plata_que_no_hay_que_gastar').order('producto_id'),
    { maximo: 200_000 },
  )
  if (!plataFilas.length) {
    saltear('Abasto · plata parada: la vista está vacía')
  } else {
    const plataBase = Math.round(
      plataFilas.reduce((s, f) => s + Number(f.plata_que_no_hay_que_gastar ?? 0), 0))
    comparar('Abasto · plata que se resuelve transfiriendo', plataCodigo, plataBase,
      'la suma de todas las filas paginadas')
  }

  // ── 5 · LOS CANDADOS QUE DICEN REGISTRAR ────────────────────────────────
  //
  // Mismo tipo de mentira que las otras cuatro, en otra capa: el sistema dice
  // que dejó asentado algo que no quedó en ningún lado. En la v0.98 se arregló
  // la puerta y la pared quedó con el patrón; se encontró en la v0.99 probando
  // que el registro no sobrevive (antes=1, después=1).
  const { data: candados, error: eCand } =
    await adm.rpc('triggers_que_registran_y_revierten')
  if (eCand) throw new Error(`no se pudieron revisar los candados: ${eCand.message}`)
  const malos = (candados ?? []) as { funcion: string; tablas: string; por_que: string }[]
  if (!malos.length) {
    ok('Candados: ningún trigger escribe un registro que después revierte')
  } else {
    fallas++
    for (const m of malos) {
      console.log(
        `  FALLA  Candado ${m.funcion} (sobre ${m.tablas})\n` +
        `         ${m.por_que}.\n` +
        `         Un «raise exception» revierte la transacción entera, incluido el registro\n` +
        `         que la propia función acaba de insertar. Si hay que dejar asentado el\n` +
        `         intento, el rechazo va en una función que DEVUELVE el motivo, no que lo\n` +
        `         lanza. Y si es una pared, que no prometa registrar nada.`)
    }
  }

  console.log(
    fallas === 0
      ? `\nTODO BIEN${salteados ? ` · ${salteados} cruce(s) salteados por falta de datos` : ''}`
      : `\nFALLA · ${fallas} número(s) que no coinciden entre el código y la base`,
  )
  if (fallas > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FALLA · la verificación de coherencia no pudo correr:', e?.message ?? e)
  process.exit(1)
})
