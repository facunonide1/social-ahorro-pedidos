/**
 * Dónde va cada cosa en el dibujo. Los ángulos y radios son los del
 * prototipo (nora-cerebro.html): el anillo de adentro son los agentes, el de
 * afuera las sucursales, y el núcleo en el centro.
 */
import type { Tono } from '@/lib/cerebro/lectura'

export const CX = 490
export const CY = 272
export const VIEWBOX = '0 0 980 580'

export const COLOR: Record<Tono, string | null> = {
  ok: '#2EE1A8', al: '#E8921F', ma: '#E0485F', off: null,
}

/** Ángulo y radio de cada agente, en el plano inclinado del prototipo. */
export const POS_AGENTE: Record<string, { a: number; r: number }> = {
  abasto: { a: -95, r: 170 },
  tesoro: { a: -42, r: 194 },
  reparto: { a: 8, r: 176 },
  canal: { a: 52, r: 196 },
  margen: { a: 100, r: 168 },
  mostrador: { a: 146, r: 186 },
  despacho: { a: 192, r: 174 },
  convenio: { a: -240, r: 192 },
  documentos: { a: -288, r: 172 },
  vigia: { a: -330, r: 190 },
  conteo: { a: -14, r: 258 },
  turno: { a: -62, r: 268 },
  balance: { a: 32, r: 270 },
  vinculo: { a: 122, r: 252 },
}

/** Las sucursales, por código: el nombre puede cambiar, el código no. */
export const POS_SUCURSAL: Record<string, { a: number; r: number }> = {
  'SA-01': { a: -128, r: 378 },
  'SA-02': { a: -52, r: 388 },
  'SA-03': { a: 22, r: 386 },
  'SA-04': { a: 92, r: 376 },
  'SA-EC': { a: 160, r: 382 },
}

export function xyAgente(a: number, r: number): [number, number] {
  const t = (a * Math.PI) / 180
  return [CX + r * Math.cos(t), CY + r * Math.sin(t) * 0.78]
}

export function xySucursal(a: number, r: number): [number, number] {
  const t = (a * Math.PI) / 180
  return [CX + r * Math.cos(t), CY + r * Math.sin(t) * 0.52]
}

/** La curva de la sinapsis, del núcleo al nódulo. */
export function curva(x: number, y: number, k = 0.12): string {
  const mx = (CX + x) / 2 + (y - CY) * k
  const my = (CY + y) / 2 - (x - CX) * k
  return `M ${CX} ${CY} Q ${mx} ${my} ${x} ${y}`
}

/** C.7 · de noche baja el ritmo. Hora de Buenos Aires, no la del navegador. */
export function esDeNoche(d = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat('es-AR', {
    hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires',
  }).format(d))
  return h >= 21 || h < 7
}
