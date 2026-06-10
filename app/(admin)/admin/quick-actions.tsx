import Link from 'next/link'
import {
  Plus,
  FileText,
  Banknote,
  CheckCircle2,
  ListPlus,
  PackageX,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

type QuickAction = {
  label: string
  sub?: string
  href: string
  icon: LucideIcon
  color: string
}

const ACTIONS: QuickAction[] = [
  { label: 'Nuevo pedido',      href: '/pedidos/nuevo',                      icon: Plus,         color: 'text-violet-500' },
  { label: 'Cargar factura',    href: '/hub/facturas/nueva',                 icon: FileText,     color: 'text-emerald-500' },
  { label: 'Registrar pago',    href: '/hub/pagos/nuevo',                    icon: Banknote,     color: 'text-sky-500' },
  { label: 'Aprobar pendientes', href: '/hub/aprobaciones',                  icon: CheckCircle2, color: 'text-amber-500' },
  { label: 'Nueva tarea',       href: '/admin/tareas',                       icon: ListPlus,     color: 'text-teal-500' },
  { label: 'Stock crítico',     href: '/hub/operaciones/stock?filtro=critico', icon: PackageX,   color: 'text-rose-500' },
]

/** Grid de 6 acciones rápidas del Mission Control (F6.5.T4). */
export function QuickActions() {
  return (
    <section aria-label="Acciones rápidas">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Acciones rápidas
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-all',
                'hover:scale-[1.02] hover:border-primary/50 hover:shadow-md',
              )}
            >
              <Icon className={cn('size-6', a.color)} />
              <div>
                <div className="text-sm font-medium">{a.label}</div>
                {a.sub && (
                  <div className="text-xs text-muted-foreground">{a.sub}</div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
