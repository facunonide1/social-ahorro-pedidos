/**
 * F · EL PANEL DE CADA ROL.
 *
 * ── QUÉ ES, Y QUÉ NO ────────────────────────────────────────────────────────
 *
 * Es una lectura: cada panel junta lo que su rol tiene que hacer hoy, de las
 * tablas donde ya está. No hay ningún cálculo nuevo acá, y no hay una tabla
 * `mi_dia` — un panel con su propia tabla se desincroniza del sector en tres
 * semanas y nadie sabe cuál creer.
 *
 * ── LA DECISIÓN INCÓMODA: «DEPÓSITO» NO ES UN ROL ───────────────────────────
 *
 * La matriz de permisos tiene trece roles y ninguno es «depósito». El que
 * carga vencimientos y recibe mercadería es un `empleado_general` o un
 * `encargado_sucursal` con permiso de operaciones.
 *
 * Se podía inventar el rol. No se hizo: agregar un rol a la matriz 13×19
 * cambia los permisos de todo el sistema, y esta sesión no toca permisos. Así
 * que el panel de depósito es una **vista** que la persona elige, y la
 * pantalla lo dice en vez de disimularlo.
 *
 * ── Y POR QUÉ EL ENCARGADO NO VE FINANZAS ───────────────────────────────────
 *
 * Porque es la regla de oro 10 y porque es lo que pidió el enunciado. Lo que
 * se filtra no es la pantalla: es la consulta. Un panel que trae la deuda de
 * la cadena y la esconde con un `if` del lado del cliente sigue mandando la
 * deuda de la cadena por la red.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { AdminRole } from '@/lib/types/admin'

type Adm = Pick<SupabaseClient, 'rpc' | 'from'>

/** Los cuatro paneles que pide el bloque F. */
export type Panel = 'encargado' | 'mostrador' | 'deposito' | 'canal'

export const PANELES: { clave: Panel; nombre: string; para: string }[] = [
  { clave: 'encargado', nombre: 'Encargado', para: 'su sucursal: tareas, quiebres y transferencias' },
  { clave: 'mostrador', nombre: 'Mostrador', para: 'lo que hay que ofrecer y los faltantes que registró' },
  { clave: 'deposito', nombre: 'Depósito', para: 'recepciones, vencimientos y conteos' },
  { clave: 'canal', nombre: 'Canal', para: 'los errores y la salud del canal del que es responsable' },
]

/**
 * Qué panel le toca a cada rol.
 *
 * `super_admin` y `gerente` ven los cuatro: no porque les toquen, sino porque
 * tienen que poder mirar lo que ve cada uno. El resto ve el suyo.
 */
export function panelesDe(rol: AdminRole): Panel[] {
  switch (rol) {
    case 'super_admin':
    case 'gerente':
      return ['encargado', 'mostrador', 'deposito', 'canal']
    case 'encargado_sucursal':
    case 'sucursal':
      // El encargado hace las tres cosas en un local chico. No se le elige
      // una: se le muestran las tres y decide por dónde empieza.
      return ['encargado', 'mostrador', 'deposito']
    case 'cajero':
      return ['mostrador']
    case 'comprador':
      return ['canal', 'deposito']
    case 'empleado_general':
      return ['mostrador', 'deposito']
    case 'administrativo':
      return ['canal']
    default:
      // tesoreria, repartidor, rrhh, marketing, auditor: ninguno de los cuatro
      // paneles es suyo. La pantalla lo dice, no muestra uno vacío.
      return []
  }
}

/** Un renglón de trabajo: qué es, cuántos, y adónde se va a hacerlo. */
export type Pendiente = {
  que: string
  cuantos: number | null
  /** Qué significa el número. Null si no se pudo contar. */
  detalle: string
  href: string
  /** Pinta el borde sólo cuando es un problema real. */
  urgente?: boolean
  /** Qué lo enciende, cuando el cero es porque falta un dato y no porque no haya. */
  por_que_cero?: string
}

