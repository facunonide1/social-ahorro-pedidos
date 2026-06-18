import { Sparkles } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'

import { PageHeader } from '@/components/shared/page-header'
import { Markdown } from '@/components/ai/markdown'
import { RegenerarResumenButton } from './regenerar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

type ResumenRow = {
  fecha: string
  resumen_markdown: string
  metricas: Record<string, any> | null
  generado_at: string
}

export default async function ResumenDiarioPage() {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor'],
  })
  const sb = createClient()
  const hoy = new Date().toISOString().slice(0, 10)

  const { data, error } = await sb
    .from('ai_resumenes_diarios')
    .select('fecha, resumen_markdown, metricas, generado_at')
    .eq('fecha', hoy)
    .maybeSingle<ResumenRow>()

  const canGenerate = ['super_admin', 'gerente'].includes(profile.rol)

  return (
    <>
      <PageHeader
        title="Resumen ejecutivo diario"
        description={
          data
            ? `Generado ${new Date(data.generado_at).toLocaleString('es-AR')}`
            : 'Análisis del día generado por IA sobre datos reales del ERP'
        }
        breadcrumbs={[{ label: 'IA' }, { label: 'Resumen diario' }]}
        actions={canGenerate ? <RegenerarResumenButton /> : undefined}
      />

      <div className="space-y-4 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message}
              {error.message.includes('does not exist') && (
                <div className="mt-1 text-xs">
                  Aplicá la migración{' '}
                  <code>0027_ia_aprobaciones_tickets.sql</code>.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!error && !data && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  Todavía no hay resumen para hoy
                </div>
                <div className="mt-1 max-w-sm text-xs text-muted-foreground">
                  El resumen se genera automáticamente cada mañana. También
                  podés generarlo ahora con datos en vivo.
                </div>
              </div>
              {canGenerate && <RegenerarResumenButton label="Generar ahora" />}
            </CardContent>
          </Card>
        )}

        {!error && data && (
          <Card>
            <CardContent className="p-5 md:p-6">
              <Markdown content={data.resumen_markdown} />
            </CardContent>
          </Card>
        )}

        {!error && data && (
          <p className="text-xs text-muted-foreground">
            Resumen generado por IA a partir de las métricas del ERP. Verificá
            los números con las pantallas correspondientes antes de tomar
            decisiones.
          </p>
        )}
      </div>
    </>
  )
}
