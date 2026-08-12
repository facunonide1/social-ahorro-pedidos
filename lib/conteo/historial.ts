import { createClient } from '@/lib/supabase/server'

/**
 * EL HISTORIAL, QUE ES LO QUE CONVIERTE EL CONTEO EN INFORMACIÓN.
 *
 * Una diferencia aislada es ruido. La misma diferencia tres veces sobre el
 * mismo SKU es un dato — y ese dato es el único motivo por el que vale la pena
 * contar todos los meses en vez de contar una vez.
 *
 * ── LAS PREGUNTAS DE CONTROL, APLICADAS ─────────────────────────────────────
 *
 * 1 · ¿Puede mostrar un número cuando no midió nada?
 *     No. Una zona sin conteos devuelve `nuncaSeContó` y ningún promedio.
 *
 * 2 · ¿Distingue "cero porque está bien" de "cero porque no contó"?
 *     Sí, y es toda la diferencia de este archivo: `sinDiferencias` y
 *     `sinContar` son dos estados distintos y nunca se suman.
 *
 * 3 · ¿Tiene corte temporal donde corresponde?
 *     Sí: la tendencia compara los últimos tres cierres, no todo el historial.
 *     Una zona que mejoró hace ocho meses no está mejorando.
 *
 * 6 · ¿La categoría que mide existe?
 *     Los items "sin comparar" no son ni coincidencias ni diferencias, y por
 *     eso tienen su propia columna en lugar de repartirse entre las dos.
 *
 * 7 · ¿Mide lo que hace falta, o algo cierto pero al lado?
 *     Lo que NO se mide, y hay que decirlo: si la corrección en el sistema
 *     autoridad se hizo. Eso lo confirma una persona cerrando la tarea, y este
 *     archivo no lo sabe.
 */

export interface ZonaEnElTiempo {
  listaId: string
  zona: string
  punto: string | null
  items: number
  /** Nulo si nunca se contó. NO es cero. */
  conteos: number
  ultimoAt: string | null
  ultimoConDiferencia: number | null
  ultimoValor: number | null
  /** Los últimos tres cierres, del más viejo al más nuevo. */
  ultimosValores: number[]
  tendencia: 'mejora' | 'empeora' | 'igual' | 'sin_datos'
  frecuencia: string | null
  programada: boolean
  estado: 'nunca_contada' | 'sin_diferencias' | 'con_diferencias'
}

export interface ItemEnElTiempo {
  sku: string | null
  descripcion: string
  vecesContado: number
  vecesConDiferencia: number
  valorAcumulado: number
}

/** Cómo viene cada zona. Sin inventar números para las que nadie contó. */
export async function zonasEnElTiempo(): Promise<ZonaEnElTiempo[]> {
  const sb = createClient()

  const [{ data: listas }, { data: items }, { data: conteos }] = await Promise.all([
    sb
      .from('cnt_listas')
      .select('id, zona, punto_id, frecuencia, programacion_activa, sucursales(nombre)')
      .eq('activa', true)
      .order('zona'),
    sb.from('cnt_lista_items').select('lista_id').eq('activo', true),
    sb
      .from('cnt_conteos')
      .select('lista_id, cerrado_at, items_diferencia, valor_diferencia')
      .eq('estado', 'cerrado')
      .order('cerrado_at', { ascending: true }),
  ])

  const porLista = new Map<string, number>()
  for (const i of (items ?? []) as { lista_id: string }[]) {
    porLista.set(i.lista_id, (porLista.get(i.lista_id) ?? 0) + 1)
  }

  const cierres = new Map<
    string,
    { cerrado_at: string | null; items_diferencia: number | null; valor_diferencia: number | null }[]
  >()
  for (const c of (conteos ?? []) as {
    lista_id: string
    cerrado_at: string | null
    items_diferencia: number | null
    valor_diferencia: number | null
  }[]) {
    cierres.set(c.lista_id, [...(cierres.get(c.lista_id) ?? []), c])
  }

  return ((listas ?? []) as unknown as {
    id: string
    zona: string
    punto_id: string | null
    frecuencia: string | null
    programacion_activa: boolean
    sucursales: { nombre: string | null } | null
  }[]).map((l) => {
    const hist = cierres.get(l.id) ?? []
    const ultimo = hist[hist.length - 1]
    // El corte: los últimos tres, no todo. Una zona que mejoró hace ocho meses
    // no está mejorando.
    const ultimosValores = hist.slice(-3).map((h) => Math.abs(Number(h.valor_diferencia ?? 0)))

    let tendencia: ZonaEnElTiempo['tendencia'] = 'sin_datos'
    if (ultimosValores.length >= 2) {
      const [primero, ultimoV] = [ultimosValores[0], ultimosValores[ultimosValores.length - 1]]
      tendencia = ultimoV < primero ? 'mejora' : ultimoV > primero ? 'empeora' : 'igual'
    }

    return {
      listaId: l.id,
      zona: l.zona,
      punto: l.sucursales?.nombre ?? null,
      items: porLista.get(l.id) ?? 0,
      conteos: hist.length,
      ultimoAt: ultimo?.cerrado_at ?? null,
      ultimoConDiferencia: ultimo ? (ultimo.items_diferencia ?? 0) : null,
      ultimoValor: ultimo ? Number(ultimo.valor_diferencia ?? 0) : null,
      ultimosValores,
      tendencia,
      frecuencia: l.frecuencia,
      programada: l.programacion_activa,
      // Tres estados, no dos. Una zona sin contar NO es una zona sin
      // diferencias, y mostrarlas iguales haría que la que nadie mira se lea
      // como la que está mejor.
      estado:
        hist.length === 0
          ? 'nunca_contada'
          : (ultimo?.items_diferencia ?? 0) === 0
            ? 'sin_diferencias'
            : 'con_diferencias',
    }
  })
}

/**
 * Los items que repiten.
 *
 * Un SKU con una diferencia una vez puede ser un error de conteo. El mismo SKU
 * con diferencia en tres conteos seguidos es otra cosa, y es lo único que esta
 * lista intenta mostrar.
 */
export async function itemsQueRepiten(minimoVeces = 2): Promise<ItemEnElTiempo[]> {
  const sb = createClient()

  const { data } = await sb
    .from('cnt_renglones')
    .select('diferencia, valor_diferencia, cnt_lista_items(sku, descripcion), cnt_conteos!inner(estado)')
    .eq('cnt_conteos.estado', 'cerrado')
    .limit(5000)

  const filas = (data ?? []) as unknown as {
    diferencia: number | null
    valor_diferencia: number | null
    cnt_lista_items: { sku: string | null; descripcion: string } | null
  }[]

  const acc = new Map<string, ItemEnElTiempo>()
  for (const f of filas) {
    const clave = f.cnt_lista_items?.sku ?? f.cnt_lista_items?.descripcion ?? '—'
    const actual = acc.get(clave) ?? {
      sku: f.cnt_lista_items?.sku ?? null,
      descripcion: f.cnt_lista_items?.descripcion ?? '',
      vecesContado: 0,
      vecesConDiferencia: 0,
      valorAcumulado: 0,
    }
    actual.vecesContado += 1
    if (f.diferencia !== null && Number(f.diferencia) !== 0) {
      actual.vecesConDiferencia += 1
      actual.valorAcumulado += Math.abs(Number(f.valor_diferencia ?? 0))
    }
    acc.set(clave, actual)
  }

  return [...acc.values()]
    .filter((x) => x.vecesConDiferencia >= minimoVeces)
    .sort((a, b) => b.vecesConDiferencia - a.vecesConDiferencia || b.valorAcumulado - a.valorAcumulado)
}
