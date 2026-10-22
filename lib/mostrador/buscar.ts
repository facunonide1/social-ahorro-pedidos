import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * EL MOSTRADOR · QUÉ OFRECER.
 *
 * ── LA LÍNEA QUE NO SE CRUZA ────────────────────────────────────────────────
 *
 * Todo lo de este directorio contesta sobre el **producto**. Nada contesta
 * sobre el tratamiento, y no es prudencia excesiva: indicar un tratamiento es
 * ejercicio profesional.
 *
 * El motivo práctico pesa más que el legal: si el empleado le pregunta a una
 * pantalla qué darle a alguien, el responsable dejó de ser una persona.
 *
 * No se recibe ni se guarda síntoma, diagnóstico ni motivo de compra. No hay
 * columna donde ponerlos.
 */

export interface Hallado {
  producto_id: string
  sku: string
  codigo_barras: string | null
  nombre: string
  nombre_comercial: string | null
  laboratorio: string | null
  presentacion: string | null
  droga_principal: string | null
  precio: number | null
  /** Null cuando no hay costo cargado. NO cero. */
  margen_pct: number | null
  stock: number
  disponible: number
  /** Null cuando no hay ni un lote con fecha para este producto acá. */
  dias_para_vencer: number | null
  en_oferta: boolean
  oferta_precio: number | null
  oferta_descuento_pct: number | null
  meses_cobertura: number | null
  por_mes: number | null
  requiere_receta: boolean
  condicion_venta: string | null
  marca_pedida: boolean
  puntaje: number
  parecido: number
}

/**
 * A.4 · EL MOTIVO A LA VISTA, SIEMPRE.
 *
 * Un sistema que dice «ofrecé este» sin decir por qué no se usa dos semanas.
 *
 * ── Y POR QUÉ RECIBE `verPlata` ─────────────────────────────────────────────
 *
 * F.7 · Quien atiende no ve costos ni márgenes: ve el orden, no el porqué en
 * plata. Entonces el mismo motivo se dice de dos formas — «deja más» para
 * quien atiende y «deja 52%» para quien decide— y la decisión de cuál se usa
 * la toma el servidor con el rol, no el componente.
 */
export function motivos(h: Hallado, verPlata: boolean): string[] {
  const m: string[] = []

  if (h.marca_pedida) m.push('es la marca que pidieron')

  if (h.dias_para_vencer != null) {
    if (h.dias_para_vencer < 0) m.push(`VENCIDO hace ${-h.dias_para_vencer} días`)
    else if (h.dias_para_vencer <= 60) m.push(`vence en ${h.dias_para_vencer} días`)
  }

  if (h.margen_pct != null && !h.marca_pedida) {
    // El mismo hecho, dicho según quién mira.
    m.push(verPlata ? `deja ${h.margen_pct}%` : 'deja más')
  }

  if (h.meses_cobertura != null && h.meses_cobertura > 3) {
    m.push(`sobra: hay para ${Math.round(h.meses_cobertura)} meses`)
  }

  if (h.en_oferta) {
    m.push(h.oferta_descuento_pct != null
      ? `en oferta, ${Math.round(h.oferta_descuento_pct)}% off`
      : 'en oferta')
  }

  if (h.por_mes != null && h.por_mes > 0 && m.length < 2) {
    m.push(`se vende ${Math.round(h.por_mes)} por mes acá`)
  }

  if (h.disponible > 0) m.push(`hay ${Math.round(h.disponible)}`)
  else m.push('no hay acá')

  return m
}

/**
 * A.5 · Lo que este producto NO permite ordenar, y por qué.
 *
 * Se dice producto por producto y no sólo en el encabezado: el empleado mira
 * una fila, no una leyenda.
 */
export function loQueNoSeSabe(h: Hallado): string[] {
  const x: string[] = []
  if (h.margen_pct == null) {
    x.push('sin costo cargado: no se puede ordenar por margen, y no se asume cero')
  }
  if (h.dias_para_vencer == null) {
    x.push('sin fecha de vencimiento cargada: no se puede ordenar por eso')
  }
  if (h.por_mes == null) {
    x.push('sin ventas registradas en esta sucursal')
  }
  return x
}

export interface EstadoDelOrden {
  productos: number
  sin_costo: number
  con_costo: number
  con_vencimiento: number
  con_ventas: number
  stock_leido_at: string | null
}

export async function buscar(
  sb: SupabaseClient,
  args: { q: string; sucursalId: string; limite?: number; codigo?: string | null },
): Promise<{ filas: Hallado[]; tardoMs: number }> {
  const t0 = Date.now()
  const { data, error } = await sb.rpc('mostrador_buscar', {
    p_q: args.q,
    p_sucursal: args.sucursalId,
    p_limite: args.limite ?? 20,
    p_codigo: args.codigo ?? null,
  })
  if (error) throw new Error(error.message)
  return {
    filas: ((data ?? []) as any[]).map((r) => ({
      ...r,
      precio: r.precio == null ? null : Number(r.precio),
      margen_pct: r.margen_pct == null ? null : Number(r.margen_pct),
      stock: Number(r.stock ?? 0),
      disponible: Number(r.disponible ?? 0),
      oferta_precio: r.oferta_precio == null ? null : Number(r.oferta_precio),
      oferta_descuento_pct: r.oferta_descuento_pct == null ? null : Number(r.oferta_descuento_pct),
      meses_cobertura: r.meses_cobertura == null ? null : Number(r.meses_cobertura),
      por_mes: r.por_mes == null ? null : Number(r.por_mes),
      puntaje: Number(r.puntaje ?? 0),
      parecido: Number(r.parecido ?? 0),
    })) as Hallado[],
    tardoMs: Date.now() - t0,
  }
}

export async function estadoDelOrden(
  sb: SupabaseClient, sucursalId: string | null,
): Promise<EstadoDelOrden | null> {
  const { data } = await sb.rpc('mostrador_que_no_se_puede_ordenar', { p_sucursal: sucursalId })
  if (!data) return null
  const d = data as any
  return {
    productos: Number(d.productos ?? 0),
    sin_costo: Number(d.sin_costo ?? 0),
    con_costo: Number(d.con_costo ?? 0),
    con_vencimiento: Number(d.con_vencimiento ?? 0),
    con_ventas: Number(d.con_ventas ?? 0),
    stock_leido_at: d.stock_leido_at ?? null,
  }
}

/**
 * C.6 · «Según el stock de hoy a las 9.»
 *
 * El stock es una foto diaria de SIFACO. Entre foto y foto el mostrador vendió
 * y NORA no se enteró. Prometer que está es lo que hace que la próxima vez
 * nadie le crea a la pantalla.
 */
export function cuandoSeLeyoElStock(iso: string | null): string {
  if (!iso) return 'no hay ninguna lectura de stock de SIFACO: lo que se muestra no tiene respaldo'
  const d = new Date(iso)
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (mismoDia) return `según el stock de hoy a las ${hora}`
  const dias = Math.floor((hoy.getTime() - d.getTime()) / 86400000)
  return dias === 1
    ? `según el stock de ayer a las ${hora}`
    : `según el stock de hace ${dias} días (${d.toLocaleDateString('es-AR')})`
}
