import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone, Clock, AlertTriangle } from 'lucide-react'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'El farmacéutico' }

/**
 * E.6 · LLAMAR AL FARMACÉUTICO, Y SABER SI ESTÁ.
 *
 * ── POR QUÉ ESTA PANTALLA NO DICE «DISPONIBLE» ──────────────────────────────
 *
 * Porque el sistema no lo sabe. Lo que sabe es si fichó y si no fichó la
 * salida. Decir «disponible» cuando está atendiendo a otra persona hace que la
 * próxima vez nadie mire la pantalla.
 *
 * Se dice el hecho —«fichó a las 8 y no fichó la salida»— y el empleado
 * decide. Es menos cómodo y es verdad.
 *
 * ── Y ES LA SALIDA DE TODA PREGUNTA CLÍNICA ─────────────────────────────────
 *
 * Cada vez que el mostrador no puede contestar algo, lleva acá. Por eso la
 * pantalla existe aunque hoy no haya ningún farmacéutico cargado: lo dice, y
 * decirlo es la información.
 */
export default async function FarmaceuticoPage() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login?next=/mostrador/farmaceutico')

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) redirect('/hub?denied=1')

  const adm = createAdminClient()
  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre, telefono').eq('activa', true).eq('es_ecommerce', false).order('codigo')
  const mia = me.sucursal_id ?? ((sucs ?? [])[0] as any)?.id

  const { data } = await adm.rpc('mostrador_farmaceuticos', { p_sucursal: mia })
  const f = (data ?? {}) as any
  const aca = (f.aca ?? []) as any[]
  const otras = (f.en_otras ?? []) as any[]

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b p-3">
        <Button size="icon" variant="ghost" asChild className="size-10 shrink-0">
          <Link href="/mostrador" aria-label="Volver"><ArrowLeft className="size-5" /></Link>
        </Button>
        <div className="font-medium">El farmacéutico</div>
      </header>

      <div className="space-y-4 p-3">
        <p className="border-l-2 border-foreground/60 bg-muted/30 p-3 text-sm leading-snug">
          Lo que el sistema no contesta —qué tomar, cuánto, por cuántos días, si se puede combinar,
          si es apto para alguien— lo contesta una persona con matrícula. Esta pantalla dice quién
          es y qué se sabe de si está.
        </p>

        {!f.hay_alguno ? (
          <div className="space-y-2 rounded-lg border border-dashed p-4">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span><b>No hay ningún farmacéutico cargado en el sistema.</b></span>
            </p>
            <p className="text-xs leading-snug text-muted-foreground">{f.por_que_no}</p>
            <p className="text-xs leading-snug">
              Lo que lo enciende: marcar en la ficha de cada empleado quién es farmacéutico y
              cargarle la matrícula, en RRHH → Empleados.
            </p>
            <div className="pt-1">
              {((sucs ?? []) as any[]).filter((s) => s.id === mia && s.telefono).map((s) => (
                <Button key={s.id} size="lg" className="h-12 w-full" asChild>
                  <a href={`tel:${s.telefono}`}>
                    <Phone className="size-5" /> Llamar a {s.nombre}
                  </a>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Acá
              </h2>
              {aca.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-xs leading-snug text-muted-foreground">
                  No hay ningún farmacéutico asignado a esta sucursal.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {aca.map((p, i) => (
                    <li key={i} className="space-y-1 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.nombre}</span>
                        {p.matricula && (
                          <span className="text-xs text-muted-foreground">MN {p.matricula}</span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" /> {p.que_se_sabe}
                      </p>
                      {p.telefono && (
                        <Button size="lg" className="mt-1 h-12 w-full" asChild>
                          <a href={`tel:${p.telefono}`}>
                            <Phone className="size-5" /> Llamar
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {otras.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  En otras sucursales
                </h2>
                <ul className="divide-y rounded-lg border">
                  {otras.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                      <span className="font-medium">{p.nombre}</span>
                      <span className="text-xs text-muted-foreground">{p.sucursal}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.ficho_hoy ? 'fichó hoy' : 'no fichó hoy'}
                      </span>
                      {p.telefono && (
                        <Button size="sm" variant="outline" className="ml-auto" asChild>
                          <a href={`tel:${p.telefono}`}><Phone className="size-4" /></a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="text-xs leading-snug text-muted-foreground">{f.ojo}</p>
      </div>
    </div>
  )
}
