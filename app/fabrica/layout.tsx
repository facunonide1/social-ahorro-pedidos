import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { requireFabricaAccess, sinMembresia } from '@/lib/fabrica/auth'
import { ShellFabrica } from '@/components/fabrica/shell-fabrica'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'Fábrica', template: '%s · Fábrica' },
  description: 'Compone software de gestión a partir de piezas declaradas.',
}

/**
 * Layout raíz de la FÁBRICA.
 *
 * Deliberadamente NO usa `OsShell`: la fábrica no es una sub-app de NORA OS,
 * es otro producto que convive en el mismo repo. Si mañana se muda a su propio
 * repo, esta carpeta y las tablas `fab_*` se van enteras.
 */
export default async function FabricaLayout({ children }: { children: ReactNode }) {
  const acceso = await requireFabricaAccess()

  if (sinMembresia(acceso)) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md text-center">
          <h1 className="font-[family-name:var(--font-fraunces)] text-2xl">
            La fábrica está cerrada para vos
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Tu cuenta existe, pero todavía nadie te sumó a un proyecto. Pedile a
            quien administra la fábrica que te invite y volvé a entrar.
          </p>
          <a
            href="/admin"
            className="mt-6 inline-block text-sm text-primary hover:underline"
          >
            Volver a NORA OS
          </a>
        </div>
      </div>
    )
  }

  return (
    <ShellFabrica email={acceso.email} esDueno={acceso.esDueno}>
      {children}
    </ShellFabrica>
  )
}
