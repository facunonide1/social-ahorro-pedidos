/**
 * EL MARCO DE UNA PRUEBA: prender la marca antes, limpiar después.
 *
 * No es un script: lo importan los `fabrica-probar-*`. Se llama `fabrica-` para
 * que se lo lleve la prueba de extracción con el resto.
 *
 * ── EL ORDEN IMPORTA ────────────────────────────────────────────────────────
 *
 * `abrirPrueba()` va ANTES de la primera escritura, no en el medio: lo que se
 * escriba antes nace sin marca y queda como huérfano. Por eso se llama arriba
 * de todo, y por eso `enPrueba()` lee la variable en cada inserción en vez de
 * capturarla al importar el módulo.
 *
 * `cerrarPrueba()` borra lo marcado. Si la corrida se muere antes de llegar,
 * lo que quedó igual está marcado y lo levanta
 * `scripts/fabrica-limpiar-pruebas.ts --limpiar`. Ese es todo el punto de
 * marcar al crear: que una corrida rota no deje nada indistinguible.
 */
import { createClient } from '@supabase/supabase-js'

export function abrirPrueba(): void {
  process.env.FABRICA_PRUEBA = '1'
}

/** Borra lo que esta corrida —y cualquier corrida rota anterior— dejó marcado. */
export async function cerrarPrueba(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return 0
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await sb.rpc('fab_limpiar_pruebas')
  if (error) {
    console.log(`\n  ⚠ no se pudo limpiar: ${error.message}`)
    console.log('    queda marcado. Corré: npx tsx scripts/fabrica-limpiar-pruebas.ts --limpiar')
    return 0
  }
  const filas = (data ?? []) as { tabla: string; borradas: number; vigentes: number }[]
  const total = filas.reduce((a, f) => a + f.borradas, 0)
  const vigentes = filas.reduce((a, f) => a + f.vigentes, 0)
  console.log(
    `\n  limpieza: ${total} artefacto(s) de prueba borrado(s)` +
      (vigentes ? ` · ${vigentes} quedaron porque gobiernan hoy` : ''),
  )
  return total
}
