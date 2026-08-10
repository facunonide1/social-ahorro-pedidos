/**
 * LOS TRES PASOS DE LA PRUEBA DE RANGO.
 *
 * Uso: npx tsx scripts/fabrica-probar-rango.ts
 *
 *   1 · guardar un valor FUERA de rango → rechazado con motivo legible
 *   2 · guardar un valor válido EN EL LÍMITE → aceptado
 *   3 · corromper el valor en la base a algo fuera de rango → el lector cae al
 *       código y registra el fallback
 *
 * El paso 3 escribe directo en la tabla, salteando el escritor, porque de eso se
 * trata: probar que el lector se defiende de un valor que el escritor nunca
 * habría aceptado. Deja todo como estaba.
 */
import { createAdminClient } from '../lib/supabase/server'
import { escribirOverride } from '../lib/fabrica/escritor'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { overridesActuales } from '../lib/fabrica/overrides'
import { parametro } from '../lib/os/definicion'
import { versionActual } from '../lib/fabrica/versiones'

const POOL = 'stock'
const CLAVE = 'dias_aviso_vencimiento'
const EN_CODIGO = 30
const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

let fallo = false
function paso(n: number, ok: boolean, texto: string) {
  if (!ok) fallo = true
  console.log(`\n${ok ? '✓' : '✗'} PASO ${n} · ${texto}`)
}

async function main() {
  const adm = createAdminClient()
  const version = (await versionActual(POOL))!
  const p = (version.manifiesto.configurable ?? []).find((x) => x.clave === CLAVE)!
  const estado = (await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })).find(
    (e) => e.clave === POOL,
  )!
  const original = await overridesActuales(estado.instalacionId)
  console.log(
    `${POOL}.${CLAVE} · tipo ${p.tipo} · rango ${p.minimo}–${p.maximo} ${p.unidad} · gobierna ${await parametro(POOL, CLAVE, EN_CODIGO)}`,
  )

  /* ── 1 · fuera de rango → rechazado ───────────────────────────────── */
  const fuera = await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: { ...original?.overrides, configurable: { [CLAVE]: -5 } },
    motivo: 'Prueba de rango: -5 días no avisa nunca.',
    autorId: AUTOR,
  })
  const motivo = fuera.rechazos?.[0]?.motivo ?? fuera.error ?? ''
  paso(1, !fuera.ok && /por debajo del mínimo/.test(motivo), `rechazado: ${motivo}`)

  // Y la contraprueba del rechazo: un entero con decimales, y un texto.
  const decimal = await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: { ...original?.overrides, configurable: { [CLAVE]: 7.5 } },
    motivo: 'Prueba de rango: 7.5 días no significa nada.',
    autorId: AUTOR,
  })
  console.log(`    y 7.5: ${decimal.rechazos?.[0]?.motivo ?? decimal.error ?? 'ACEPTADO (mal)'}`)
  if (decimal.ok) fallo = true

  /* ── 2 · en el límite → aceptado ──────────────────────────────────── */
  const limite = p.maximo!
  const enLimite = await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: { ...original?.overrides, configurable: { [CLAVE]: limite } },
    motivo: `Prueba de rango: ${limite} días es el máximo declarado y tiene que entrar.`,
    autorId: AUTOR,
  })
  const gobernando = await parametro(POOL, CLAVE, EN_CODIGO)
  paso(
    2,
    enLimite.ok && gobernando === limite,
    `${limite} ${p.unidad} aceptado y gobernando (el lector devuelve ${gobernando})`,
  )

  /* ── 3 · corromper la base → el lector cae al código ──────────────── */
  // Se escribe SALTEANDO el escritor, que es de lo que se trata: el rango pudo
  // haberse achicado después de guardar, o alguien puede tocar la base por
  // afuera. El lector tiene que defenderse igual.
  const corte = new Date().toISOString()
  const actual = await overridesActuales(estado.instalacionId)
  await adm
    .from('fab_instalacion_versiones')
    .update({ overrides: { ...actual!.overrides, configurable: { [CLAVE]: 99999 } } })
    .eq('id', actual!.id)

  const tras = await parametro(POOL, CLAVE, EN_CODIGO)

  // El lector registra el fallback SIN esperarlo (`void registrar(...)`): una
  // pantalla no puede quedarse esperando a que la fábrica lleve la cuenta. Así
  // que la prueba sí espera, porque si no mide antes de que se escriba y lee un
  // cero que no significa nada. El cero mentiroso fabricado por la prueba,
  // otra vez, ahora por una carrera.
  await new Promise((r) => setTimeout(r, 1500))

  const { data: eventos } = await adm
    .from('fab_lector_eventos')
    .select('tipo, aspecto, motivo, detalle')
    .eq('pool_clave', POOL)
    .gte('ocurrido_at', corte)
  const fb = ((eventos ?? []) as { tipo: string; motivo: string | null }[]).filter(
    (e) => e.tipo === 'fallback',
  )
  paso(
    3,
    tras === EN_CODIGO && fb.length > 0,
    `con 99999 guardado, el sector recibe ${tras} (el valor de su código) y quedó ${fb.length} fallback registrado`,
  )
  for (const e of fb) console.log(`    ${e.motivo}`)

  /* ── Se deja todo como estaba ─────────────────────────────────────── */
  await adm
    .from('fab_instalacion_versiones')
    .update({ overrides: { ...actual!.overrides, configurable: { [CLAVE]: limite } } })
    .eq('id', actual!.id)
  const vuelta = await escribirOverride({
    proyectoId: PROYECTO_SOCIAL_AHORRO,
    clave: POOL,
    overrides: { ...original?.overrides },
    motivo: 'Fin de la prueba de rango: vuelve el override a como estaba.',
    autorId: AUTOR,
  })
  const alFinal = await parametro(POOL, CLAVE, EN_CODIGO)
  console.log(
    `\nrestaurado: ${vuelta.ok ? 'sí' : 'NO'} · el parámetro gobierna ${alFinal} (esperado ${EN_CODIGO})`,
  )
  if (alFinal !== EN_CODIGO) fallo = true

  // Los eventos de esta prueba son PROVOCADOS: se limpian. Forzar un fallback
  // para probar el camino es legítimo; dejarlo en el log como si hubiera pasado
  // de verdad es el hallazgo 15.
  const { count } = await adm
    .from('fab_lector_eventos')
    .delete({ count: 'exact' })
    .eq('pool_clave', POOL)
    .eq('aspecto', 'parametros')
    .gte('ocurrido_at', corte)
  console.log(`eventos provocados por la prueba, borrados: ${count ?? 0}`)

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
