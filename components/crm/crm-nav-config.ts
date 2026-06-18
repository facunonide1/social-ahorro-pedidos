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
      { label: 'Proveedores', href: '/admin/proveedores', icon: Building2 },
      { label: 'Sucursales', href: '/admin/sucursales', icon: Building },
      { label: 'Facturas', href: '/admin/finanzas/documentos', icon: FileText },
      { label: 'Pagos', href: '/admin/finanzas/pagos', icon: Banknote },
      { label: 'Recepciones', href: '/admin/recepciones', icon: PackageCheck },
    ],
  },
  {
    label: 'Configuración',
    roles: ['admin'],
    items: [
      { label: 'Usuarios', href: '/admin/usuarios', icon: UserCog },
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
