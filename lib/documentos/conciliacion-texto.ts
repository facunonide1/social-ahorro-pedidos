import type { FilaConciliacion, ResultadoConciliacion } from '@/lib/documentos/conciliar'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/**
 * La lectura del caso en palabras.
 *
 * "Se detectaron diferencias en la conciliación" no le sirve a nadie: no dice
 * qué pasó, ni con qué producto, ni cuánta plata. Quien abre la bandeja tiene
 * que poder decidir si vale la pena reclamar sin abrir tres papeles.
 */
export function resumirConciliacion(r: {
  filas: FilaConciliacion[]
  totales: ResultadoConciliacion['totales']
  falta: string[]
  noComparables: number
}): string {
  const partes: string[] = []

  const faltantes = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'cantidad_faltante'))
  const deMas = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'facturado_de_mas'))
  const precios = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'precio_distinto'))

  if (deMas.length) {
    const uno = deMas[0]
    const d = uno.diferencias.find((x) => x.tipo === 'facturado_de_mas')!
    partes.push(
      deMas.length === 1
        ? `Te facturaron ${fmtCant(d.cantidad)} de ${uno.nombre} que no entregaron: ${fmt(d.monto)}.`
        : `Te facturaron ${deMas.length} productos que no entregaron, entre ellos ${uno.nombre}: ${fmt(r.totales.facturadoDeMas)} en total.`,
    )
  }

  if (faltantes.length) {
    const uno = faltantes[0]
    const d = uno.diferencias.find((x) => x.tipo === 'cantidad_faltante')!
    partes.push(
      faltantes.length === 1
        ? `Faltaron ${fmtCant(d.cantidad)} de ${uno.nombre} sobre lo pedido: ${fmt(d.monto)}.`
        : `Faltaron unidades en ${faltantes.length} productos: ${fmt(r.totales.cantidadFaltante)}.`,
    )
  }

  if (precios.length) {
    const uno = precios[0]
    const d = uno.diferencias.find((x) => x.tipo === 'precio_distinto')!
    const arriba = d.cantidad > 0
    partes.push(
      precios.length === 1
        ? `El precio de ${uno.nombre} vino ${fmt(Math.abs(d.cantidad))} ${arriba ? 'arriba' : 'abajo'} de lo pactado en la orden, sobre ${fmtCant(uno.facturado ?? 0)}: ${fmt(Math.abs(d.monto))}.`
        : `${precios.length} productos vinieron a un precio distinto del pactado: ${fmt(Math.abs(r.totales.precioDistinto))}.`,
    )
  }

  if (r.noComparables) {
    partes.push(
      `${r.noComparables} ${r.noComparables === 1 ? 'renglón no se pudo comparar' : 'renglones no se pudieron comparar'} porque la unidad del papel no coincide y falta cargar cuántas unidades trae.`,
    )
  }

  if (!partes.length) {
    if (r.falta.length) return `Todavía falta ${r.falta.join(' y ')} para poder cerrar el caso.`
    return 'Los tres documentos coinciden: cantidades y precios cierran.'
  }

  if (r.totales.total !== 0 && partes.length > 1) {
    partes.push(`Total: ${fmt(Math.abs(r.totales.total))}.`)
  }
  if (r.falta.length) {
    partes.push(`Falta ${r.falta.join(' y ')}.`)
  }

  return partes.join(' ')
}

function fmtCant(n: number): string {
  const abs = Math.abs(n)
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(2)
  return `${s} ${abs === 1 ? 'unidad' : 'unidades'}`
}
