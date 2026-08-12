import Link from 'next/link'
import { ClipboardList, History, Upload } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { tituloDePantalla } from '@/lib/os/definicion'

import ListasClient from './listas-client'

export const dynamic = 'force-dynamic'

type Lista = {
  id: string
  zona: string
  descripcion: string | null
  punto_id: string | null
  sucursales: { nombre: string | null } | null
}

export default async function ConteosPage() {
  const titulo = await tituloDePantalla('stock', '/admin/operaciones/conteos', 'Conteos por zona')

  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'comprador'],
  })
  const sb = createClient()

  const [{ data: listas }, { data: conteos }] = await Promise.all([
    sb
      .from('cnt_listas')
      .select('id, zona, descripcion, punto_id, sucursales(nombre)')
      .eq('activa', true)
      .order('zona'),
    sb
      .from('cnt_conteos')
      .select('id, estado, iniciado_at, cerrado_at, items_diferencia, valor_diferencia, cnt_listas(zona)')
      .order('iniciado_at', { ascending: false })
      .limit(30),
  ])

  const filas = (listas ?? []) as unknown as Lista[]

  // Cuántos items tiene cada lista. Se cuenta acá y no en la consulta de arriba
  // porque un `count` embebido con filtro por `activo` no está disponible en el
  // cliente de Supabase, y una lista sin su tamaño no dice nada útil.
  const conteosPorLista = new Map<string, number>()
  const { data: todosLosItems } = await sb
    .from('cnt_lista_items')
    .select('lista_id')
    .eq('activo', true)
  for (const it of (todosLosItems ?? []) as { lista_id: string }[]) {
    conteosPorLista.set(it.lista_id, (conteosPorLista.get(it.lista_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title={titulo}
        description="Se cuenta sin ver lo que el sistema espera. Las diferencias aparecen recién al cerrar."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/operaciones/conteos/historial">
                <History className="mr-2 size-4" />
                Historial
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/operaciones/conteos/importar">
                <Upload className="mr-2 size-4" />
                Importar una lista
              </Link>
            </Button>
          </div>
        }
      />

      {filas.length === 0 ? (
        <Card className="p-6 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay ninguna zona cargada. Empezá importando la planilla de una.
          </p>
        </Card>
      ) : (
        <ListasClient
          listas={filas.map((l) => ({
            id: l.id,
            zona: l.zona,
            descripcion: l.descripcion,
            punto: l.sucursales?.nombre ?? null,
            items: conteosPorLista.get(l.id) ?? 0,
          }))}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Últimos conteos</h2>
        {(conteos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguno todavía. Esto va a estar vacío hasta que alguien cuente una zona —
            no es que no haya diferencias, es que no se contó.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {((conteos ?? []) as unknown as {
              id: string
              estado: string
              iniciado_at: string
              cerrado_at: string | null
              items_diferencia: number | null
              valor_diferencia: number | null
              cnt_listas: { zona: string } | null
            }[]).map((c) => (
              <Link
                key={c.id}
                href={`/admin/operaciones/conteos/${c.id}`}
                className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.cnt_listas?.zona ?? 'zona'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.iniciado_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.estado === 'cerrado' ? (
                    <span className="text-xs text-muted-foreground">
                      {c.items_diferencia ?? 0} con diferencia
                    </span>
                  ) : null}
                  <Badge variant={c.estado === 'cerrado' ? 'secondary' : 'outline'}>{c.estado}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
