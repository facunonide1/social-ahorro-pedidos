'use client'

import Link from 'next/link'
import { ArrowRight, ExternalLink as ExtLinkIcon } from 'lucide-react'
import { Icon } from '@/components/icon'
import { cn } from '@/lib/utils'
import type { DepartamentoNav } from '@/lib/constants/navegacion'

/**
 * Card grande de un departamento. Se usa en la home `/admin` cuando
 * el usuario no tiene acceso al departamento Ejecutivo (ej: un
 * comprador que entra a /admin debería ver la grilla de departamentos
 * accesibles para elegir).
 */
export function DepartmentCard({ dept }: { dept: DepartamentoNav }) {
  const firstActive = dept.submenu.find((s) => s.estado === 'activo' || s.estado === 'externo')
  const target = dept.estado === 'externo'
    ? dept.externalUrl ?? dept.path
    : firstActive?.path ?? dept.path
  const isExterno = dept.estado === 'externo'
  const isFase2   = dept.estado === 'fase2'

  const innerClass = cn(
    'group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors',
    !isFase2 && 'hover:border-primary/40 hover:bg-accent/40',
    isFase2 && 'opacity-70',
  )

  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 items-center justify-center rounded-lg text-white', dept.color)}>
          <Icon name={dept.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            {dept.label}
            {isExterno && <ExtLinkIcon className="size-3 opacity-60" />}
            {isFase2 && (
              <span className="rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
                Pronto
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {dept.descripcion}
      </p>
      {!isFase2 && (
        <div className="mt-auto flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Ir al departamento
          <ArrowRight className="size-3" />
        </div>
      )}
    </>
  )

  if (isExterno) {
    return (
      <a href={target} target="_blank" rel="noopener noreferrer" className={innerClass}>
        {inner}
      </a>
    )
  }
  if (isFase2) {
    return <div className={innerClass}>{inner}</div>
  }
  return (
    <Link href={target} className={innerClass}>
      {inner}
    </Link>
  )
}
