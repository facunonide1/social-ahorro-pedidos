import { createAdminClient } from '@/lib/supabase/server'

import type { Resultado } from './cerrar'

/**
 * QUÉ PASA CON LAS DIFERENCIAS.
 *
 * Tres cosas, todas al cerrar:
 *   1. quedan registradas en Irregularidades, que YA EXISTE
 *   2. una tarea de recuento sobre los items que no coincidieron
 *   3. una tarea de corrección en el sistema autoridad
 *
 * ── LO QUE NO HACE, Y ES LO MÁS IMPORTANTE ──────────────────────────────────
 *
 * NO AJUSTA STOCK. La autoridad de stock es el otro sistema. Acá se pide que
 * una persona lo corrija allá, con el detalle y el Excel. Que la corrección
 * esté hecha tampoco lo verifica NORA: lo confirma quien la hizo, cerrando la
 * tarea. Inventar esa verificación sería afirmar un hecho que el sistema no
 * puede comprobar.
 *
 * ── POR QUÉ NO HAY UN MÓDULO DE IRREGULARIDADES NUEVO ───────────────────────
 *
 * Porque ya hay uno con 108 filas y una pantalla que alguien mira. El valor de
 * una diferencia no está en la diferencia: está en que sea la tercera vez que
 * el mismo SKU da diferencia en el mismo punto. Un módulo paralelo partiría el
 * patrón en dos mitades y ninguna de las dos lo mostraría.
 */

export interface Consecuencias {
  irregularidades: number
  irregularidadesOmitidas: number
  tareaRecuentoId: string | null
  tareaAjusteId: string | null
  bajoUmbral: number
  umbral: { valor: number; pct: number; fijadoHaceDias: number }
}

/** Los umbrales vigentes. Si no hay fila, el default es el de la tabla. */
async function umbrales() {
  const adm = createAdminClient()
  const { data } = await adm
    .from('cnt_config')
    .select('umbral_valor, umbral_pct, umbral_actualizado_at')
    .maybeSingle<{ umbral_valor: number; umbral_pct: number; umbral_actualizado_at: string }>()
  const valor = Number(data?.umbral_valor ?? 5000)
  const pct = Number(data?.umbral_pct ?? 5)
  const fijado = data?.umbral_actualizado_at ? new Date(data.umbral_actualizado_at).getTime() : Date.now()
  return {
    valor,
    pct,
    fijadoHaceDias: Math.max(0, Math.round((Date.now() - fijado) / 86_400_000)),
  }
}

/**
 * ¿Esta diferencia merece que alguien la persiga?
 *
 * Por monto O por porcentaje, no por los dos: un item caro con una unidad de
 * diferencia importa por la plata, y uno barato con la mitad del stock faltando
 * importa por la proporción. Pedir las dos condiciones dejaría afuera
 * justamente esos dos casos.
 */
function importa(
  valor: number,
  diferencia: number,
  esperada: number | null,
  u: { valor: number; pct: number },
): boolean {
  if (Math.abs(valor) >= u.valor) return true
  if (esperada && esperada > 0 && (Math.abs(diferencia) / esperada) * 100 >= u.pct) return true
  // Sin esperada no hay porcentaje que calcular, y sin valor tampoco hay monto:
  // esas ya quedaron afuera como "no se pudo comparar", no como "no importa".
  return false
}

