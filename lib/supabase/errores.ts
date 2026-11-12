/**
 * Junta los errores de varias lecturas de una pantalla. Una lectura que falla
 * con `{ data: null }` o `{ count: null }` se muestra como 0 si nadie mira el
 * error: un número que miente sin avisar. Las pantallas lo usan para decir qué
 * no se pudo leer (components/shared/aviso-lectura.tsx).
 */
export type ResultadoLectura = { error?: { message?: string } | null }

export function erroresDeLectura(lecturas: Record<string, ResultadoLectura>): { que: string; mensaje: string }[] {
  return Object.entries(lecturas)
    .filter(([, r]) => r?.error)
    .map(([que, r]) => ({ que, mensaje: r.error?.message ?? 'error desconocido' }))
}

/** Un permiso denegado de PostgREST/RLS no es «vacío» ni «se cayó»: es «no te toca». */
export function esSinPermiso(mensaje: string): boolean {
  return /permission denied|row-level security|42501/i.test(mensaje)
}
