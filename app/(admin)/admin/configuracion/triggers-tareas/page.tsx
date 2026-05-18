import { Zap } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { TareaTriggerAuto, TipoTarea } from '@/lib/types/tareas'

import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const EVENTOS_IMPLEMENTADOS = [
  'factura_proxima_vencer',
  'factura_vencida_sin_pagar',
  'caja_no_cerrada_eod',
]

export default async function TriggersTareasPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente'],
  })
  const sb = createClient()
  const [{ data: triggers, error }, { data: tipos }] = await Promise.all([
    sb
      .from('tareas_triggers_auto')
      .select('*')
      .order('activo', { ascending: false })
      .order('nombre', { ascending: true }),
    sb.from('tipos_tareas').select('id, nombre').eq('activo', true),
  ])
  const items = (triggers ?? []) as TareaTriggerAuto[]
  const tiposById = new Map(
    ((tipos ?? []) as Pick<TipoTarea, 'id' | 'nombre'>[]).map((t) => [t.id, t.nombre]),
  )

  return (
    <>
      <PageHeader
        title="Triggers automáticos"
        description="Reglas que crean tareas cuando ocurre un evento del ERP."
        breadcrumbs={[{ label: 'Configuración' }, { label: 'Triggers' }]}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertDescription className="text-xs">
            El cron <code>/api/cron/check-triggers</code> evalúa estos
            triggers cada hora. Eventos implementados v1:{' '}
            <code>factura_proxima_vencer</code>,{' '}
            <code>factura_vencida_sin_pagar</code> y{' '}
            <code>caja_no_cerrada_eod</code>. El resto se evalúa pero no genera
            tareas hasta tener el hook al evento real.
          </AlertDescription>
        </Alert>

        {items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Zap className="size-6" />
              </div>
              <div className="text-sm text-muted-foreground">
                Todavía no hay triggers configurados. Por ahora se cargan vía
                SQL en la tabla <code>tareas_triggers_auto</code>; el builder
                visual está planeado para una sub-tanda próxima.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((t) => (
              <Card key={t.id} className={t.activo ? '' : 'opacity-60'}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold">
                    {t.nombre}
                  </CardTitle>
                  <Badge
                    variant={t.activo ? 'success' : 'secondary'}
                    className="text-[10px]"
                  >
                    {t.activo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Evento:</span>
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {t.evento}
                    </code>
                    {!EVENTOS_IMPLEMENTADOS.includes(t.evento) && (
                      <Badge variant="warning" className="text-[10px]">
                        no implementado aún
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Crea tarea de tipo:</span>{' '}
                    <span className="font-medium">
                      {tiposById.get(t.tipo_tarea_id) ?? t.tipo_tarea_id.slice(0, 8)}
                    </span>
                  </div>
                  {t.prioridad_override && (
                    <div>
                      <span className="text-muted-foreground">Prioridad override:</span>{' '}
                      <span className="font-medium">{t.prioridad_override}</span>
                    </div>
                  )}
                  {t.vencimiento_horas && (
                    <div>
                      <span className="text-muted-foreground">Vencimiento:</span>{' '}
                      <span className="font-medium">{t.vencimiento_horas}h</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground">
                    <span>{t.ejecuciones_count} ejecuciones</span>
                    {t.ultima_ejecucion && (
                      <span>
                        Última: {new Date(t.ultima_ejecucion).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
