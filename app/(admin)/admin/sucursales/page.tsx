import Link from 'next/link'
import { Mail, MapPin, Phone, Plus } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Sucursal } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SucursalesPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })
  const sb = createClient()

  const { data: sucursales, error } = await sb
    .from('sucursales')
    .select('*')
    .order('activa', { ascending: false })
    .order('nombre', { ascending: true })
    .returns<Sucursal[]>()

  const list = sucursales ?? []

  return (
    <>
      <PageHeader
        title="Sucursales"
        description={`${list.length} sucursal${list.length === 1 ? '' : 'es'}`}
        actions={
          <Button asChild>
            <Link href="/hub/sucursales/nueva">
              <Plus className="size-4" />
              Nueva sucursal
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-3 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {list.length === 0 && !error && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Todavía no hay sucursales cargadas.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((s) => (
            <SucursalCard key={s.id} sucursal={s} />
          ))}
        </div>
      </div>
    </>
  )
}

function SucursalCard({ sucursal: s }: { sucursal: Sucursal }) {
  const direccion = [s.direccion, s.localidad, s.provincia].filter(Boolean).join(', ')

  return (
    <Link href={`/hub/sucursales/${s.id}`} className="group">
      <Card
        className={cn(
          'h-full transition-colors hover:border-primary/40 hover:bg-accent/30',
          !s.activa && 'opacity-60',
        )}
      >
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-semibold">{s.nombre}</div>
              {s.codigo && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Código {s.codigo}
                </div>
              )}
            </div>
            {s.activa ? (
              <Badge variant="success">Activa</Badge>
            ) : (
              <Badge variant="outline">Inactiva</Badge>
            )}
          </div>

          {direccion ? (
            <div className="flex gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="leading-relaxed">{direccion}</span>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground">
              Sin dirección cargada
            </div>
          )}

          {(s.telefono || s.email) && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {s.telefono && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {s.telefono}
                </span>
              )}
              {s.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {s.email}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
