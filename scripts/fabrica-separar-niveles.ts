/**
 * Mudanza de v0.64: los títulos exactos de Social Ahorro pasan a ser overrides
 * de la instalación, y la pieza vuelve a tener etiquetas de catálogo.
 *
 * Lo que esta separación EXPLICA: en v0.62 y v0.63 aparecieron 12 "títulos mal
 * declarados" y se corrigieron metiendo el texto exacto de Social Ahorro dentro
 * de la pieza compartida. No eran errores de declaración: era una confusión de
 * nivel. "Transferencias entre sucursales" nunca fue una propiedad de la pieza
 * Stock — es cómo le dice ESTE negocio.
 *
 * Uso: npx tsx scripts/fabrica-separar-niveles.ts
 */
import { createClient } from '@supabase/supabase-js'
import { escribirOverride } from '../lib/fabrica/escritor'
import { versionActual } from '../lib/fabrica/versiones'
import { overridesActuales, resolver } from '../lib/fabrica/overrides'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'
import { tituloDePantalla } from '../lib/os/definicion'

const AUTOR = '5bf8468f-c6a2-4231-8bcb-3c943777bf03'

/** Los títulos exactos que muestran las pantallas de Social Ahorro. */
const DE_SOCIAL_AHORRO: Record<string, Record<string, string>> = {
  documentos: {
    '/admin/finanzas/documentos': 'Documentos a pagar',
    '/admin/finanzas/documentos/lote': 'Cargar facturas en lote',
    '/admin/finanzas/documentos/revision/[id]': 'Revisar documento',
  },
  stock: {
    '/admin/operaciones': 'Operaciones',
    '/admin/operaciones/stock': 'Stock',
    '/admin/operaciones/transferencias': 'Transferencias entre sucursales',
    '/admin/operaciones/vencimientos': 'Vencimientos',
    '/admin/operaciones/recartelado': 'Recartelado',
    '/admin/operaciones/inventarios': 'Inventarios físicos',
    '/admin/operaciones/control-zonas': 'Control de stock por zonas',
    '/admin/operaciones/alertas': 'Alertas de stock',
    '/admin/operaciones/analisis': 'Análisis de ventas',
    '/admin/operaciones/reposicion': 'Reposición',
    '/admin/operaciones/irregularidades': 'Irregularidades de stock',
    '/admin/operaciones/asistente': 'NORA · Asistente',
  },
}

/** La brecha de CRM es un hecho sobre ESTE sistema, no sobre la pieza. */
const BRECHAS_DE_SOCIAL_AHORRO: Record<string, Record<string, Record<string, string>>> = {
  clientes: {
    cuidador_de_clientes: {
      correr_automatizaciones:
        'El cron corre y manda sin confirmación. La regla la escribió una persona una vez, pero nadie mira antes de cada envío. Falta el paso de confirmación entre armar la campaña y soltarla.',
    },
  },
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function instalacionDe(clave: string): Promise<string | null> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { id: string } | null)?.id ?? null
}

async function estadoLector(clave: string): Promise<string> {
  const { data } = await sb
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { lector: string } | null)?.lector ?? 'apagado'
}

async function main() {
  let fallo = false
  console.log('\n── ANTES ────────────────────────────────────────────────')
  for (const [clave, titulos] of Object.entries(DE_SOCIAL_AHORRO)) {
    const ruta = Object.keys(titulos)[0]
    console.log(`  ${clave}: ${ruta} → "${await tituloDePantalla(clave, ruta, 'FALLBACK')}"`)
  }

  console.log('\n── MUDANZA ──────────────────────────────────────────────')
  for (const [clave, titulos] of Object.entries(DE_SOCIAL_AHORRO)) {
    const r = await escribirOverride({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave,
      overrides: { titulos },
      motivo:
        'Separación de niveles v0.64: los títulos exactos de Social Ahorro son de ESTE proyecto, no de la pieza compartida.',
      autorId: AUTOR,
    })
    if (r.ok) console.log(`  ✓ ${clave.padEnd(12)} override v${r.numero} · ${Object.keys(titulos).length} títulos`)
    else {
      fallo = true
      console.log(`  ✗ ${clave}: ${r.error ?? r.rechazos?.map((x) => `${x.campo}: ${x.motivo}`).join(' · ')}`)
    }
  }

  for (const [clave, agentes] of Object.entries(BRECHAS_DE_SOCIAL_AHORRO)) {
    const brechas: Record<string, { brechas: Record<string, string> }> = {}
    for (const [ag, accs] of Object.entries(agentes)) brechas[ag] = { brechas: accs }
    const r = await escribirOverride({
      proyectoId: PROYECTO_SOCIAL_AHORRO,
      clave,
      overrides: { agentes: brechas },
      motivo:
        'Separación de niveles v0.64: la brecha es un hecho sobre este sistema, no sobre la pieza. Otro proyecto puede tener la misma pieza sin ella.',
      autorId: AUTOR,
    })
    if (r.ok) console.log(`  ✓ ${clave.padEnd(12)} override v${r.numero} · brecha del proyecto`)
    else {
      fallo = true
      console.log(`  ✗ ${clave}: ${r.error ?? ''}`)
    }
  }

  console.log('\n── DESPUÉS ──────────────────────────────────────────────')
  // Se verifica la RESOLUCIÓN (pieza + override), no lo que devuelve el lector:
  // un pool en sombra devuelve el título del código a propósito, y confundir
  // esas dos cosas es leer mal la prueba.
  for (const [clave, titulos] of Object.entries(DE_SOCIAL_AHORRO)) {
    const v = await versionActual(clave)
    const inst = await instalacionDe(clave)
    const propios = inst ? await overridesActuales(inst) : null
    const { manifiesto: efectivo, origenes } = resolver(v!.manifiesto, propios?.overrides ?? null)

    for (const [ruta, esperado] of Object.entries(titulos)) {
      const enLaPieza = v?.manifiesto.pantallas.find((p) => p.ruta === ruta)?.titulo
      const enElProyecto = efectivo.pantallas.find((p) => p.ruta === ruta)?.titulo
      const origen = origenes[`pantallas.${ruta}.titulo`]
      const ok = enElProyecto === esperado && origen === 'instalacion'
      if (!ok) fallo = true
      console.log(
        `  ${ok ? '✓' : '✗'} ${ruta}\n      pieza: "${enLaPieza}" → proyecto: "${enElProyecto}" (${origen})`,
      )
    }
  }

  console.log('\n── LO QUE DEVUELVE EL LECTOR HOY ────────────────────────')
  for (const clave of Object.keys(DE_SOCIAL_AHORRO)) {
    const estado = await estadoLector(clave)
    const ruta = Object.keys(DE_SOCIAL_AHORRO[clave])[0]
    const enCodigo = DE_SOCIAL_AHORRO[clave][ruta]
    const real = await tituloDePantalla(clave, ruta, enCodigo)
    console.log(
      `  ${clave.padEnd(12)} lector=${estado.padEnd(9)} → "${real}"` +
        (estado === 'prendido' ? ' (gobierna el override)' : ' (usa el código, como corresponde)'),
    )
  }

  console.log('')
  process.exit(fallo ? 1 : 0)
}

main()
