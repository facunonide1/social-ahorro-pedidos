import { cookies } from 'next/headers'

import { createAdminClient } from '@/lib/supabase/server'

import { COOKIE_SIN_DEMO } from './estado-nombre'

/**
 * CUÁNTO DE LO QUE SE MUESTRA ES DE DEMOSTRACIÓN.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 *
 * Un sistema vacío se nota. Uno lleno de datos inventados que se comporta como
 * si estuviera operando, no — y es peor, porque la primera decisión que alguien
 * tome mirando esos números va a estar mal.
 *
 * El relevamiento del 27-ago encontró que los siete volúmenes más grandes son
 * demostración y que el panel de inicio mostraba cinco urgencias sacadas de
 * 7.620 ventas que nunca ocurrieron.
 *
 * ── EL INTERRUPTOR ──────────────────────────────────────────────────────────
 *
 * Una cookie, `nora_sin_demo`. Con el interruptor puesto, las pantallas que lo
 * respetan muestran SOLO lo real. Esa es la vista que hay que mirar antes de
 * darle el sistema a alguien: si está vacía, está vacía.
 *
 * Es una cookie y no una preferencia guardada en la base a propósito: es una
 * lente para mirar, no una configuración del negocio. Se prende, se mira y se
 * apaga.
 */

export { COOKIE_SIN_DEMO }

/** ¿Está puesto el interruptor de «ver sin demostración»? */
export function sinDemo(): boolean {
  return cookies().get(COOKIE_SIN_DEMO)?.value === '1'
}

export interface ConteoDemo {
  /** Cuántas filas de demostración hay, por concepto. */
  porConcepto: { concepto: string; filas: number }[]
  total: number
}

/**
 * Cuenta lo sembrado. Sólo lee: no oculta ni borra nada.
 *
 * La lista está escrita a mano y no sale de recorrer el esquema, porque lo que
 * importa no es cuántas tablas tienen la marca sino **qué ve una persona**: las
 * ventas del Centro de Datos y el stock de Operaciones son dos conceptos, no
 * seis tablas.
 */
export async function contarDemo(): Promise<ConteoDemo> {
  const adm = createAdminClient()
  const fuentes: { concepto: string; tabla: string }[] = [
    { concepto: 'ventas cargadas', tabla: 'ventas_diarias' },
    { concepto: 'productos del catálogo', tabla: 'productos_catalogo' },
    { concepto: 'stock por sucursal', tabla: 'stock_items' },
    { concepto: 'clientes', tabla: 'clientes' },
    { concepto: 'irregularidades de stock', tabla: 'irregularidades_stock' },
    { concepto: 'arqueos de caja', tabla: 'arqueos_caja' },
    { concepto: 'vencimientos', tabla: 'vencimientos' },
    { concepto: 'tareas', tabla: 'tareas' },
  ]

  const porConcepto: { concepto: string; filas: number }[] = []
  for (const f of fuentes) {
    const { count } = await adm
      .from(f.tabla)
      .select('*', { count: 'exact', head: true })
      .eq('es_demo', true)
    if ((count ?? 0) > 0) porConcepto.push({ concepto: f.concepto, filas: count ?? 0 })
  }

  return { porConcepto, total: porConcepto.reduce((a, x) => a + x.filas, 0) }
}
