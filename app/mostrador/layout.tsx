import type { ReactNode } from 'react'

/**
 * F.4 · LA PANTALLA DE MOSTRADOR.
 *
 * ── POR QUÉ ESTÁ FUERA DE `(admin)` ────────────────────────────────────────
 *
 * Porque `(admin)` envuelve todo con el shell: el dock de sub-apps, Mission
 * Control, el ⌘K y las acciones rápidas. Eso está bien en un escritorio y está
 * mal acá: el mostrador se usa con alguien esperando del otro lado, y cada
 * cosa que no es lo que se está buscando es una cosa que se toca por error.
 *
 * Sin menú, sin dock, sin breadcrumbs. Lo que se necesita y nada más.
 *
 * El guard de sesión lo pone cada página: el layout no hace nada más que
 * sacar el cromo.
 */
export const metadata = {
  title: 'Mostrador',
  // Se usa en el celular, con una mano. Que no se pueda hacer zoom por error
  // mientras se tipea un nombre.
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
}

export default function MostradorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      {children}
    </div>
  )
}
