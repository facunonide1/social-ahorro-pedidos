import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Phone } from 'lucide-react'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'El farmacéutico' }

/**
 * A.2 · LLAMAR AL FARMACÉUTICO.
 *
 * ── QUÉ CAMBIÓ EN LA v1.3 ───────────────────────────────────────────────────
 *
 * Esta pantalla mostraba matrícula, si había fichado, a qué hora, y cuando no
 * había nadie cargado explicaba largamente que no podía saber si había
 * farmacéutico en el local.
 *
 * Era formalización que la operación no necesita. Ahora: **quién es y su
 * teléfono.** Un tilde en el usuario y el nombre.
 *
 * ── LO QUE NO CAMBIÓ ────────────────────────────────────────────────────────
 *
 * Es la salida de toda pregunta clínica. El sistema sigue sin contestar qué
 * tomar, cuánto ni si se puede combinar — eso no se movió y no se va a mover.
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
  const aca = (f.aca ?? []) as { nombre: string; telefono: string | null }[]
  const otras = (f.en_otras ?? []) as { nombre: string; telefono: string | null; sucursal: string }[]
  const miSuc = ((sucs ?? []) as any[]).find((s) => s.id === mia)

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
          Lo que el sistema no contesta —qué tomar, cuánto, por cuántos días, si se puede
          combinar, si es apto para alguien— lo contesta una persona.
        </p>

        {aca.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {aca.map((p, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1 font-medium">{p.nombre}</span>
                {p.telefono && (
                  <Button size="lg" className="h-12" asChild>
                    <a href={`tel:${p.telefono}`}><Phone className="size-5" /> Llamar</a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed p-4">
            <p className="text-sm leading-snug">
              No hay nadie marcado como farmacéutico en esta sucursal.
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              Se marca con un tilde en Configuración → Usuarios. {f.por_que_no ? '' : null}
            </p>
            {miSuc?.telefono && (
              <Button size="lg" className="mt-1 h-12 w-full" asChild>
                <a href={`tel:${miSuc.telefono}`}>
                  <Phone className="size-5" /> Llamar a {miSuc.nombre}
                </a>
              </Button>
            )}
          </div>
        )}

        {otras.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              En otras sucursales
            </h2>
            <ul className="divide-y rounded-lg border">
              {otras.map((p, i) => (
                <li key={i} className="flex items-center gap-2 p-3 text-sm">
                  <span className="font-medium">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground">{p.sucursal}</span>
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
      </div>
    </div>
  )
}
