/**
 * ESCRIBIR EN TANDAS.
 *
 * Un insert o upsert de decenas de miles de filas viaja en un solo cuerpo y
 * corre en una sola sentencia: pasa el statement timeout y el cron se cae a la
 * mitad. En tandas, cada sentencia es corta y un error dice cuánto llegó a
 * entrar. Cualquier error corta: nunca se sigue como si nada.
 */

type Adm = { from: (t: string) => any }

export const TANDA_ESCRITURA = 500

export function enTandas<T>(xs: readonly T[], n: number): T[][] {
  if (!Number.isInteger(n) || n < 1) throw new Error('enTandas: n tiene que ser un entero ≥ 1')
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Inserta en tandas y corta en el primer error. Devuelve cuántas filas entraron. */
export async function insertarEnTandas(
  adm: Adm,
  tabla: string,
  filas: readonly Record<string, unknown>[],
  tanda: number = TANDA_ESCRITURA,
): Promise<number> {
  let n = 0
  for (const grupo of enTandas(filas, tanda)) {
    const { error } = await adm.from(tabla).insert(grupo)
    if (error) throw new Error(`no se pudo insertar en ${tabla} (llevaba ${n}): ${error.message ?? error}`)
    n += grupo.length
  }
  return n
}

/** Upsert en tandas con el mismo `onConflict`. Corta en el primer error. */
export async function upsertEnTandas(
  adm: Adm,
  tabla: string,
  filas: readonly Record<string, unknown>[],
  onConflict: string,
  tanda: number = TANDA_ESCRITURA,
): Promise<number> {
  let n = 0
  for (const grupo of enTandas(filas, tanda)) {
    const { error } = await adm.from(tabla).upsert(grupo, { onConflict })
    if (error) throw new Error(`no se pudo actualizar ${tabla} (llevaba ${n}): ${error.message ?? error}`)
    n += grupo.length
  }
  return n
}
