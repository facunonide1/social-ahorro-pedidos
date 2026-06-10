/**
 * Saludo según la hora del día (zona Argentina), independiente del
 * timezone del servidor (en Vercel el server corre en UTC).
 *
 *   < 13:00 → "Buen día"
 *   < 19:00 → "Buenas tardes"
 *   ≥ 19:00 → "Buenas noches"
 */

const TZ = 'America/Argentina/Buenos_Aires'

/** Hora 0-23 en zona AR. */
export function horaArgentina(date: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: TZ,
  }).format(date)
  return Number(h)
}

/** Prefijo del saludo sin nombre ("Buen día", "Buenas tardes", …). */
export function saludoBase(date: Date = new Date()): string {
  const h = horaArgentina(date)
  if (h < 13) return 'Buen día'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Primer nombre a partir de un nombre completo o email. */
export function primerNombre(
  nombre?: string | null,
  email?: string | null,
): string | null {
  const n = nombre?.trim()
  if (n) return n.split(/\s+/)[0]
  const e = email?.trim()
  if (e) return e.split('@')[0]
  return null
}

/**
 * Saludo completo: "Buen día, Facu". Si no hay nombre, solo el prefijo.
 */
export function saludoHora(
  nombre?: string | null,
  email?: string | null,
  date: Date = new Date(),
): string {
  const base = saludoBase(date)
  const n = primerNombre(nombre, email)
  return n ? `${base}, ${n}` : base
}
