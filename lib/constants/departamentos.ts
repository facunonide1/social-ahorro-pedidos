/**
 * Configuración estática de los 9 departamentos del ERP.
 *
 * Acá viven la metadata visual (label, icon, color, descripción) y el
 * estado del depto (activo / placeholder / fase2 / externo). La
 * configuración de los submenús específicos vive en
 * `lib/constants/navegacion.ts`.
 */

import type { Departamento } from '@/lib/types/admin'

/** URL del repo cuponera (departamentos Comercial / Clientes apuntan acá). */
export const CUPONERA_URL: string =
  process.env.NEXT_PUBLIC_CUPONERA_URL || 'https://cuponera.socialahorro.com'

export type DeptEstado = 'activo' | 'placeholder' | 'fase2' | 'externo'

export type DeptInfo = {
  id: Departamento
  label: string
  /** Nombre del icono Lucide (resuelto en el render). */
  icon: string
  /** Path raíz del depto. Para externos, usar URL absoluta. */
  path: string
  /** Color de acento del depto (token semántico Tailwind). */
  color: string
  estado: DeptEstado
  descripcion: string
  /** URL externa cuando estado='externo'. */
  externalUrl?: string
}

export const DEPARTAMENTOS_INFO: Record<Departamento, DeptInfo> = {
  ejecutivo: {
    id: 'ejecutivo',
    label: 'Ejecutivo',
    icon: 'LayoutDashboard',
    path: '/admin',
    color: 'bg-violet-500',
    estado: 'activo',
    descripcion: 'Dashboard global, aprobaciones críticas y reportes consolidados.',
  },
  compras: {
    id: 'compras',
    label: 'Compras',
    icon: 'ShoppingCart',
    path: '/admin/compras',
    color: 'bg-blue-500',
    estado: 'activo',
    descripcion: 'Proveedores, pedidos a proveedor, recepciones y comparativa de precios.',
  },
  finanzas: {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'Wallet',
    path: '/admin/finanzas',
    color: 'bg-emerald-500',
    estado: 'activo',
    descripcion: 'Facturas, pagos, conciliación, cuentas bancarias y cash flow.',
  },
  sucursales: {
    id: 'sucursales',
    label: 'Sucursales',
    icon: 'Building2',
    path: '/admin/sucursales',
    color: 'bg-orange-500',
    estado: 'activo',
    descripcion: 'Performance, caja diaria, gastos operativos y maestro de sucursales.',
  },
  operaciones: {
    id: 'operaciones',
    label: 'Operaciones',
    icon: 'Boxes',
    path: '/admin/operaciones',
    color: 'bg-amber-500',
    estado: 'fase2',
    descripcion: 'Stock, transferencias entre sucursales y vencimientos.',
  },
  comercial: {
    id: 'comercial',
    label: 'Comercial',
    icon: 'Megaphone',
    path: '/admin/comercial',
    color: 'bg-pink-500',
    estado: 'externo',
    descripcion: 'Promociones, cuponera y comunicación comercial.',
    externalUrl: CUPONERA_URL,
  },
  clientes: {
    id: 'clientes',
    label: 'Clientes',
    icon: 'Users',
    path: '/admin/clientes',
    color: 'bg-fuchsia-500',
    estado: 'externo',
    descripcion: 'Maestro de clientes, segmentación y CRM.',
    externalUrl: CUPONERA_URL,
  },
  rrhh: {
    id: 'rrhh',
    label: 'RRHH',
    icon: 'UserCog',
    path: '/admin/rrhh',
    color: 'bg-rose-500',
    estado: 'fase2',
    descripcion: 'Empleados, turnos, ausencias y liquidación de sueldos.',
  },
  bi: {
    id: 'bi',
    label: 'BI',
    icon: 'BarChart3',
    path: '/admin/bi',
    color: 'bg-indigo-500',
    estado: 'fase2',
    descripcion: 'Reportes, dashboards analíticos y data exploration.',
  },
}

/** Lista ordenada para iteración (top-nav, etc.). */
export const DEPARTAMENTOS_ORDER: Departamento[] = [
  'ejecutivo',
  'compras',
  'finanzas',
  'sucursales',
  'operaciones',
  'comercial',
  'clientes',
  'rrhh',
  'bi',
]
