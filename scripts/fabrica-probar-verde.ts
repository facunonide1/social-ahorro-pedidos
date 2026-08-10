/**
 * EL CARRIL VERDE, DE PUNTA A PUNTA — con el interruptor prendido SÓLO durante
 * la prueba y apagado al terminar.
 *
 * Uso: npx tsx scripts/fabrica-probar-verde.ts
 *
 * ── POR QUÉ SE PRUEBA UN MECANISMO QUE QUEDA APAGADO ────────────────────────
 *
 * El verde no se enciende en v0.69: las razones están en CARRILES.md y no se
 * fuerzan. Pero un mecanismo que nunca se ejecutó no es un mecanismo, es una
 * intención — y el día que haya evidencia, encenderlo tiene que ser un
 * interruptor y no una sesión de desarrollo.
 *
 * Así que se prende acá, se ejercita, y se apaga. Lo que queda es la prueba de
 * que funciona, no el carril encendido.
 *
 * Deja el parámetro y el interruptor como estaban.
 */
import { aplicar, listarPropuestas, proponer, revertirPropuesta } from '../lib/fabrica/propuestas'
import { createAdminClient } from '../lib/supabase/server'
import { parametro } from '../lib/os/definicion'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

const POOL = 'stock'
const CLAVE = 'dias_aviso_vencimiento'
const EN_CODIGO = 30
const NUEVO = 45
const TIPO = 'umbral'
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function main() {
  const adm = createAdminClient()

  // El interruptor, prendido a mano y sólo para este tipo de campo.
  await adm
    .from('fab_carriles_habilitados')
    .upsert(
      { proyecto_id: PROYECTO_SOCIAL_AHORRO, tipo_campo: TIPO, habilitado_por: AUTOR },
      { onConflict: 'proyecto_id,tipo_campo' },
    )
  console.log(`Interruptor del carril verde PRENDIDO para "${TIPO}" (sólo durante esta prueba).`)

  /* ── 1 · una propuesta que cae en verde ───────────────────────────── */
  const r = await proponer({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    // El peso manda sobre el interruptor: este parámetro es `operativo`, así que
    // NO debería llegar a verde ni con el tipo habilitado. Es la primera cosa
    // que hay que comprobar.
    cambio: { configurable: { [CLAVE]: NUEVO } },
    porque: 'Prueba del carril verde de v0.69.',
    autorId: AUTOR,
  })
  const p = r.propuesta
  paso(
    1,
    p?.carril === 'amarillo',
    `un parámetro OPERATIVO cae en ${p?.carril} aunque el tipo esté habilitado: el peso manda sobre el interruptor`,
  )

  /* ── 2 · el mecanismo, sobre algo que sí es verde ─────────────────── */
  // No hay ningún `inocuo` en un pool prendido, así que el camino verde real no
  // se puede disparar con datos de producción. Lo que sí se puede probar es el
  // mecanismo: aplicar con `automatica: true` y verificar que queda marcado,
  // visible y reversible. Se dice que es eso y no otra cosa.
  const aplicada = p
    ? await aplicar({
        propuestaId: p.id,
        autorId: null,
        nota: 'Carril verde: se aplicó solo (mecanismo ejercitado a mano).',
        automatica: true,
      })
    : { ok: false }
  const enVivo = await parametro(POOL, CLAVE, EN_CODIGO)
  paso(2, aplicada.ok && enVivo === NUEVO, `aplicada sin firma humana · el parámetro gobierna ${enVivo}`)

  /* ── 3 · aparece en el Taller como aplicada, y marcada ────────────── */
  const todas = await listarPropuestas(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })
  const enCola = todas.find((x) => x.id === p?.id)
  paso(
    3,
    enCola?.estado === 'aplicada' && enCola.aplicadaAutomaticamente && enCola.queCambia.length > 0,
    `estado ${enCola?.estado} · marcada como automática: ${enCola?.aplicadaAutomaticamente} · con diff de ${enCola?.queCambia.length} línea(s)`,
  )
  console.log(`    ${enCola?.queCambia[0]?.texto.slice(0, 150)}`)
  console.log(`    quién firmó: ${enCola?.decididaAt ? (enCola.notaDecision ?? '—') : 'nadie'}`)

  /* ── 4 · se deshace de un toque ───────────────────────────────────── */
  const revertida = p
    ? await revertirPropuesta({
        propuestaId: p.id,
        autorId: AUTOR,
        nota: 'Fin de la prueba del carril verde: se deshace de un toque.',
      })
    : { ok: false }
  const alFinal = await parametro(POOL, CLAVE, EN_CODIGO)
  paso(4, revertida.ok && alFinal === EN_CODIGO, `revertida · el parámetro volvió a ${alFinal}`)

  /* ── El interruptor vuelve a estar APAGADO ────────────────────────── */
  await adm
    .from('fab_carriles_habilitados')
    .delete()
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('tipo_campo', TIPO)
  const { count } = await adm
    .from('fab_carriles_habilitados')
    .select('tipo_campo', { count: 'exact', head: true })
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
  console.log(`\nInterruptores de carril verde habilitados al terminar: ${count ?? 0} (tiene que ser 0)`)
  if ((count ?? 0) !== 0) fallo = true

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