export async function aplicarConsecuencias(
  resultado: Resultado,
  autorId: string | null,
): Promise<Consecuencias> {
  const adm = createAdminClient()
  const u = await umbrales()

  const conDiferencia = resultado.renglones.filter(
    (r) => r.diferencia !== null && r.diferencia !== 0,
  )
  const relevantes = conDiferencia.filter((r) =>
    importa(r.valor, r.diferencia!, r.esperada, u),
  )

  const salida: Consecuencias = {
    irregularidades: 0,
    irregularidadesOmitidas: 0,
    tareaRecuentoId: null,
    tareaAjusteId: null,
    bajoUmbral: conDiferencia.length - relevantes.length,
    umbral: u,
  }

  if (!resultado.puntoId || relevantes.length === 0) return salida

  /* ── 1 · Irregularidades ──────────────────────────────────────────────── */
  //
  // El mapeo a la tabla existente, que se armó para el cruce diario de stock
  // contra ventas y no para un conteo:
  //   stock_anterior → la esperada. Antes de contar, eso era lo que el sistema
  //     decía. Es lo más cercano que hay, y dejarlo en cero sería mentir.
  //   ventas_dia → 0. En un conteo no hay ventana de ventas que cruzar; la
  //     columna existe por el otro origen.
  // Sin este comentario, dentro de seis meses alguien lee `stock_anterior` de
  // una fila de conteo y la interpreta como la foto del día anterior.
  const hoy = new Date().toISOString().slice(0, 10)
  const filas = relevantes
    .filter((r) => r.sku)
    .map((r) => ({
      fecha: hoy,
      sucursal_id: resultado.puntoId!,
      sku: r.sku!,
      stock_anterior: r.esperada ?? 0,
      ventas_dia: 0,
      stock_esperado: r.esperada ?? 0,
      stock_real: r.contada ?? 0,
      diferencia: r.diferencia!,
      tipo: r.diferencia! < 0 ? 'faltante' : 'sobrante',
      valor_diferencia: r.valor,
      estado: 'pendiente',
      nota: `Conteo de zona «${resultado.zona}».`,
    }))

  if (filas.length > 0) {
    // `on conflict do nothing`: la tabla es única por (fecha, punto, sku), así
    // que un segundo conteo del mismo SKU el mismo día no crea una segunda
    // fila. No se pisa la primera — puede estar revisada o justificada, y
    // pisarla borraría el trabajo de quien la miró.
    const { data, error } = await adm
      .from('irregularidades_stock')
      .upsert(filas, { onConflict: 'fecha,sucursal_id,sku', ignoreDuplicates: true })
      .select('id')
    salida.irregularidades = error ? 0 : (data ?? []).length
    salida.irregularidadesOmitidas = filas.length - salida.irregularidades
  }

  /* ── 2 y 3 · Las dos tareas ───────────────────────────────────────────── */
  const { data: tipos } = await adm
    .from('tipos_tareas')
    .select('id, codigo')
    .in('codigo', ['cnt_recuento', 'cnt_ajuste_sistema_autoridad'])
  const tipoDe = new Map(((tipos ?? []) as { id: string; codigo: string }[]).map((t) => [t.codigo, t.id]))

  const detalle = relevantes
    .slice(0, 25)
    .map((r) => `· ${r.sku ?? 's/SKU'} ${r.descripcion}: contaste ${r.contada}, el sistema dice ${r.esperada}`)
    .join('\n')
  const masQue25 = relevantes.length > 25 ? `\n…y ${relevantes.length - 25} más.` : ''
  const url = `/admin/operaciones/conteos/${resultado.conteoId}`

  const recuentoId = tipoDe.get('cnt_recuento')
  if (recuentoId) {
    const { data } = await adm
      .from('tareas')
      .insert({
        tipo_tarea_id: recuentoId,
        tipo_origen: 'auto_sistema',
        titulo: `Recontar ${relevantes.length} item(s) de ${resultado.zona}`,
        descripcion:
          `El conteo de «${resultado.zona}» dio ${relevantes.length} diferencia(s). ` +
          `Hay que volver a contar SOLO esos items, para saber si la diferencia era real o un error de conteo.\n\n${detalle}${masQue25}`,
        prioridad: 'alta',
        estado: 'pendiente',
        sucursal_id: resultado.puntoId,
        entidad_relacionada: 'conteo',
        entidad_id: resultado.conteoId,
        entidad_url: url,
      })
      .select('id')
      .single()
    salida.tareaRecuentoId = (data as { id: string } | null)?.id ?? null
  }

  const ajusteId = tipoDe.get('cnt_ajuste_sistema_autoridad')
  if (ajusteId) {
    const { data } = await adm
      .from('tareas')
      .insert({
        tipo_tarea_id: ajusteId,
        tipo_origen: 'auto_sistema',
        titulo: `Corregir ${relevantes.length} item(s) en el sistema autoridad — ${resultado.zona}`,
        descripcion:
          `El conteo de «${resultado.zona}» encontró ${relevantes.length} diferencia(s). ` +
          `NORA no ajusta stock: la corrección se hace en el sistema que manda, y esta tarea es el pedido.\n\n` +
          `El detalle y el Excel para bajar están en el conteo: ${url}\n\n${detalle}${masQue25}\n\n` +
          `Cuando esté corregido, cerrá esta tarea. NORA no puede verificar que se haya hecho.`,
        prioridad: 'alta',
        estado: 'pendiente',
        sucursal_id: resultado.puntoId,
        entidad_relacionada: 'conteo',
        entidad_id: resultado.conteoId,
        entidad_url: url,
      })
      .select('id')
      .single()
    salida.tareaAjusteId = (data as { id: string } | null)?.id ?? null
  }

  return salida
}
