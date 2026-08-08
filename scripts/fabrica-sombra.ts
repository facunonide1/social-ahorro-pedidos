/**
 * Corre el modo sombra sobre las pantallas cableadas de un pool.
 *
 * Simula lo que hace cada pantalla al abrirse y deja registradas las
 * diferencias. Existe para poder mirar el resultado sin esperar a que alguien
 * navegue por producción durante días.
 *
 * Uso: npx tsx scripts/fabrica-sombra.ts [pool]
 */
import { createClient } from '@supabase/supabase-js'
import { compararEnSombra } from '../lib/fabrica/lector'
import { PROYECTO_SOCIAL_AHORRO } from '../lib/fabrica/flag'

/**
 * Las pantallas cableadas y el título que su código usa.
 *
 * Es una lista a mano y no vale la pena disimularlo: el manifiesto declara qué
 * pantallas existen, pero no cuáles consultan al lector. Un pool en sombra sin
 * pantallas cableadas da 0 diferencias por no mirar nada, que es el peor cero
 * posible — parece que está todo bien.
 */
const CABLEADAS: Record<string, [string, string][]> = {
  documentos: [
    ['/admin/finanzas/documentos', 'Documentos a pagar'],
    ['/admin/finanzas/documentos/lote', 'Cargar facturas en lote'],
    ['/admin/finanzas/documentos/revision/[id]', 'Revisar documento'],
  ],
  stock: [
    ['/admin/operaciones', 'Operaciones'],
    ['/admin/operaciones/stock', 'Stock'],
    ['/admin/operaciones/transferencias', 'Transferencias entre sucursales'],
    ['/admin/operaciones/vencimientos', 'Vencimientos'],
    ['/admin/operaciones/recartelado', 'Recartelado'],
    ['/admin/operaciones/inventarios', 'Inventarios físicos'],
    ['/admin/operaciones/control-zonas', 'Control de stock por zonas'],
    ['/admin/operaciones/alertas', 'Alertas de stock'],
    ['/admin/operaciones/analisis', 'Análisis de ventas'],
    ['/admin/operaciones/reposicion', 'Reposición'],
    ['/admin/operaciones/irregularidades', 'Irregularidades de stock'],
    ['/admin/operaciones/asistente', 'NORA · Asistente'],
  ],
}

export { CABLEADAS }

const POOL = process.argv[2] ?? 'stock'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const pantallas = CABLEADAS[POOL] ?? []
  console.log(`\nPool: ${POOL} · pantallas cableadas: ${pantallas.length}`)

  for (const [ruta, enCodigo] of pantallas) {
    await compararEnSombra(POOL, ruta, enCodigo)
  }

  const { data } = await sb
    .from('fab_lector_eventos')
    .select('tipo, motivo, detalle')
    .eq('proyecto_id', PROYECTO_SOCIAL_AHORRO)
    .eq('pool_clave', POOL)
    .order('ocurrido_at', { ascending: false })

  const filas = (data ?? []) as {
    tipo: string
    motivo: string | null
    detalle: { ruta?: string; en_codigo?: string; en_declaracion?: string | null }
  }[]
  const dif = filas.filter((f) => f.tipo === 'diferencia')

  console.log(`\nDiferencias: ${dif.length}\n`)
  for (const d of dif) {
    console.log(`  ${d.detalle.ruta}`)
    console.log(`    código:      "${d.detalle.en_codigo}"`)
    console.log(
      `    declaración: ${d.detalle.en_declaracion === null ? '(no la declara)' : `"${d.detalle.en_declaracion}"`}`,
    )
  }
  console.log('')
}

if (require.main === module) main()
