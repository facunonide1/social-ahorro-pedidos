/**
 * Detección liviana de "esto parece una tarea" (OS-2b · C).
 *
 * Client-safe (solo regex, sin imports server). La usa el chip de NORA en el
 * chat y comparte criterio con la detección de nora-chat.ts. NORA sugiere,
 * nunca convierte sola.
 */
const KEYWORDS =
  /(\bfalta\b|faltan|faltante|vencid\w*|\broto\b|\brota\b|se rompi|romp[ié]|corregir|correcci[oó]n|hay que|limpiar|revis[aá]|reponer|repon[eé]|\bmal\b|no anda|no funciona|se cort[oó]|p[eé]rdida|derrame)/i

export function pareceTarea(texto: string | null | undefined): boolean {
  if (!texto) return false
  return KEYWORDS.test(texto)
}
