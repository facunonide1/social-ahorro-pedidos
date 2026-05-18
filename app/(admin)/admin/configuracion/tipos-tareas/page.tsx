import { Settings } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { TipoTarea } from '@/lib/types/tareas'
import {
  TAREA_CATEGORIA_LABELS,
  TAREA_PRIORIDAD_LABELS,
} from '@/lib/constants/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/icon'

export const dynamic = 'force-dynamic'

export default async function TiposTareasPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })
  const sb = createClient()
  const { data, error } = await sb
    .from('tipos_tareas')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nombre', { ascending: true })
  const tipos = (data ?? []) as TipoTarea[]

  // Agrupamos por categoría
  const porCategoria = new Map<string, TipoTarea[]>()
  for (const t of tipos) {
    const arr = porCategoria.get(t.categoria) ?? []
    arr.push(t)
    porCategoria.set(t.categoria, arr)
  }

  return (
    <>
      <PageHeader
        title="Tipos de tareas"
        description={`${tipos.length} tipos configurados · permiten precargar workflow, evidencia, plantillas y puntos.`}
        breadcrumbs={[
          { label: 'Configuración' },
          { label: 'Tipos de tareas' },
        ]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {[...porCategoria.entries()].map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {TAREA_CATEGORIA_LABELS[cat as never] ?? cat}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-md text-white"
                        style={{ background: t.color ?? '#94a3b8' }}
                      >
                        {t.icono ? (
                          <Icon name={t.icono} className="size-4" />
                        ) : (
                          <Settings className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate text-sm font-semibold">
                            {t.nombre}
                          </div>
                          {!t.activo && (
                            <Badge variant="secondary" className="text-[10px]">
                              Inactivo
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {t.codigo}
                        </div>
                      </div>
                    </div>
                    {t.descripcion && (
                      <p className="text-xs text-muted-foreground">
                        {t.descripcion}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                      <Stat label="Workflow" value={`${t.niveles_workflow} nivel${t.niveles_workflow > 1 ? 'es' : ''}`} />
                      <Stat
                        label="SLA"
                        value={t.sla_horas ? `${t.sla_horas}h` : '—'}
                      />
                      <Stat
                        label="Prioridad"
                        value={TAREA_PRIORIDAD_LABELS[t.prioridad_default]}
                      />
                      <Stat label="Puntos" value={String(t.puntos_completar)} />
                      <Stat
                        label="Recurrente"
                        value={t.permite_recurrencia ? 'sí' : 'no'}
                      />
                      <Stat
                        label="Auto-generable"
                        value={t.es_auto_generable ? 'sí' : 'no'}
                      />
                    </div>
                    {t.evidencia_requerida.length > 0 && (
                      <div className="flex flex-wrap gap-1 border-t border-border pt-2">
                        {t.evidencia_requerida.map((e) => (
                          <Badge
                            key={e}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {e}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}

        <Alert>
          <AlertDescription className="text-xs">
            La creación / edición visual de tipos (campos custom, builder de
            plantillas, preview en vivo) está planeada para una sub-tanda
            próxima. Por ahora, los tipos se versionan vía SQL en{' '}
            <code>supabase/migrations/0031_seed_tipos_tareas.sql</code> con{' '}
            <code>on conflict do update</code>.
          </AlertDescription>
        </Alert>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
