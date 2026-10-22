import { createClient } from '@/lib/supabase/server'

import { ELENCO, elencoDe, type Agente, type Alcance, type Nivel } from './elenco'

/**
 * QUÉ TIENE PARA DECIR HOY CADA AGENTE.
 *
 * ── LA REGLA DE ESTE ARCHIVO ────────────────────────────────────────────────
 *
 * Ninguna consulta de acá calcula nada nuevo. Todas leen vistas que ya existen
 * y que ya se usan en las pantallas de su sector. Si Abasto dice «2.402 ítems
 * urgentes», es el mismo 2.402 que muestra el plan de compra — no un número
 * parecido calculado de otra forma.
 *
 * ── Y SI NO HAY DATO ────────────────────────────────────────────────────────
 *
 * `encendido: false` con el motivo y qué lo enciende. No se devuelve cero: un
 * cero dice «lo miré y no hay», y lo que pasa es que no hay con qué mirar.
 */

export interface LecturaDeAgente {
  agente: Agente
  encendido: boolean
  /** La frase que dice hoy, con números reales. Null si está apagado. */
  frase: string | null
  /** Por qué está apagado. Null si está encendido. */
  motivoApagado: string | null
  /** Qué lo encendería. Se dice siempre que esté apagado. */
  queLoEnciende: string | null
  /** El nivel configurado para este agente en este alcance. */
  nivel: Nivel
  /** A dónde lleva la tarjeta. */
  href: string
  /** El marcador. Hoy, vacío. */
  marcador: { propuestas: number; aceptadas: number; acertadas: number } | null
}

type Sb = ReturnType<typeof createClient>

const n = (x: unknown) => Number(x ?? 0)
const ars = (x: number) => `$${Math.round(x).toLocaleString('es-AR')}`

async function contar(sb: Sb, tabla: string, filtro?: (q: any) => any): Promise<number> {
  let q = sb.from(tabla).select('*', { count: 'exact', head: true })
  if (filtro) q = filtro(q)
  const { count } = await q
  return count ?? 0
}

/**
 * Lee el equipo entero para un alcance.
 *
 * `sucursalId` null = la cadena. El elenco cambia, no el filtro: ver
 * `elencoDe()`.
 */
export async function leerEquipo(sucursalId: string | null): Promise<LecturaDeAgente[]> {
  const sb = createClient()
  const alcance: Alcance = sucursalId ? 'sucursal' : 'cadena'
  const agentes = elencoDe(alcance)

  const [{ data: config }, { data: bitacora }] = await Promise.all([
    sb.from('agente_config').select('agente, accion, nivel, sucursal_id'),
    sb.from('agente_bitacora').select('agente, estado, acerto'),
  ])

  const nivelDe = (id: string): Nivel => {
    const filas = ((config ?? []) as any[]).filter(
      (c) => c.agente === id && (sucursalId ? c.sucursal_id === sucursalId || c.sucursal_id === null : c.sucursal_id === null),
    )
    if (!filas.length) return 'sugiere'  // B.6 · arrancan hablando
    // El más alto que tenga alguna acción: es lo que describe al agente.
    const orden: Nivel[] = ['nunca', 'sugiere', 'prepara', 'hace_y_avisa']
    return filas.reduce<Nivel>((max, f) =>
      orden.indexOf(f.nivel) > orden.indexOf(max) ? f.nivel : max, 'nunca')
  }

  const marcadorDe = (id: string) => {
    const filas = ((bitacora ?? []) as any[]).filter((b) => b.agente === id)
    if (!filas.length) return null  // «sin antecedentes». No se inventa nada.
    return {
      propuestas: filas.length,
      aceptadas: filas.filter((b) => ['aceptada', 'ejecutada'].includes(b.estado)).length,
      acertadas: filas.filter((b) => b.acerto === true).length,
    }
  }

  return Promise.all(agentes.map((a) => leerUno(sb, a, sucursalId, nivelDe(a.id), marcadorDe(a.id))))
}

