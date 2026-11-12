/**
 * A qué droguería pertenece un archivo. Se mira el nombre, la carpeta y la
 * cabecera, y se cruza con la tabla de proveedores. Si dos encajan, no se
 * elige: la lista queda en previa.
 */

export type ProveedorRef = { id: string; razonSocial: string }

export type PistaProveedor = {
  nombreArchivo?: string | null
  ruta?: string | null
  encabezado?: string | null
  pista?: string | null
}

const ALIAS: { re: RegExp; aguja: string }[] = [
  { re: /ceos/, aguja: 'ceos' },
  { re: /distrifarm/, aguja: 'distrifarm' },
  { re: /vannier/, aguja: 'vannier' },
  { re: /mayorsur|mayor sur/, aguja: 'mayorsur' },
  { re: /\bnorma\b/, aguja: 'norma' },
  { re: /asopro/, aguja: 'asopro' },
  // Antes que «monroe»: si no, «Monroe Americana» cae en un proveedor que sólo se llama Monroe.
  { re: /monroe americana/, aguja: 'monroe americana' },
  { re: /monroe/, aguja: 'monroe' },
  { re: /omicron/, aguja: 'omicron' },
  { re: /farmasun/, aguja: 'farmasun' },
  { re: /distrisam/, aguja: 'distrisam' },
  { re: /generia/, aguja: 'generia' },
  { re: /global med/, aguja: 'global' },
  { re: /\blatina\b/, aguja: 'latina' },
]

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function detectarProveedor(
  pista: PistaProveedor,
  proveedores: ProveedorRef[],
): { id: string; razonSocial: string; via: 'archivo' | 'ruta' | 'cabecera' | 'pista' } | null {
  const partes: { texto: string; via: 'archivo' | 'ruta' | 'cabecera' | 'pista' }[] = []
  if (pista.nombreArchivo) partes.push({ texto: pista.nombreArchivo, via: 'archivo' })
  if (pista.ruta) partes.push({ texto: pista.ruta, via: 'ruta' })
  if (pista.encabezado) partes.push({ texto: pista.encabezado, via: 'cabecera' })
  if (pista.pista) partes.push({ texto: pista.pista, via: 'pista' })

  let aguja: string | null = null
  let via: 'archivo' | 'ruta' | 'cabecera' | 'pista' = 'archivo'
  for (const parte of partes) {
    const n = norm(parte.texto)
    const hit = ALIAS.find((a) => a.re.test(n))
    if (hit) { aguja = hit.aguja; via = parte.via; break }
  }
  if (!aguja) return null

  const cands = proveedores.filter((p) => norm(p.razonSocial).includes(aguja!))
  if (cands.length !== 1) return null
  return { id: cands[0].id, razonSocial: cands[0].razonSocial, via }
}

/** guz gon / figueiras, por el nombre del archivo o de la carpeta. */
export function sucursalDeArchivo(nombre: string, ruta?: string | null): 'GUZ' | 'FIG' | null {
  const n = norm(`${nombre} ${ruta ?? ''}`)
  const guz = /guz\s*gon|guzgon|\bguz\b/.test(n)
  const fig = /figueiras|\bfig\b/.test(n)
  if (guz && !fig) return 'GUZ'
  if (fig && !guz) return 'FIG'
  return null
}
