/**
 * Le da procedencia a los valores que ya estaban declarados.
 *
 * Uso: npx tsx scripts/fabrica-migrar-procedencia.ts
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 *
 * Recorre el historial de versiones —de pieza y de instalación—, de la más
 * vieja a la más nueva, y por cada versión registra qué campos cambió respecto
 * de la anterior, con el motivo y el autor que esa versión ya guardaba. La
 * historia estaba ahí; lo que faltaba era leerla por campo en vez de por
 * versión.
 *
 * ── LO QUE NO SE PUEDE RECONSTRUIR ──────────────────────────────────────────
 *
 * La primera versión de cada pieza no tiene "anterior", así que sus valores no
 * cambiaron respecto de nada. Ésos quedan con DECLARACION_INICIAL, que es una
 * respuesta y no un hueco: dejarlos vacíos haría que "no sé de dónde salió" y
 * "nadie lo tocó nunca" se vean igual, y son cosas distintas.
 *
 * Y la propuesta de origen no se puede recuperar: las versiones no la guardan.
 * Queda en null y se nota. Desde v0.67 sí viaja.
 *
 * Es idempotente: si ya hay procedencia, no vuelve a escribir.
 */
import { createAdminClient } from '../lib/supabase/server'
import {
  camposQueCambian,
  camposQueCambianEnLaPieza,
  DECLARACION_INICIAL,
  registrarProcedencia,
} from '../lib/fabrica/procedencia'
import { estadoDelLector, PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import type { Manifiesto } from '../lib/fabrica/tipos'
import type { Overrides } from '../lib/fabrica/overrides'

async function main() {
  const adm = createAdminClient()

  const { count } = await adm.from('fab_procedencia').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    console.log(`Ya hay ${count} fila(s) de procedencia. No se vuelve a migrar.`)
    return
  }

  let filas = 0

  /* ── Las piezas ───────────────────────────────────────────────────── */
  const { data: pools } = await adm.from('fab_pools').select('id, clave').order('clave')
  for (const pool of ((pools ?? []) as { id: string; clave: string }[])) {
    const { data: versiones } = await adm
      .from('fab_pool_versiones')
      .select('id, numero, manifiesto, notas_cambio, created_at, created_by, revierte_a')
      .eq('pool_id', pool.id)
      .order('numero', { ascending: true })

    const lista = (versiones ?? []) as {
      id: string
      numero: number
      manifiesto: Manifiesto
      notas_cambio: string | null
      created_at: string
      created_by: string | null
      revierte_a: string | null
    }[]

    let previa: Manifiesto | null = null
    for (const v of lista) {
      const cambios = previa
        ? camposQueCambianEnLaPieza(previa, v.manifiesto)
        : // La primera versión: todo lo que declara nace acá.
          camposQueCambianEnLaPieza({ ...v.manifiesto, pantallas: [], configurable: [] }, v.manifiesto)
      filas += await registrarProcedencia({
        nivel: 'pool',
        poolClave: pool.clave,
        cambios,
        motivo: previa ? (v.notas_cambio?.trim() || 'Sin motivo registrado en esa versión.') : DECLARACION_INICIAL,
        versionId: v.id,
        esReversion: !!v.revierte_a,
        autorId: v.created_by,
        decididoAt: v.created_at,
      })
      previa = v.manifiesto
    }
    if (lista.length) console.log(`  pieza ${pool.clave.padEnd(14)} ${lista.length} versión(es)`)
  }

  /* ── Las instalaciones ────────────────────────────────────────────── */
  for (const e of await estadoDelLector(PROYECTO_SOCIAL_AHORRO, { conAdmin: true })) {
    const { data: versiones } = await adm
      .from('fab_instalacion_versiones')
      .select('id, numero, overrides, notas_cambio, created_at, created_by, revierte_a')
      .eq('instalacion_id', e.instalacionId)
      .order('numero', { ascending: true })

    const lista = (versiones ?? []) as {
      id: string
      numero: number
      overrides: Overrides
      notas_cambio: string | null
      created_at: string
      created_by: string | null
      revierte_a: string | null
    }[]

    let previos: Overrides | null = null
    for (const v of lista) {
      filas += await registrarProcedencia({
        nivel: 'instalacion',
        poolClave: e.clave,
        proyectoId: PROYECTO_SOCIAL_AHORRO,
        cambios: camposQueCambian(previos, v.overrides),
        motivo: v.notas_cambio?.trim() || 'Sin motivo registrado en esa versión.',
        versionId: v.id,
        esReversion: !!v.revierte_a,
        autorId: v.created_by,
        decididoAt: v.created_at,
      })
      previos = v.overrides
    }
    if (lista.length) console.log(`  instal ${e.clave.padEnd(13)} ${lista.length} versión(es)`)
  }

  console.log(`\n${filas} fila(s) de procedencia escritas.`)

  // No se le cree al número sin mirarlo: cuántos campos quedaron con
  // procedencia y cuántas reversiones se detectaron.
  const { data: resumen } = await adm
    .from('fab_procedencia')
    .select('nivel, es_reversion, motivo')
    .limit(5000)
  const r = (resumen ?? []) as { nivel: string; es_reversion: boolean; motivo: string }[]
  console.log(
    `  de pieza: ${r.filter((x) => x.nivel === 'pool').length} · de instalación: ${r.filter((x) => x.nivel === 'instalacion').length}`,
  )
  console.log(
    `  reversiones: ${r.filter((x) => x.es_reversion).length} · de la declaración inicial: ${r.filter((x) => x.motivo === DECLARACION_INICIAL).length} · sin motivo en la versión: ${r.filter((x) => x.motivo.startsWith('Sin motivo')).length}`,
  )
  console.log('')
}

main()