async function leerUno(
  sb: Sb, agente: Agente, sucursalId: string | null, nivel: Nivel,
  marcador: LecturaDeAgente['marcador'],
): Promise<LecturaDeAgente> {
  const base = { agente, nivel, marcador }

  const encendido = (frase: string, href: string): LecturaDeAgente => ({
    ...base, encendido: true, frase, motivoApagado: null, queLoEnciende: null, href,
  })
  const apagado = (motivo: string, enciende: string, href: string): LecturaDeAgente => ({
    ...base, encendido: false, frase: null, motivoApagado: motivo, queLoEnciende: enciende, href,
  })

  switch (agente.id) {
    // ── ABASTO · el plan de compra ──────────────────────────────────────────
    case 'abasto': {
      const [{ data: urg }, { data: tr }] = await Promise.all([
        sb.from('reco_compras_urgencia').select('urgencia, items, monto'),
        sb.from('transferir_antes_de_comprar').select('producto_id, plata_que_no_hay_que_gastar'),
      ])
      const urgentes = ((urg ?? []) as any[]).filter((u) => ['ya', 'esta_semana'].includes(u.urgencia))
      const items = urgentes.reduce((a, u) => a + n(u.items), 0)
      const monto = urgentes.reduce((a, u) => a + n(u.monto), 0)
      if (!items) {
        return apagado(
          'el plan de compra no tiene nada urgente, o no hay maestro importado',
          'importar el maestro de SIFACO',
          '/admin/compras/plan',
        )
      }
      const prods = new Set(((tr ?? []) as any[]).map((t) => t.producto_id)).size
      const plata = ((tr ?? []) as any[]).reduce((a, t) => a + n(t.plata_que_no_hay_que_gastar), 0)
      return encendido(
        `Hay ${items.toLocaleString('es-AR')} ítems urgentes por ${ars(monto)}. ` +
        (prods
          ? `De esos, ${prods.toLocaleString('es-AR')} no hay que comprarlos: están parados en otra sucursal, y son ${ars(plata)} que se resuelven moviendo.`
          : 'Ninguno se puede resolver moviendo stock entre sucursales.'),
        '/admin/compras/plan',
      )
    }

    // ── TESORO · deuda y caja ───────────────────────────────────────────────
    case 'tesoro': {
      const [{ data: deuda }, difs] = await Promise.all([
        sb.from('deuda_proveedores').select('situacion, saldo'),
        contar(sb, 'caja_diferencias', (q) => q.eq('estado', 'abierta')),
      ])
      const filas = (deuda ?? []) as any[]
      const impagas = filas.filter((d) => d.situacion === 'impaga')
      const credito = filas.filter((d) => d.situacion === 'credito')
        .reduce((a, d) => a + n(d.saldo), 0)
      if (!impagas.length && !difs) {
        return apagado(
          'no hay deuda abierta ni diferencias de caja sin explicar',
          'nada: está al día',
          '/admin/finanzas/deuda',
        )
      }
      const partes: string[] = []
      if (impagas.length) {
        partes.push(`${impagas.length} comprobantes con más de un mes sin pagar, por ${ars(impagas.reduce((a, d) => a + n(d.saldo), 0))}`)
      }
      if (credito < 0) partes.push(`${ars(Math.abs(credito))} a favor en notas de crédito sin aplicar`)
      if (difs) partes.push(`${difs} diferencia(s) de caja sin explicar`)
      return encendido(partes.join('. ') + '.', '/admin/finanzas/deuda')
    }

    // ── REPARTO · stock entre sucursales ────────────────────────────────────
    case 'reparto': {
      let qm = sb.from('stock_mal_repartido').select('producto_id, plata_quieta')
      if (sucursalId) qm = qm.eq('donde_esta_id', sucursalId)
      const [{ data: mal }, difs] = await Promise.all([
        qm,
        contar(sb, 'transferencias_diferencias', (q) => q.eq('abierta', true)),
      ])
      const filas = (mal ?? []) as any[]
      if (!filas.length && !difs) {
        return apagado(
          'no hay stock quieto que otra sucursal esté pidiendo, ni transferencias con diferencia',
          'nada: no hay nada mal repartido hoy',
          '/admin/operaciones/sucursales',
        )
      }
      const partes: string[] = []
      if (filas.length) {
        partes.push(`${filas.length} productos quietos acá que otra sucursal pide, por ${ars(filas.reduce((a, f) => a + n(f.plata_quieta), 0))}`)
      }
      if (difs) partes.push(`${difs} transferencia(s) con mercadería que salió y no llegó`)
      return encendido(partes.join('. ') + '.', '/admin/operaciones/sucursales')
    }

    // ── MARGEN · precios y promociones ──────────────────────────────────────
    case 'margen': {
      const [vigentes, bajoCosto] = await Promise.all([
        contar(sb, 'ofertas_sifaco', (q) => q.eq('estado', 'vigente')),
        contar(sb, 'canal_estado', (q) => q.eq('problema', 'no_cubre_costo')),
      ])
      if (!vigentes && !bajoCosto) {
        return apagado(
          'no hay ofertas vigentes cargadas',
          'importar el archivo de ofertas de SIFACO',
          '/admin/ofertas',
        )
      }
      const partes: string[] = []
      if (vigentes) partes.push(`${vigentes} ofertas vigentes`)
      if (bajoCosto) partes.push(`${bajoCosto} productos publicados que no cubren el costo después de comisión y envío`)
      return encendido(partes.join(' y ') + '.', '/admin/ofertas')
    }

    // ── DESPACHO · pedidos ──────────────────────────────────────────────────
    case 'despacho': {
      const abiertos = await contar(sb, 'orders', (q) =>
        q.not('status', 'in', '("entregado","cancelado")'))
      if (!abiertos) {
        return apagado(
          'no hay pedidos abiertos',
          'nada: no quedó ninguno pendiente',
          '/admin/pedidos',
        )
      }
      return encendido(`${abiertos} pedido(s) abiertos sin entregar.`, '/admin/pedidos')
    }

    // ── VIGÍA · vencimientos ────────────────────────────────────────────────
    //
    // El caso que el prompt pide explícito: apagado, con el motivo y qué lo
    // enciende. No desaparece del equipo.
    case 'vigia': {
      const conFecha = await contar(sb, 'lotes_productos', (q) =>
        q.not('fecha_vencimiento', 'is', null))
      if (!conFecha) {
        const prods = await contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false))
        return apagado(
          `no hay ni una fecha de vencimiento cargada en los ${prods.toLocaleString('es-AR')} productos`,
          'cargar las fechas de los 200 que más rotan. Con eso ya puede avisar lo que está por vencer; ' +
          'el resto se completa con la tarea diaria de vencimientos',
          '/admin/operaciones/vencimientos',
        )
      }
      const en30 = await contar(sb, 'lotes_productos', (q) =>
        q.lte('fecha_vencimiento', new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
          .eq('estado', 'vigente'))
      return encendido(`${en30} lote(s) vencen en los próximos 30 días.`, '/admin/operaciones/vencimientos')
    }

    // ── DOCUMENTOS · facturas y costos ──────────────────────────────────────
    case 'documentos': {
      const [recepciones, sinCosto] = await Promise.all([
        contar(sb, 'recepciones_mercaderia'),
        contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).is('precio_costo_promedio', null)),
      ])
      if (!recepciones) {
        return apagado(
          'no se fotografió ninguna factura todavía',
          'sacar la foto de la factura al recibir mercadería. Son dos fotos que ya se sacan hoy, ' +
          'y van acá en vez de al grupo de WhatsApp',
          '/admin/recepciones',
        )
      }
      return encendido(
        `${recepciones} recepción(es) cargadas. ` +
        `${sinCosto.toLocaleString('es-AR')} productos siguen sin costo: esos quedan afuera de todo cálculo de plata.`,
        '/admin/recepciones',
      )
    }

    default:
      return apagado('sin lectura definida', 'declararla en lib/agentes/lectura.ts', '/admin')
  }
}

export { ELENCO }
