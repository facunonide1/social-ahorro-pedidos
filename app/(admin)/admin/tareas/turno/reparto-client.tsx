'use client'

import { useState } from 'react'
import { Loader2, UserCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

/**
 * ── v1.3 · SE SACÓ LA RESTRICCIÓN POR TIPO ──────────────────────────────────
 *
 * Había un tipo de tarea que sólo se podía asignar a un empleado marcado como
 * farmacéutico, y cuando no había ninguno cargado la fila decía «no hay
 * farmacéutico cargado» y no se podía repartir. Encima había un aviso arriba
 * de la pantalla explicando que faltaba declararlo.
 *
 * Era formalización que la operación no necesita (§1 de la v1.3). Cualquiera
 * del turno puede recibir cualquier tarea.
 */
export function RepartoClient({ tareas, gente, repartidas, miSucursal, fecha }: {
  tareas: any[]; gente: any[]; repartidas: any[]
  miSucursal: string | null; fecha: string
}) {
  const [asignado, setAsignado] = useState<Record<string, string>>(
    Object.fromEntries(repartidas.map((r) => [r.tarea_id, r.asignado_a ?? ''])),
  )
  const [guardando, setGuardando] = useState<string | null>(null)

  const sinDuenio = tareas.filter((t) => !t.responsable_id && !asignado[t.id])

  async function repartir(tareaId: string, userId: string) {
    setGuardando(tareaId)
    try {
      const sb = createClient()
      const t = tareas.find((x) => x.id === tareaId)
      const quien = gente.find((g) => g.id === userId)

      // Las dos escrituras: el responsable en la tarea —que es lo que ve quien
      // la tiene que hacer— y el rastro de quién repartió.
      const { error: e1 } = await sb.from('tareas')
        .update({ responsable_id: userId, estado: 'asignada', fecha_asignacion: new Date().toISOString() })
        .eq('id', tareaId)
      if (e1) throw new Error(e1.message)

      const { data: { user } } = await sb.auth.getUser()
      const { error: e2 } = await sb.from('turno_reparto').upsert({
        sucursal_id: t?.sucursal_id ?? miSucursal,
        fecha,
        tarea_id: tareaId,
        asignado_a: userId,
        asignado_nombre: quien?.rol ?? null,
        repartio_por: user?.id ?? null,
      }, { onConflict: 'tarea_id' })
      if (e2) throw new Error(e2.message)

      setAsignado((p) => ({ ...p, [tareaId]: userId }))
      toast.success('Repartida.')
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo repartir.')
    } finally { setGuardando(null) }
  }

  return (
    <div className="space-y-4">
      {sinDuenio.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>{sinDuenio.length} tarea(s) de hoy sin persona.</b> Una tarea sin dueño a las 9 de la
            mañana es una tarea que a las 6 de la tarde nadie hizo. Y lo que no se complete queda en
            el rendimiento del mes de quien la tenía — por eso importa que tenga a alguien.
          </AlertDescription>
        </Alert>
      )}

      <div className="divide-y rounded-lg border">
        {!tareas.length && (
          <p className="p-4 text-sm text-muted-foreground">
            No hay tareas abiertas. Si recién arranca el día, puede ser que las recurrentes todavía
            no se hayan generado: se crean a la hora que tiene cada una.
          </p>
        )}
        {tareas.map((t) => {
          // ── v1.3 · SE SACÓ LA RESTRICCIÓN POR TIPO ─────────────────────
          //
          // Había un tipo de tarea que sólo se podía asignar a un empleado
          // marcado como farmacéutico, y cuando no había ninguno cargado la
          // fila decía «no hay farmacéutico cargado» y no se podía repartir.
          //
          // Era formalización que la operación no necesita: ver §1 de la
          // v1.3. Cualquiera del turno puede recibir cualquier tarea.
          const yaEs = asignado[t.id] || t.responsable_id || ''
          const candidatos = gente

          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.titulo}</span>
                  {t.prioridad === 'alta' && (
                    <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600">alta</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.tipos_tareas?.nombre ?? 'tarea'} ·{' '}
                  {t.fecha_vencimiento
                    ? `vence ${new Date(t.fecha_vencimiento).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : 'sin vencimiento'}
                </div>
              </div>

              {guardando === t.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <select value={yaEs}
                  onChange={(e) => e.target.value && repartir(t.id, e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-xs">
                  <option value="">sin asignar</option>
                  {candidatos.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.rol}</option>
                  ))}
                </select>
              )}
              {yaEs && <UserCheck className="size-4 text-emerald-600" />}
            </div>
          )
        })}
      </div>

      <p className="text-xs leading-snug text-muted-foreground">
        El reparto queda guardado con tu nombre y la hora. No es para controlarte: es para que si una
        tarea no se hizo, la pregunta «¿a quién se le había asignado?» tenga respuesta.
      </p>
    </div>
  )
}
