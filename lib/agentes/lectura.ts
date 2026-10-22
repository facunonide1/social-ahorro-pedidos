import { createClient } from '@/lib/supabase/server'

import { ELENCO, elencoDe, type Agente, type Alcance, type Nivel } from './elenco'
import { hayEjecutor } from './ejecutor'

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
  /**
   * Las acciones que tienen un ejecutor conectado y no están apagadas.
   *
   * Una acción declarada sin ejecutor NO se ofrece: un botón que no hace nada
   * es peor que no tener botón.
   */
  puedeHacer: { clave: string; nombre: string; nivel: Nivel }[]
}

const n = (x: unknown) => Number(x ?? 0)
const ars = (x: number) => `$${Math.round(x).toLocaleString('es-AR')}`

/**
 * Lee el equipo entero para un alcance.
 *
 * `sucursalId` null = la cadena. El elenco cambia, no el filtro: ver
 * `elencoDe()`.
 *
 * ── LOS NÚMEROS SE CUENTAN EN LA BASE ───────────────────────────────────────
 *
 * La primera versión traía las filas y contaba en JavaScript.
 * `transferir_antes_de_comprar` tiene 2.909 filas y PostgREST devuelve 1.000
 * sin avisar: Abasto decía «635 productos» donde hay 1.687, y $11,3 M donde
 * hay $33,5 M. No fallaba — daba un número más chico, que es la forma de
 * fallar que no se nota.
 */
export async function leerEquipo(sucursalId: string | null): Promise<{
  agentes: LecturaDeAgente[]
  /**
   * De cuándo son los números. Null = nunca se calculó el snapshot.
   *
   * La pantalla TIENE que mostrarlo. Ver el encabezado de la migración 0204:
   * el resumen tarda ~20 s, se calcula una vez por día, y un número de ayer
   * que se presenta como de ahora es una mentira chica que se vuelve grande
   * el día que alguien compra con él.
   */
  calculadoAt: string | null
}> {
  const sb = createClient()
  const alcance: Alcance = sucursalId ? 'sucursal' : 'cadena'
  const agentes = elencoDe(alcance)

  const [{ data: resumen }, { data: config }, { data: bitacora }] = await Promise.all([
    sb.rpc('agentes_resumen', { p_sucursal: sucursalId }),
    sb.from('agente_config').select('agente, accion, nivel, sucursal_id'),
    sb.from('agente_bitacora').select('agente, estado, acerto'),
  ])
  // ── NULL NO ES CERO ────────────────────────────────────────────────────
  //
  // `agentes_resumen` devuelve NULL cuando el snapshot nunca se calculó. Si
  // acá se tapara con `?? {}`, cada agente leería cero en todo y diría «no hay
  // nada» — que es lo que estuvo diciendo Abasto mientras la función se
  // cancelaba por timeout, hasta que lo encontró la verificación de coherencia.
  const hayResumen = resumen != null
  const r = (resumen ?? {}) as Record<string, any>
  const calculadoAt = (r.calculado_at as string | undefined) ?? null

  const nivelDe = (id: string): Nivel => {
    const filas = ((config ?? []) as any[]).filter(
      (c) => c.agente === id && (sucursalId ? c.sucursal_id === sucursalId || c.sucursal_id === null : c.sucursal_id === null),
    )
    if (!filas.length) return 'sugiere'  // B.6 · arrancan hablando
    const orden: Nivel[] = ['nunca', 'sugiere', 'prepara', 'hace_y_avisa']
    return filas.reduce<Nivel>((max, f) =>
      orden.indexOf(f.nivel) > orden.indexOf(max) ? f.nivel : max, 'nunca')
  }

  const marcadorDe = (id: string) => {
    const filas = ((bitacora ?? []) as any[]).filter((b) => b.agente === id)
    // Sin filas: «sin antecedentes». No se inventa nada.
    if (!filas.length) return null
    return {
      propuestas: filas.length,
      aceptadas: filas.filter((b) => ['aceptada', 'ejecutada'].includes(b.estado)).length,
      acertadas: filas.filter((b) => b.acerto === true).length,
    }
  }

  return {
    calculadoAt,
    agentes: agentes.map((a) =>
      hayResumen
        ? leerUno(a, r[a.id] ?? {}, nivelDe(a.id), marcadorDe(a.id))
        : sinCalcular(a, nivelDe(a.id), marcadorDe(a.id))),
  }
}

/**
 * Lo que dice un agente cuando los números todavía no se calcularon.
 *
 * No es «no hay nada»: es «no lo puedo saber todavía».
 */
function sinCalcular(
  agente: Agente, nivel: Nivel, marcador: LecturaDeAgente['marcador'],
): LecturaDeAgente {
  return {
    agente, nivel, marcador,
    encendido: false,
    frase: null,
    motivoApagado: 'los números de hoy todavía no se calcularon',
    queLoEnciende: 'la corrida diaria, a las 5 de la mañana. También se puede ' +
      'forzar importando un maestro de SIFACO.',
    href: '/admin/agentes',
    puedeHacer: [],
  }
}

