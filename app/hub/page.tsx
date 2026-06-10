import Link from 'next/link'
import {
  Building2,
  FileText,
  Banknote,
  PackageCheck,
  Building,
  Users,
  Briefcase,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/types/admin'
import { saludoHora } from '@/lib/utils/saludo'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SectionCard = {
  href: string
  title: string
  desc: string
  icon: LucideIcon
  roles?: AdminRole[]
}

const SECTIONS: SectionCard[] = [
  {
    href: '/hub/proveedores',
    title: 'Proveedores',
    desc: 'Maestro de proveedores, contactos, cuentas bancarias y documentos.',
    icon: Building2,
    roles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  },
  {
    href: '/hub/facturas',
    title: 'Facturas',
    desc: 'Facturas de proveedor, estado, vencimientos.',
    icon: FileText,
    roles: ['super_admin', 'gerente', 'administrativo', 'tesoreria', 'auditor'],
  },
  {
    href: '/hub/pagos',
    title: 'Pagos',
    desc: 'Órdenes de pago y conciliación.',
    icon: Banknote,
    roles: ['super_admin', 'gerente', 'tesoreria', 'auditor'],
  },
  {
    href: '/hub/recepciones',
    title: 'Recepciones',
    desc: 'Recepción de mercadería en sucursal.',
    icon: PackageCheck,
    roles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'auditor'],
  },
  {
    href: '/hub/sucursales',
    title: 'Sucursales',
    desc: 'Alta y edición de sucursales.',
    icon: Building,
    roles: ['super_admin', 'gerente'],
  },
  {
    href: '/hub/usuarios',
    title: 'Usuarios',
    desc: 'Admins del Hub y sus roles.',
    icon: Users,
    roles: ['super_admin', 'gerente'],
  },
  {
    href: '/dashboard',
    title: 'CRM Pedidos',
    desc: 'Panel operativo de pedidos de la farmacia.',
    icon: Briefcase,
  },
]

export default async function HubHome() {
  const profile = await requireAdminHubAccess()

  const visible = SECTIONS.filter((s) => !s.roles || s.roles.includes(profile.rol))

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={saludoHora(profile.nombre, profile.email)}
        description={`${ADMIN_ROLE_LABELS[profile.rol]} · NORA HQ`}
      />

      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <SectionLink key={s.href} section={s} />
          ))}
        </section>
      </div>
    </HubShell>
  )
}

function SectionLink({ section }: { section: SectionCard }) {
  const Icon = section.icon
  return (
    <Link href={section.href} className="group">
      <Card
        className={cn(
          'h-full transition-colors hover:border-primary/40 hover:bg-accent/30',
        )}
      >
        <CardContent className="flex h-full flex-col gap-2 p-5">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="text-base font-semibold tracking-tight">{section.title}</div>
          <div className="text-xs leading-relaxed text-muted-foreground">
            {section.desc}
          </div>
          <div className="mt-auto flex items-center gap-1 pt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Abrir
            <ArrowRight className="size-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
