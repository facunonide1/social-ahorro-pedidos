import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { Icon } from '@/components/icon'
import { saludoHora } from '@/lib/utils/saludo'
import { ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/types/admin'
import type { AccesoSimple } from '@/lib/constants/vista-rol'

/**
 * Home operativo (vista simple · v0.35).
 *
 * Para roles operativos (cajero/repartidor/empleado general): pocos botones
 * GRANDES, mobile-first, con SOLO lo que su rol puede hacer. Sin sidebar de 9
 * sectores. Los accesos ya vienen filtrados por permisos desde la página.
 */
export function HomeOperativo({
  nombre,
  email,
  rol,
  accesos,
}: {
  nombre: string | null
  email: string
  rol: AdminRole
  accesos: AccesoSimple[]
}) {
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-lg px-4 py-6">
      <header className="mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-muted-foreground">
          {fecha}
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {saludoHora(nombre, email)}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {ADMIN_ROLE_LABELS[rol]} · ¿Qué querés hacer?
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {accesos.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-all active:scale-[0.98] hover:border-nora/40 hover:shadow-md"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-nora-bg text-primary">
              <Icon name={a.icon} className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{a.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.descripcion}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Social Ahorro · NORA HQ
      </p>
    </div>
  )
}
