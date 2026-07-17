/**
 * Herramientas de CLIENTES (CRM) para NORA (tanda 2). Reusan la tabla unificada
 * `clientes` y respetan la REGLA DE DEDUP del CRM (no duplicar por DNI/tel/email).
 * Encargos y quejas NO existen todavía (nacen en OS-6) — no se inventan.
 */
import type { Herramienta, Opcion } from './tipos'
import { money } from './_comun'

const soloDigitos = (s: any) => String(s ?? '').replace(/\D/g, '')

async function buscarClientes(adm: any, term: string): Promise<Opcion[]> {
  const q = String(term ?? '').trim()
  if (q.length < 2) return []
  const like = `%${q.replace(/[%,]/g, ' ')}%`
  const { data } = await adm.from('clientes')
    .select('id, nombre, dni, telefono, nivel')
    .eq('activo', true)
    .or(`nombre.ilike.${like},dni.ilike.${like},telefono.ilike.${like},email.ilike.${like}`)
    .order('total_gastado_12m', { ascending: false }).limit(12)
  return ((data ?? []) as any[]).map((c) => ({ valor: c.id, label: c.nombre, sub: c.dni ? `DNI ${c.dni}` : c.telefono ?? c.nivel ?? undefined }))
}

/** Busca un cliente ya existente por DNI / teléfono / email (regla de dedup). */
async function clienteExistente(adm: any, v: any): Promise<{ id: string; nombre: string; criterio: string } | null> {
  const dni = soloDigitos(v.dni), tel = soloDigitos(v.telefono), email = String(v.email ?? '').trim().toLowerCase()
  if (dni.length >= 6) { const { data } = await adm.from('clientes').select('id, nombre').eq('dni', dni).limit(1).maybeSingle(); if (data) return { ...data, criterio: 'DNI' } }
  if (tel.length >= 8) { const { data } = await adm.from('clientes').select('id, nombre').ilike('telefono', `%${tel.slice(-10)}%`).limit(1).maybeSingle(); if (data) return { ...data, criterio: 'teléfono' } }
  if (email.includes('@')) { const { data } = await adm.from('clientes').select('id, nombre').eq('email', email).limit(1).maybeSingle(); if (data) return { ...data, criterio: 'email' } }
  return null
}

