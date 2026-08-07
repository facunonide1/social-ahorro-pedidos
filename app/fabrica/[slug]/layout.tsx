import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

import { HeaderProyecto } from '@/components/fabrica/header-proyecto'
import { traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await traerProyecto(params.slug)
  return { title: p?.nombre ?? 'Proyecto' }
}

export default async function ProyectoLayout({
  children,
  params,
}: {
  children: ReactNode
  params: { slug: string }
}) {
  // Si el usuario no tiene acceso, RLS devuelve null y la respuesta es la misma
  // que si el proyecto no existiera. Es lo correcto: "existe pero no podés
  // verlo" ya es información sobre un cliente ajeno.
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  return (
    <>
      <HeaderProyecto
        slug={proyecto.slug}
        titulo={proyecto.nombre}
        descripcion={proyecto.descripcion ?? undefined}
      />
      {children}
    </>
  )
}
