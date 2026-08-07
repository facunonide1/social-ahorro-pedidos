'use client'

import { usePathname } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'

/**
 * Cabecera con pestañas del proyecto.
 *
 * Existe como componente cliente por una razón chica y concreta: la pestaña
 * base (`/fabrica/[slug]`) es prefijo de todas las demás, así que la detección
 * de "activo" por prefijo de `PageHeader` la dejaría siempre encendida. Acá se
 * resuelve con comparación exacta.
 */
export function HeaderProyecto({
  slug,
  titulo,
  descripcion,
}: {
  slug: string
  titulo: string
  descripcion?: string
}) {
  const pathname = usePathname() || ''
  const base = `/fabrica/${slug}`

  const tabs = [
    { label: 'Pools', href: base },
    { label: 'Cobertura', href: `${base}/cobertura` },
    { label: 'Moldes', href: `${base}/moldes` },
    { label: 'Censo', href: `${base}/censo` },
    { label: 'Usuarios', href: `${base}/usuarios` },
    { label: 'Actividad', href: `${base}/actividad` },
    { label: 'Configuración', href: `${base}/configuracion` },
  ].map((t) => ({
    ...t,
    active: t.href === base ? pathname === base : pathname.startsWith(t.href),
  }))

  return (
    <PageHeader
      title={titulo}
      description={descripcion}
      breadcrumbs={[{ label: 'Proyectos', href: '/fabrica' }, { label: titulo }]}
      tabs={tabs}
    />
  )
}