export type PanelDeRol = {
  panel: Panel
  nombre: string
  /** La sucursal sobre la que se calculó. Null = la cadena. */
  sucursal: string | null
  pendientes: Pendiente[]
  /** Lo primero que hay que hacer hoy. Null si no hay nada. */
  lo_primero: Pendiente | null
  /** Qué NO se muestra en este panel, y por qué. */
  que_no_se_muestra: string | null
}

async function contar(
  adm: Adm, tabla: string, filtros: (q: any) => any,
): Promise<number | null> {
  try {
    const { count, error } = await filtros(
      adm.from(tabla).select('*', { count: 'exact', head: true }),
    )
    if (error) throw new Error(error.message)
    return count ?? 0
  } catch (e: any) {
    // Null y no cero. Un panel que dice «0 tareas» cuando la consulta falló
    // manda a alguien a casa con trabajo pendiente.
    console.error(`[mi-dia] ${tabla}: ${e?.message ?? e}`)
    return null
  }
}

const ahora = () => new Date().toISOString()

/** F.1 · El encargado. Su sucursal, y nada de la cadena. */
async function panelEncargado(
  adm: Adm, userId: string, sucursalId: string | null, sucursal: string | null,
): Promise<PanelDeRol> {
  const suc = <T,>(q: T): T => (sucursalId ? (q as any).eq('sucursal_id', sucursalId) : q)

  const [vencidas, mias, quiebres, transEntrando, transSaliendo, faltantes] = await Promise.all([
    contar(adm, 'tareas', (q) => suc(q)
      .lt('fecha_vencimiento', ahora())
      .in('estado', ['pendiente', 'asignada', 'reclamada', 'en_progreso', 'en_verificacion', 'vencida'])),
    contar(adm, 'tareas', (q) => q
      .eq('responsable_id', userId)
      .in('estado', ['pendiente', 'asignada', 'reclamada', 'en_progreso'])),
    contar(adm, 'quiebres_por_sucursal', (q) =>
      sucursalId ? q.eq('sucursal_id', sucursalId) : q),
    contar(adm, 'transferencias_sucursal', (q) =>
      (sucursalId ? q.eq('sucursal_destino_id', sucursalId) : q)
        .in('estado', ['pendiente_salida', 'en_camino'])),
    contar(adm, 'transferencias_sucursal', (q) =>
      (sucursalId ? q.eq('sucursal_origen_id', sucursalId) : q)
        .eq('estado', 'pendiente_salida')),
    contar(adm, 'avisos_faltante', (q) => suc(q).eq('estado', 'nuevo')),
  ])

  const pendientes: Pendiente[] = [
    {
      que: 'Tareas vencidas', cuantos: vencidas,
      detalle: 'pasaron su fecha y siguen abiertas',
      href: '/admin/tareas', urgente: (vencidas ?? 0) > 0,
    },
    {
      que: 'Mis tareas abiertas', cuantos: mias,
      detalle: 'asignadas a vos, con o sin vencimiento',
      href: '/admin/tareas',
    },
    {
      que: 'Productos en quiebre', cuantos: quiebres,
      detalle: 'se venden acá y hoy están en cero',
      href: '/admin/compras/plan', urgente: (quiebres ?? 0) > 0,
    },
    {
      que: 'Transferencias por recibir', cuantos: transEntrando,
      detalle: 'vienen para esta sucursal y hay que confirmarlas',
      href: '/admin/operaciones/transferencias',
    },
    {
      que: 'Transferencias por despachar', cuantos: transSaliendo,
      detalle: 'salen de acá y esperan la foto de salida',
      href: '/admin/operaciones/transferencias',
    },
    {
      que: 'Faltantes sin resolver', cuantos: faltantes,
      detalle: 'los registró alguien del mostrador',
      href: '/admin/compras/faltantes',
    },
  ]

  return {
    panel: 'encargado', nombre: 'Encargado', sucursal,
    pendientes,
    lo_primero: pendientes.find((p) => p.urgente && (p.cuantos ?? 0) > 0) ?? null,
    que_no_se_muestra:
      'Las finanzas de la cadena no están acá: ni la deuda con proveedores, ni la caja, ni el ' +
      'margen de las otras sucursales. No es que estén escondidas en la pantalla — la consulta ' +
      'no las pide.',
  }
}

