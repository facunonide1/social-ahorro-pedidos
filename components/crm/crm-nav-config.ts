import {
  Home,
  Package,
  Users,
  Truck,
  ClipboardList,
  Building2,
  Building,
  FileText,
  Banknote,
  PackageCheck,
  UserCog,
  Settings,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { CrmUser } from '@/lib/hooks/use-crm-user'

export type CrmRole = CrmUser['role']

export type CrmNavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export type CrmNavSection = {
  label: string
  roles: CrmRole[]
  items: CrmNavItem[]
}

export const CRM_NAV_SECTIONS: CrmNavSection[] = [
  {
    label: 'Principal',
    roles: ['admin', 'operador'],
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: Home },
      { label: 'Pedidos', href: '/pedidos', icon: Package },
      { label: 'Clientes', href: '/clientes', icon: Users },
    ],
  },
  {
    label: 'Repartos',
    roles: ['admin', 'operador', 'repartidor'],
    items: [
      { label: 'En camino', href: '/repartidor', icon: Truck },
      { label: 'Historial', href: '/repartidor/historial', icon: ClipboardList },
    ],
  },
  {
    label: 'Operaciones',
    roles: ['admin', 'operador'],
    items: [
      { label: 'Proveedores', href: '/hub/proveedores', icon: Building2 },
      { label: 'Sucursales', href: '/hub/sucursales', icon: Building },
      { label: 'Facturas', href: '/hub/facturas', icon: FileText },
      { label: 'Pagos', href: '/hub/pagos', icon: Banknote },
      { label: 'Recepciones', href: '/hub/recepciones', icon: PackageCheck },
    ],
  },
  {
    label: 'Configuración',
    roles: ['admin'],
    items: [
      { label: 'Usuarios', href: '/hub/usuarios', icon: UserCog },
      { label: 'Preferencias', href: '/admin/configuracion', icon: Settings },
      { label: 'Diagnóstico', href: '/_diag', icon: Wrench },
    ],
  },
]

export function visibleSectionsFor(role: CrmRole): CrmNavSection[] {
  return CRM_NAV_SECTIONS.filter((s) => s.roles.includes(role)).map((s) => ({
    ...s,
    items: s.items,
  }))
}

export function adminHubLinkVisibleFor(role: CrmRole): boolean {
  return role === 'admin'
}