function leerUno(
  agente: Agente, d: Record<string, any>, nivel: Nivel,
  marcador: LecturaDeAgente['marcador'],
): LecturaDeAgente {
  const base = {
    agente, nivel, marcador,
    puedeHacer: agente.acciones
      .filter((a) => hayEjecutor(agente.id, a.clave) && nivel !== 'nunca')
      .map((a) => ({ clave: a.clave, nombre: a.nombre, nivel })),
  }
  const on = (frase: string, href: string): LecturaDeAgente => ({
    ...base, encendido: true, frase, motivoApagado: null, queLoEnciende: null, href,
  })
  const off = (motivo: string, enciende: string, href: string): LecturaDeAgente => ({
    ...base, encendido: false, frase: null, motivoApagado: motivo, queLoEnciende: enciende, href,
  })

  switch (agente.id) {
    case 'abasto': {
      const items = n(d.items_urgentes)
      if (!items) {
        return off('el plan de compra no tiene nada urgente, o no hay maestro importado',
          'importar el maestro de SIFACO', '/admin/compras/plan')
      }
      const prods = n(d.productos_a_transferir)
      return on(
        `Hay ${items.toLocaleString('es-AR')} ítems urgentes por ${ars(n(d.monto_urgente))}. ` +
        (prods
          ? `De esos, ${prods.toLocaleString('es-AR')} no hay que comprarlos: están parados en otra sucursal, y son ${ars(n(d.plata_a_transferir))} que se resuelven moviendo.`
          : 'Ninguno se puede resolver moviendo stock entre sucursales.'),
        '/admin/compras/plan')
    }

    case 'tesoro': {
      const imp = n(d.impagas); const difs = n(d.dif_caja); const cred = n(d.credito)
      if (!imp && !difs) {
        return off('no hay deuda abierta ni diferencias de caja sin explicar',
          'nada: está al día', '/admin/finanzas/deuda')
      }
      const p: string[] = []
      if (imp) p.push(`${imp} comprobantes con más de un mes sin pagar, por ${ars(n(d.monto_impago))}`)
      if (cred < 0) p.push(`${ars(Math.abs(cred))} a favor en notas de crédito sin aplicar`)
      if (difs) p.push(`${difs} diferencia(s) de caja sin explicar`)
      return on(p.join('. ') + '.', '/admin/finanzas/deuda')
    }

    case 'reparto': {
      const q = n(d.quietos); const difs = n(d.dif_transfer)
      if (!q && !difs) {
        return off('no hay stock quieto que otra sucursal esté pidiendo, ni transferencias con diferencia',
          'nada: no hay nada mal repartido hoy', '/admin/operaciones/sucursales')
      }
      const p: string[] = []
      if (q) p.push(`${q} productos quietos acá que otra sucursal pide, por ${ars(n(d.plata_quieta))}`)
      if (difs) p.push(`${difs} transferencia(s) con mercadería que salió y no llegó`)
      return on(p.join('. ') + '.', '/admin/operaciones/sucursales')
    }

    case 'margen': {
      const v = n(d.vigentes); const bc = n(d.bajo_costo)
      if (!v && !bc) {
        return off('no hay ofertas vigentes cargadas',
          'importar el archivo de ofertas de SIFACO', '/admin/ofertas')
      }
      const p: string[] = []
      if (v) p.push(`${v} ofertas vigentes`)
      if (bc) p.push(`${bc} productos publicados que no cubren el costo después de comisión y envío`)
      return on(p.join(' y ') + '.', '/admin/ofertas')
    }

    case 'despacho': {
      const ab = n(d.abiertos)
      if (!ab) return off('no hay pedidos abiertos', 'nada: no quedó ninguno pendiente', '/admin/pedidos')
      return on(`${ab} pedido(s) abiertos sin entregar.`, '/admin/pedidos')
    }

    // El caso que el prompt pide explícito: apagado, con el motivo y qué lo
    // enciende. No desaparece del equipo — un agente que se esconde cuando no
    // tiene datos hace creer que el sector está cubierto.
    case 'vigia': {
      if (!n(d.lotes_con_fecha)) {
        return off(
          `no hay ni una fecha de vencimiento cargada en los ${n(d.productos).toLocaleString('es-AR')} productos`,
          'cargar las fechas de los 200 que más rotan, desde el celular en Operaciones → ' +
          'Vencimientos → Cargar. Se enciende con los primeros: no hay que esperar a los 200',
          '/admin/operaciones/vencimientos/cargar')
      }
      // C.4 · dice sobre cuántos productos mira. Un agente que dice «3 vencen
      // este mes» sin aclarar que mira 47 de 10.256 afirma algo que no puede
      // sostener.
      return on(
        `${n(d.vencen_30)} lote(s) vencen en los próximos 30 días. ` +
        `Está mirando ${n(d.productos_mirados).toLocaleString('es-AR')} productos de los ` +
        `${n(d.productos_con_stock).toLocaleString('es-AR')} que tienen stock: el resto todavía no tiene fecha cargada.`,
        '/admin/operaciones/vencimientos')
    }

    case 'documentos': {
      if (!n(d.recepciones)) {
        return off('no se fotografió ninguna factura todavía',
          'sacar la foto de la factura al recibir mercadería. Son dos fotos que ya se sacan hoy, ' +
          'y van acá en vez de al grupo de WhatsApp',
          '/admin/recepciones')
      }
      return on(
        `${n(d.recepciones)} recepción(es) cargadas. ` +
        `${n(d.sin_costo).toLocaleString('es-AR')} productos siguen sin costo: esos quedan afuera de todo cálculo de plata.`,
        '/admin/recepciones')
    }

    default:
      return off('sin lectura definida', 'declararla en lib/agentes/lectura.ts', '/admin')
  }
}

export { ELENCO }
