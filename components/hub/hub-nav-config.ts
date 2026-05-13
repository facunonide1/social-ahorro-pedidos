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
    ],
  },
  {
    label: 'Finanzas',
    items: [
      {
        label: 'Facturas',
        href: '/hub/facturas',
        icon: FileText,
        roles: ['super_admin', 'gerente', 'administrativo', 'tesoreria', 'auditor'],
      },
      {
        label: 'Pagos',
        href: '/hub/pagos',
        icon: Banknote,
        roles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
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
