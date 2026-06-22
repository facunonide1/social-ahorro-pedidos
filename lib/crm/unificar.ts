/**
 * Unificación de clientes (CRM · v0.29). Lee las 5 fuentes y las consolida en el
 * maestro `clientes` con dedup por DNI → teléfono → email. NO modifica la
 * cuponera ni el CRM de pedidos: solo LEE (`users`, `customers`,
 * `tickets_validacion`) y escribe en `clientes`/`cliente_fuentes`. SIFACO y web
 * llegan por el Centro de Datos / WooCommerce (ganchos preparados).
 */
type Adm = any

export function normDni(s?: string | null): string | null {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length >= 6 ? d : null
}
export function normTel(s?: string | null): string | null {
  const d = (s ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-10) : null
}
export function normEmail(s?: string | null): string | null {
  const e = (s ?? '').trim().toLowerCase()
  return e.includes('@') ? e : null
}

type Incoming = {
  fuente: string; id_externo: string
  nombre: string; dni?: string | null; telefono?: string | null; email?: string | null
  fecha_nacimiento?: string | null; cuponera_user_id?: string | null
  nivel?: 'socio' | 'plus' | 'premium' | null; puntos?: number; datos?: Record<string, unknown>
}

/** Construye índices de los clientes existentes para el match. */
async function indexar(adm: Adm) {
  const { data } = await adm.from('clientes').select('id, dni, telefono, email, fuentes')
  const porDni = new Map<string, any>(); const porTel = new Map<string, any>(); const porEmail = new Map<string, any>()
  for (const c of (data ?? []) as any[]) {
    const d = normDni(c.dni); if (d) porDni.set(d, c)
    const t = normTel(c.telefono); if (t) porTel.set(t, c)
    const e = normEmail(c.email); if (e) porEmail.set(e, c)
  }
  return { porDni, porTel, porEmail }
}

function matchear(inc: Incoming, idx: Awaited<ReturnType<typeof indexar>>): { cliente: any | null; criterio: string | null } {
  const d = normDni(inc.dni); if (d && idx.porDni.has(d)) return { cliente: idx.porDni.get(d), criterio: 'dni' }
  const t = normTel(inc.telefono); if (t && idx.porTel.has(t)) return { cliente: idx.porTel.get(t), criterio: 'telefono' }
  const e = normEmail(inc.email); if (e && idx.porEmail.has(e)) return { cliente: idx.porEmail.get(e), criterio: 'email' }
  return { cliente: null, criterio: null }
}

/** Lee las fuentes reales (cuponera, pedidos, tickets) y devuelve registros normalizados. */
async function leerFuentes(adm: Adm): Promise<Incoming[]> {
  const out: Incoming[] = []
  // Cuponera (Club): users + user_points
  const [{ data: clubUsers }, { data: pts }] = await Promise.all([
    adm.from('users').select('id, full_name, dni, email, push_token').limit(20000),
    adm.from('user_points').select('user_id, points, level').limit(20000),
  ])
  const ptsMap = new Map(((pts ?? []) as any[]).map((p) => [p.user_id, p]))
  for (const u of (clubUsers ?? []) as any[]) {
    if (u.role === 'admin') continue
    const p = ptsMap.get(u.id)
    out.push({
      fuente: 'cuponera', id_externo: u.id, nombre: u.full_name ?? 'Socio', dni: u.dni, email: u.email,
      cuponera_user_id: u.id, nivel: p?.level ?? null, puntos: Number(p?.points ?? 0),
      datos: { push_token: u.push_token ?? null },
    })
  }
  // CRM pedidos: customers
  const { data: custs } = await adm.from('customers').select('id, name, phone, email, dni').limit(20000)
  for (const c of (custs ?? []) as any[]) {
    out.push({ fuente: 'crm_pedidos', id_externo: c.id, nombre: c.name ?? 'Cliente', dni: c.dni, telefono: c.phone, email: c.email })
  }
  // Tickets OCR
  const { data: tk } = await adm.from('tickets_validacion').select('id, cliente_dni, cliente_telefono').not('cliente_dni', 'is', null).limit(20000)
  for (const t of (tk ?? []) as any[]) {
    out.push({ fuente: 'tickets', id_externo: t.id, nombre: `DNI ${t.cliente_dni}`, dni: t.cliente_dni, telefono: t.cliente_telefono })
  }
  return out
}

export type ResultadoSync = { creados: number; actualizados: number; fuentes: number }

/** Sincroniza las fuentes → maestro clientes. Idempotente (mergea por dedup). */
export async function sincronizarFuentes(adm: Adm): Promise<ResultadoSync> {
  const incoming = await leerFuentes(adm)
  let creados = 0, actualizados = 0, fuentes = 0
  const idx = await indexar(adm)

  for (const inc of incoming) {
    const { cliente, criterio } = matchear(inc, idx)
    let clienteId: string

    if (cliente) {
      clienteId = cliente.id
      const nuevasFuentes = Array.from(new Set([...(cliente.fuentes ?? []), inc.fuente]))
      const patch: Record<string, unknown> = { fuentes: nuevasFuentes }
      // completar campos faltantes sin pisar
      if (inc.dni && !cliente.dni) patch.dni = inc.dni
      if (inc.email && !cliente.email) patch.email = inc.email
      if (inc.telefono && !cliente.telefono) patch.telefono = inc.telefono
      if (inc.cuponera_user_id) { patch.cuponera_user_id = inc.cuponera_user_id; patch.nivel = inc.nivel; patch.puntos = inc.puntos }
      await adm.from('clientes').update(patch).eq('id', clienteId)
      actualizados++
      // refrescar índice en memoria
      cliente.fuentes = nuevasFuentes
    } else {
      const { data: nuevo } = await adm.from('clientes').insert({
        tipo: 'b2c', nombre: inc.nombre, dni: inc.dni ?? null, telefono: inc.telefono ?? null,
        email: inc.email ?? null, fecha_nacimiento: inc.fecha_nacimiento ?? null,
        fuentes: [inc.fuente], cuponera_user_id: inc.cuponera_user_id ?? null,
        nivel: inc.nivel ?? null, puntos: inc.puntos ?? 0,
      }).select('id, dni, telefono, email, fuentes').single()
      if (!nuevo) continue
      clienteId = nuevo.id
      creados++
      // indexar el nuevo para que siguientes registros lo matcheen
      const d = normDni(nuevo.dni); if (d) idx.porDni.set(d, nuevo)
      const t = normTel(nuevo.telefono); if (t) idx.porTel.set(t, nuevo)
      const e = normEmail(nuevo.email); if (e) idx.porEmail.set(e, nuevo)
    }

    // trazar la fuente (idempotente por unique cliente+fuente+id_externo)
    const { error } = await adm.from('cliente_fuentes').upsert({
      cliente_id: clienteId, fuente: inc.fuente, id_externo: inc.id_externo, datos: inc.datos ?? {},
    }, { onConflict: 'cliente_id,fuente,id_externo' })
    if (!error) fuentes++
  }

  return { creados, actualizados, fuentes }
}
