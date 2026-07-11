import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { Icon } from '@/components/icon'

export type UrgenteItem = {
  id: string
  icono: string
  acento: string
  origen: string
  texto: string
  ruta: string
  severidad: 'info' | 'warn' | 'danger'
}

const SEV_ORDER = { danger: 0, warn: 1, info: 2 } as const
const SEV_DOT: Record<'info' | 'warn' | 'danger', string> = {
  info: 'bg-sky-500', warn: 'bg-amber-500', danger: 'bg-rose-500',
}

/**
 * Zona 3 de Mission Control · "Lo urgente": una lista transversal de lo crítico
 * ya calculable, con chip de la sub-app de origen + acción directa. Ordenada por
 * severidad, máximo 6. Si no hay nada, no se muestra.
 */
export function OsLoUrgente({ items }: { items: UrgenteItem[] }) {
  const orden = [...items].sort((a, b) => SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad]).slice(0, 6)
  if (orden.length === 0) return null

  return (
    <section aria-label="Lo urgente">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lo urgente</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {orden.map((it) => (
          <Link key={it.id} href={it.ruta} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
            <span className={`size-2 shrink-0 rounded-full ${SEV_DOT[it.severidad]}`} />
            <span className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${it.acento}1a`, color: it.acento }}>
              <Icon name={it.icono} className="size-3" />
              {it.origen}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{it.texto}</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  )
}