export const HERRAMIENTAS_CLIENTES: Herramienta[] = [
  {
    id: 'buscar_cliente',
    nombre: 'Buscar un cliente',
    descripcion: 'Busca un cliente por nombre, DNI o teléfono y muestra su ficha resumida. Solo lectura.',
    subapp: 'clientes',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'clientes', accion: 'ver' },
    slots: [
      { nombre: 'cliente', tipo: 'opcion', descripcion: 'Nombre, DNI o teléfono del cliente', queryOpciones: (adm, v) => buscarClientes(adm, v.cliente) },
    ],
    responder: async (adm, v) => {
      const { data: c } = await adm.from('clientes').select('nombre, dni, telefono, email, nivel, puntos, total_gastado_12m, n_compras_12m, ultima_compra, tipo').eq('id', v.cliente).maybeSingle()
      if (!c) return { texto: 'No encontré ese cliente.' }
      const { data: compras } = await adm.from('cliente_compras').select('fecha, monto').eq('cliente_id', v.cliente).order('fecha', { ascending: false }).limit(3)
      const datos = [c.dni ? `DNI ${c.dni}` : null, c.telefono, c.email].filter(Boolean).join(' · ')
      const loyalty = [c.nivel ? `nivel ${c.nivel}` : null, c.puntos != null ? `${c.puntos} pts` : null].filter(Boolean).join(' · ')
      const hist = ((compras ?? []) as any[]).map((x) => `  · ${x.fecha}: ${money(x.monto)}`).join('\n')
      return { texto: `**${c.nombre}**${c.tipo === 'b2b' ? ' (B2B)' : ''}\n${datos || 'sin datos de contacto'}${loyalty ? `\n${loyalty}` : ''}${c.ultima_compra ? `\nÚltima compra: ${c.ultima_compra} · ${c.n_compras_12m ?? 0} compras/12m · ${money(c.total_gastado_12m ?? 0)}` : ''}${hist ? `\nÚltimas:\n${hist}` : ''}` }
    },
  },
  {
    id: 'crear_cliente',
    nombre: 'Registrar un cliente nuevo',
    descripcion: 'Da de alta un cliente nuevo. Extraé nombre, DNI, teléfono y email si los mencionan.',
    subapp: 'clientes',
    permiso: { modulo: 'clientes', accion: 'crear' },
    slots: [
      { nombre: 'nombre', tipo: 'texto', descripcion: 'Nombre y apellido del cliente' },
      { nombre: 'dni', tipo: 'texto', descripcion: 'DNI (solo números)' },
      { nombre: 'telefono', tipo: 'texto', descripcion: 'Teléfono' },
      { nombre: 'email', tipo: 'texto', descripcion: 'Email (opcional)', requeridoSi: () => false },
    ],
    armarConfirmacion: async (adm, v) => {
      const dup = await clienteExistente(adm, v)
      return {
        titulo: dup ? 'Ojo: ya existe' : 'Confirmá el alta',
        campos: [
          { label: 'Nombre', valor: String(v.nombre ?? '—') },
          { label: 'DNI', valor: String(v.dni ?? '—') },
          { label: 'Teléfono', valor: String(v.telefono ?? '—') },
          { label: 'Email', valor: String(v.email ?? '—') },
        ],
        advertencias: dup ? [`Ya está registrado como "${dup.nombre}" (coincide por ${dup.criterio}). Si confirmás, NO se crea uno nuevo.`] : [],
      }
    },
    ejecutar: async (adm, v) => {
      const nombre = String(v.nombre ?? '').trim()
      if (!nombre) return { ok: false, texto: '', error: 'Falta el nombre.' }
      const dup = await clienteExistente(adm, v)
      if (dup) return { ok: true, texto: `Ese cliente ya estaba registrado como **${dup.nombre}** (coincide por ${dup.criterio}). No creé un duplicado.`, entidad_id: dup.id }
      const { data, error } = await adm.from('clientes').insert({
        tipo: 'b2c', nombre, dni: soloDigitos(v.dni) || null, telefono: String(v.telefono ?? '').trim() || null,
        email: String(v.email ?? '').trim().toLowerCase() || null, fuentes: ['nora'], activo: true,
      }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Cliente "${nombre}" registrado.`, entidad_id: data?.id }
    },
  },
  {
    id: 'consultar_saldo_b2b',
    nombre: 'Consultar cuenta corriente de una empresa B2B',
    descripcion: 'Responde el saldo y límite de crédito de un cliente empresa (B2B). Solo lectura.',
    subapp: 'clientes',
    soloLectura: true,
    permiso: { modulo: 'clientes', accion: 'ver' },
    slots: [
      { nombre: 'cliente', tipo: 'opcion', descripcion: 'La empresa B2B', queryOpciones: async (adm, v) => {
        const like = `%${String(v.cliente ?? '').replace(/[%,]/g, ' ')}%`
        let q = adm.from('clientes').select('id, nombre').eq('tipo', 'b2b').eq('activo', true).order('nombre').limit(15)
        if (String(v.cliente ?? '').trim().length >= 2) q = adm.from('clientes').select('id, nombre').eq('tipo', 'b2b').ilike('nombre', like).order('nombre').limit(15)
        const { data } = await q
        return ((data ?? []) as any[]).map((c) => ({ valor: c.id, label: c.nombre })) as Opcion[]
      } },
    ],
    responder: async (adm, v) => {
      const { data: c } = await adm.from('clientes').select('nombre').eq('id', v.cliente).maybeSingle()
      const { data: cc } = await adm.from('b2b_cuenta_corriente').select('saldo, limite_credito').eq('cliente_id', v.cliente).maybeSingle()
      if (!cc) return { texto: `${c?.nombre ?? 'La empresa'} no tiene cuenta corriente B2B cargada.` }
      const disp = Number(cc.limite_credito ?? 0) - Number(cc.saldo ?? 0)
      return { texto: `**${c?.nombre ?? 'Empresa'}** — saldo ${money(cc.saldo ?? 0)} · límite ${money(cc.limite_credito ?? 0)} · disponible ${money(disp)}.` }
    },
  },
]
