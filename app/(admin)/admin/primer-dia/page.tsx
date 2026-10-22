import Link from 'next/link'
import { Check, CircleDashed, CircleAlert, HelpCircle } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { primerDia, type EstadoPaso } from '@/lib/os/primer-dia'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

/**
 * F.4 · LA PANTALLA DEL PRIMER DÍA.
 *
 * Lo que falta para que el lunes entren cuatro encargados y trabajen.
 *
 * Es sólo para los dueños y la gerencia: un encargado no tiene por qué ver la
 * lista de lo que la cadena todavía no cargó, y la mitad de los links lo
 * mandarían a pantallas donde no tiene permiso.
 */

const PINTA: Record<EstadoPaso, { icono: typeof Check; clase: string; texto: string }> = {
  hecho:             { icono: Check,         clase: 'text-emerald-600', texto: 'hecho' },
  parcial:           { icono: CircleAlert,   clase: 'text-amber-600',   texto: 'a medias' },
  falta:             { icono: CircleDashed,  clase: 'text-muted-foreground', texto: 'falta' },
  no_se_pudo_saber:  { icono: HelpCircle,    clase: 'text-muted-foreground', texto: 'no se pudo saber' },
}

export default async function PrimerDiaPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const { pasos, listo } = await primerDia()

  const hechos = pasos.filter((p) => p.estado === 'hecho').length
  const bloqueando = pasos.filter((p) => p.bloquea && p.estado !== 'hecho')

  return (
    <div className="container mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        title="El primer día"
        description="Qué falta para que esto arranque con gente de verdad."
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{hechos}</span>
          <span className="text-sm text-muted-foreground">de {pasos.length} pasos</span>
        </div>
        <p className="mt-2 text-sm leading-snug text-muted-foreground">
          {listo ? (
            <>Está todo. El sistema puede abrir un lunes.</>
          ) : bloqueando.length ? (
            <>
              Hay {bloqueando.length} paso(s) que <b>frenan a los demás</b>:{' '}
              {bloqueando.map((p) => p.titulo.toLowerCase()).join('; ')}. El resto se puede
              cargar después, pero sin esto lo que se cargue no se apoya en nada.
            </>
          ) : (
            <>Lo que frena ya está. Lo que queda se puede ir cargando con el sistema andando.</>
          )}
        </p>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Ningún paso se marca solo por existir la pantalla: se marca cuando hay datos. Y lo que no
          se puede contar queda en «no se pudo saber», no en hecho.
        </p>
      </section>

      <div className="space-y-2">
        {pasos.map((p, i) => {
          const pinta = PINTA[p.estado]
          const Icono = pinta.icono
          return (
            <div key={p.clave}
              className={`rounded-lg border p-4 ${p.estado === 'hecho' ? 'bg-muted/30' : 'bg-card'}`}>
              <div className="flex items-start gap-3">
                <Icono className={`mt-0.5 size-4 shrink-0 ${pinta.clase}`} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    <span className="font-medium leading-tight">{p.titulo}</span>
                    <Badge variant="outline" className={`text-[10px] ${pinta.clase}`}>
                      {pinta.texto}
                    </Badge>
                    {p.bloquea && p.estado !== 'hecho' && (
                      <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                        frena a los demás
                      </Badge>
                    )}
                    {p.cuantos != null && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {p.cuantos.toLocaleString('es-AR')}
                        {p.de_cuantos != null && ` de ${p.de_cuantos.toLocaleString('es-AR')}`}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{p.que_es}</p>
                  {p.que_hacer && (
                    <p className="text-xs leading-snug">{p.que_hacer}</p>
                  )}
                  {p.estado !== 'hecho' && (
                    <Button size="sm" variant="outline" className="mt-1.5" asChild>
                      <Link href={p.href}>Ir</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
