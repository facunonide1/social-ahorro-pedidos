import {
  Home,
  Building2,
  FileText,
  Banknote,
  PackageCheck,
  Building,
  Users,
  Briefcase,
  Wallet,
  Landmark,
  TrendingUp,
  Scale,
  ReceiptText,
  CalendarClock,
  Repeat,
  Boxes,
  CalendarX,
  ArrowLeftRight,
  ClipboardCheck,
  Undo2,
  Sparkles,
  ScanLine,
  Contact,
  UserCog,
  CheckSquare,
  BarChart3,
  Activity,
  Upload,
  ShoppingCart,
  Bell,
  type LucideIcon,
} from 'lucide-react'

import type { AdminRole } from '@/lib/types/admin'

export type HubNavItem = {
  label: string
  href: string
  icon: LucideIcon
  roles?: AdminRole[]
  hint?: string
}

export type HubNavSection = {
  label: string
  items: HubNavItem[]
}

export const HUB_NAV_SECTIONS: HubNavSection[] = [
  {
    label: 'General',
    items: [
      { label: 'Inicio', href: '/hub', icon: Home },
      {
        label: 'Dashboard ejecutivo',
        href: '/hub/ejecutivo',
        icon: TrendingUp,
        roles: ['super_admin', 'gerente', 'auditor'],
      },
      {
        label: 'BI',
        href: '/hub/bi',
        icon: BarChart3,
        roles: ['super_admin', 'gerente', 'auditor'],
      },
    ],
  },
  {
    label: 'Compras',
    items: [
      {
        label: 'Proveedores',
        href: '/hub/proveedores',
        icon: Building2,
        roles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
      },
      {
        label: 'Recepciones',
        href: '/hub/recepciones',
        icon: PackageCheck,
        roles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'],
      },
      {
        label: 'Devoluciones',
        href: '/hub/compras/devoluciones',
        icon: Undo2,
        roles: ['super_admin', 'gerente', 'comprador', 'administrativo'],
      },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      {
        label: 'Stock',
        href: '/hub/operaciones/stock',
        icon: Boxes,
        roles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'comprador', 'auditor'],
      },
      {
        label: 'Importaciones',
        href: '/hub/operaciones/importaciones',
        icon: Upload,
        roles: ['super_admin', 'gerente', 'comprador'],
      },
      {
        label: 'Análisis de ventas',
        href: '/hub/operaciones/analisis',
        icon: TrendingUp,
        roles: ['super_admin', 'gerente', 'comprador', 'auditor'],
      },
      {
        label: 'Reposición',
        href: '/hub/operaciones/reposicion',
        icon: ShoppingCart,
        roles: ['super_admin', 'gerente', 'comprador'],
      },
      {
        label: 'Alertas',
        href: '/hub/operaciones/alertas',
        icon: Bell,
        roles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'sucursal'],
      },
      {
        label: 'Vencimientos',
        href: '/hub/operaciones/vencimientos',
        icon: CalendarX,
        roles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'],
      },
      {
        label: 'Transferencias',
        href: '/hub/operaciones/transferencias',
        icon: ArrowLeftRight,
        roles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
      },
      {
        label: 'Inventarios',
        href: '/hub/operaciones/inventarios',
        icon: ClipboardCheck,
        roles: ['super_admin', 'gerente', 'administrativo', 'sucursal'],
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      {
        label: 'Clientes B2B',
        href: '/hub/clientes',
        icon: Contact,
        roles: ['super_admin', 'gerente', 'administrativo', 'comprador', 'auditor'],
      },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        label: 'Tablero',
        href: '/hub/finanzas',
        icon: Activity,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
      {
        label: 'Proveedores',
        href: '/hub/finanzas/proveedores',
        icon: Building2,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
      {
        label: 'Documentos a pagar',
        href: '/hub/finanzas/documentos',
        icon: FileText,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
      {
        label: 'Facturas',
        href: '/hub/facturas',
        icon: FileText,
        roles: ['super_admin', 'gerente', 'administrativo', 'tesoreria', 'auditor'],
      },
      {
        label: 'Pagos',
        href: '/hub/finanzas/pagos',
        icon: Banknote,
        roles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
      },
      {
        label: 'Gastos fijos',
        href: '/hub/finanzas/gastos-fijos',
        icon: Repeat,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
      {
        label: 'Cuentas bancarias',
        href: '/hub/finanzas/cuentas',
        icon: Landmark,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
      {
        label: 'Cash flow',
        href: '/hub/finanzas/cash-flow',
        icon: TrendingUp,
        roles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
      },
      {
        label: 'Conciliación',
        href: '/hub/finanzas/conciliacion',
        icon: Scale,
        roles: ['super_admin', 'gerente', 'tesoreria'],
      },
      {
        label: 'Cheques',
        href: '/hub/finanzas/cheques',
        icon: ReceiptText,
        roles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
      },
      {
        label: 'Impuestos',
        href: '/hub/finanzas/impuestos',
        icon: CalendarClock,
        roles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
      },
    ],
  },
  {
    label: 'Sucursales',
    items: [
      {
        label: 'Caja diaria',
        href: '/hub/sucursales/caja',
        icon: Wallet,
        roles: [
          'super_admin',
          'gerente',
          'administrativo',
          'tesoreria',
          'sucursal',
          'auditor',
        ],
      },
      {
        label: 'Gastos operativos',
        href: '/hub/sucursales/gastos',
        icon: ReceiptText,
        roles: [
          'super_admin',
          'gerente',
          'administrativo',
          'tesoreria',
          'sucursal',
          'auditor',
        ],
      },
      {
        label: 'Performance',
        href: '/hub/sucursales/performance',
        icon: Activity,
        roles: ['super_admin', 'gerente', 'auditor'],
      },
    ],
  },
  {
    label: 'RRHH',
    items: [
      {
        label: 'Empleados',
        href: '/hub/rrhh/empleados',
        icon: UserCog,
        roles: ['super_admin', 'gerente', 'administrativo', 'auditor'],
      },
    ],
  },
  {
    label: 'Aprobaciones',
    items: [
      {
        label: 'Centro de aprobaciones',
        href: '/hub/aprobaciones',
        icon: CheckSquare,
      },
    ],
  },
  {
    label: 'IA',
    items: [
      {
        label: 'Resumen diario',
        href: '/hub/ia/resumen',
        icon: Sparkles,
        roles: ['super_admin', 'gerente', 'auditor'],
      },
      {
        label: 'Validación de tickets',
        href: '/hub/ia/tickets',
        icon: ScanLine,
        roles: ['super_admin', 'gerente', 'administrativo'],
      },
    ],
  },
  {
    label: 'Configuración',
    items: [
      {
        label: 'Sucursales',
        href: '/hub/sucursales',
        icon: Building,
        roles: ['super_admin', 'gerente'],
      },
      {
        label: 'Usuarios',
        href: '/hub/usuarios',
        icon: Users,
        roles: ['super_admin', 'gerente'],
      },
    ],
  },
]

export function visibleHubSections(role: AdminRole): HubNavSection[] {
  return HUB_NAV_SECTIONS
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((s) => s.items.length > 0)
}

/** Link al CRM de pedidos (cross-app shortcut). Visible para todos. */
export const CRM_PEDIDOS_LINK: HubNavItem = {
  label: 'CRM Pedidos',
  href: '/dashboard',
  icon: Briefcase,
  hint: 'Operativa de pedidos',
}

/** Link al panel super-admin nuevo. Visible solo para super_admin. */
export const ADMIN_PANEL_LINK: HubNavItem = {
  label: 'Admin (nuevo)',
  href: '/admin',
  icon: Wallet,
  hint: 'Panel ejecutivo en preview',
  roles: ['super_admin'],
}
