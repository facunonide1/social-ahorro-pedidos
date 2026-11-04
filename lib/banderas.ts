/**
 * BANDERAS DE FUNCIONALIDAD.
 *
 * Regla 4: todo lo nuevo va detrás de una bandera apagada por defecto. En
 * producción nadie ve nada hasta que Facundo la prende.
 *
 * Una bandera es una variable de entorno `NORA_BANDERA_<NOMBRE>` leída en el
 * servidor. **Ausente es apagada**, y solo `on` la prende: `true`, `1` o un
 * `on` con espacios no, para que un valor mal tipeado no prenda nada.
 *
 * Se eligió una variable y no una tabla porque una tabla es una migración y
 * sin staging no se puede probar su `down`. Prenderla es una acción en Vercel,
 * que hace Facundo. La alternativa (tabla `banderas`) quedó anotada.
 */

export type Bandera = 'comparador_precios'

export function nombreDeVariable(b: Bandera): string {
  return `NORA_BANDERA_${b.toUpperCase()}`
}

export function banderaPrendida(
  b: Bandera,
  entorno: Record<string, string | undefined> = process.env,
): boolean {
  return entorno[nombreDeVariable(b)] === 'on'
}