/** F.2 · El del mostrador. Lo que ya tenía, más lo que registró. */
async function panelMostrador(
  adm: Adm, userId: string, sucursalId: string | null, sucursal: string | null,
): Promise<PanelDeRol> {
  const suc = <T,>(q: T): T => (sucursalId ? (q as any).eq('sucursal_id', sucursalId) : q)

  const [misFaltantes, faltantesSuc, demanda] = await Promise.all([
    contar(adm, 'avisos_faltante', (q) => q.eq('reportado_por', userId)),
    contar(adm, 'avisos_faltante', (q) => suc(q).eq('estado', 'nuevo')),
    contar(adm, 'demanda_invisible', (q) => suc(q).gte(
      'created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())),
  ])

  const pendientes: Pendiente[] = [
    {
      que: 'Lo que hay que ofrecer', cuantos: null,
      detalle: 'buscar un producto, ver dónde hay y qué equivale',
      href: '/mostrador',
      por_que_cero: 'no es un número: es la pantalla de atención, y se abre cuando hay un cliente',
    },
    {
      que: 'Faltantes que registré', cuantos: misFaltantes,
      detalle: 'me los pidieron y no había',
      href: '/mostrador/faltante',
    },
    {
      que: 'Faltantes de la sucursal sin resolver', cuantos: faltantesSuc,
      detalle: 'los registró alguien del local y nadie los compró todavía',
      href: '/admin/compras/faltantes',
    },
    {
      que: 'Pedidos registrados en 30 días', cuantos: demanda,
      detalle: 'lo que pidieron y no teníamos, de todo el local',
      href: '/admin/compras/demanda',
    },
  ]

  return {
    panel: 'mostrador', nombre: 'Mostrador', sucursal,
    pendientes,
    lo_primero: {
      que: 'Atender', cuantos: null,
      detalle: 'el mostrador se abre cuando entra alguien. Lo demás de esta pantalla es para los ratos libres',
      href: '/mostrador',
    },
    que_no_se_muestra:
      'Ningún margen en plata. Quien atiende ve precio y stock, no cuánto deja cada producto: ' +
      'es la regla de la v1.4 y acá se respeta igual.',
  }
}

/** F.3 · El del depósito. Pensado para el celular: pocos números, grandes. */
async function panelDeposito(
  adm: Adm, userId: string, sucursalId: string | null, sucursal: string | null,
): Promise<PanelDeRol> {
  const suc = <T,>(q: T): T => (sucursalId ? (q as any).eq('sucursal_id', sucursalId) : q)
  const en30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  const [recepciones, venceEn30, sinFecha, conteos, controles] = await Promise.all([
    contar(adm, 'recepcion_pendientes', (q) =>
      sucursalId ? q.eq('sucursal_id', sucursalId) : q),
    contar(adm, 'vencimientos', (q) => suc(q)
      .eq('estado', 'vigente').lte('fecha_vencimiento', en30)),
    contar(adm, 'vencimientos', (q) => suc(q).is('fecha_vencimiento', null)),
    contar(adm, 'cnt_conteos', (q) => q.in('estado', ['pendiente', 'en_progreso'])),
    contar(adm, 'controles_zona', (q) => suc(q).eq('estado', 'pendiente')),
  ])

  const pendientes: Pendiente[] = [
    {
      que: 'Recepciones con diferencia', cuantos: recepciones,
      detalle: 'llegó distinto a lo facturado y está sin cerrar',
      href: '/admin/recepciones', urgente: (recepciones ?? 0) > 0,
    },
    {
      que: 'Vencen en 30 días', cuantos: venceEn30,
      detalle: 'hay que bajarlos de góndola o devolverlos',
      href: '/admin/operaciones/vencimientos', urgente: (venceEn30 ?? 0) > 0,
    },
    {
      que: 'Lotes sin fecha de vencimiento', cuantos: sinFecha,
      detalle: 'están cargados y no se sabe cuándo vencen',
      href: '/admin/operaciones/vencimientos',
      por_que_cero: 'cargar la fecha al recibir la mercadería',
    },
    {
      que: 'Conteos abiertos', cuantos: conteos,
      detalle: 'empezados y sin cerrar',
      href: '/admin/operaciones/conteos',
    },
    {
      que: 'Zonas por controlar', cuantos: controles,
      detalle: 'el control de góndola de hoy',
      href: '/admin/operaciones/control-zonas',
    },
  ]

  return {
    panel: 'deposito', nombre: 'Depósito', sucursal,
    pendientes,
    lo_primero: pendientes.find((p) => p.urgente && (p.cuantos ?? 0) > 0) ?? null,
    que_no_se_muestra:
      '«Depósito» no es un rol en la matriz de permisos: el que recibe mercadería es un ' +
      'empleado general o el encargado. Este panel es una vista que se elige, no un permiso — ' +
      'agregar un rol cambiaría los permisos de todo el sistema y esta sesión no toca permisos.',
  }
}

/** F.4 · El responsable de un canal. Hoy, los cuatro canales no tienen. */
async function panelCanal(adm: Adm, userId: string): Promise<PanelDeRol> {
  const { data, error } = await adm.rpc('canal_tablero_responsable', { p_user: userId })
  if (error) console.error(`[mi-dia] canal_tablero_responsable: ${error.message}`)

  const t = (data ?? null) as {
    canales: { canal_id: string; canal: string }[] | null
    errores_abiertos: number; vencidos: number; plata: number | null
    que_falta: string | null
  } | null

  const sinCanales = !t?.canales?.length

  return {
    panel: 'canal',
    nombre: 'Canal',
    sucursal: null,
    pendientes: sinCanales
      ? [{
          que: 'Canales a tu nombre', cuantos: 0,
          detalle: 'ninguno de los cuatro canales tiene responsable declarado',
          href: '/admin/canales',
          por_que_cero:
            'asignar un responsable a cada canal. Es un campo, y hoy es el motivo de que ' +
            '2.977 errores de catálogo no tengan dueño — el agente Canal lo levantó solo en la v1.4',
        }]
      : [
          {
            que: 'Errores de tus canales', cuantos: t!.errores_abiertos,
            detalle: t!.plata === null
              ? 'abiertos, sin plata valuada'
              : `abiertos · $${Math.round(t!.plata).toLocaleString('es-AR')} en juego`,
            href: '/admin/canales/errores', urgente: t!.errores_abiertos > 0,
          },
          {
            que: 'Vencidos', cuantos: t!.vencidos,
            detalle: 'pasaron el plazo de su tipo y siguen abiertos',
            href: '/admin/canales/errores', urgente: t!.vencidos > 0,
          },
        ],
    lo_primero: sinCanales
      ? null
      : (t!.vencidos > 0
          ? {
              que: 'Resolver los vencidos', cuantos: t!.vencidos,
              detalle: 'pasaron su plazo',
              href: '/admin/canales/errores', urgente: true,
            }
          : null),
    que_no_se_muestra: t?.que_falta ?? null,
  }
}

export async function miDia(
  adm: Adm, opts: {
    userId: string; rol: AdminRole
    sucursalId: string | null; sucursal: string | null
    soloPanel?: Panel | null
  },
): Promise<{ paneles: PanelDeRol[]; disponibles: Panel[] }> {
  const disponibles = panelesDe(opts.rol)
  const pedidos = opts.soloPanel && disponibles.includes(opts.soloPanel)
    ? [opts.soloPanel]
    : disponibles

  const paneles = await Promise.all(pedidos.map((p) => {
    switch (p) {
      case 'encargado':
        return panelEncargado(adm, opts.userId, opts.sucursalId, opts.sucursal)
      case 'mostrador':
        return panelMostrador(adm, opts.userId, opts.sucursalId, opts.sucursal)
      case 'deposito':
        return panelDeposito(adm, opts.userId, opts.sucursalId, opts.sucursal)
      case 'canal':
        return panelCanal(adm, opts.userId)
    }
  }))

  return { paneles, disponibles }
}
