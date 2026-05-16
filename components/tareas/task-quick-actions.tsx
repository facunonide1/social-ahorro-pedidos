'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  CheckCheck,
  Lock,
  LockOpen,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import type { Tarea, TipoTarea } from '@/lib/types/tareas'
import {
  ACCION_LABELS,
  type TareaAccion,
  accionesDisponibles,
  ejecutarAccion,
} from '@/lib/tareas/workflow'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const ICONS: Record<TareaAccion, React.ComponentType<{ className?: string }>> = {
  iniciar: Play,
  completar_directo: CheckCheck,
  marcar_verificacion: Check,
  verificar: CheckCheck,
  rechazar_verificacion: X,
  aprobar_final: CheckCheck,
  rechazar_final: X,
  descartar: Trash2,
  reabrir: RotateCcw,
  bloquear: Lock,
  desbloquear: LockOpen,
}

/** Acciones que requieren input (motivo o comentario). */
const REQUIERE_INPUT: Partial<Record<TareaAccion, { motivoRequerido: boolean; label: string }>> = {
  completar_directo: { motivoRequerido: false, label: 'Comentario de cierre' },
  marcar_verificacion: { motivoRequerido: false, label: 'Comentario para el verificador' },
  verificar: { motivoRequerido: false, label: 'Comentario de verificación' },
  rechazar_verificacion: { motivoRequerido: true, label: 'Motivo del rechazo' },
  aprobar_final: { motivoRequerido: false, label: 'Comentario' },
  rechazar_final: { motivoRequerido: true, label: 'Motivo del rechazo' },
  descartar: { motivoRequerido: false, label: 'Motivo del descarte' },
}

export function TaskQuickActions({
  tarea,
  tipo,
  currentUserId,
  currentUserRol,
  className,
}: {
  tarea: Tarea
  tipo: TipoTarea | null
  currentUserId: string
  currentUserRol: string
  className?: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [accionDialog, setAccionDialog] = useState<TareaAccion | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const acciones = accionesDisponibles(currentUserId, currentUserRol, tarea, tipo)

  async function ejecutar(accion: TareaAccion, payload: { motivo?: string; comentario?: string } = {}) {
    setBusy(true)
    const res = await ejecutarAccion(sb, {
      tarea,
      tipo,
      userId: currentUserId,
      rolGlobal: currentUserRol,
      accion,
      payload,
    })
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error ?? 'No se pudo ejecutar la acción.')
      return
    }
    toast.success(ACCION_LABELS[accion] + ' OK')
    setAccionDialog(null)
    setInput('')
    router.refresh()
  }

  async function onClickAccion(accion: TareaAccion) {
    // Acciones que requieren validar evidencia (las hace el workflow)
    // o que requieren input → abrir dialog.
    if (REQUIERE_INPUT[accion]) {
      setAccionDialog(accion)
      setInput('')
      return
    }
    await ejecutar(accion)
  }

  if (acciones.length === 0) return null

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {acciones.map((a) => {
          const Icon = ICONS[a]
          const variant: 'default' | 'outline' | 'ghost' =
            a === 'verificar' || a === 'aprobar_final' || a === 'completar_directo'
              ? 'default'
              : a === 'rechazar_verificacion' ||
                  a === 'rechazar_final' ||
                  a === 'descartar'
                ? 'outline'
                : 'outline'
          const tone =
            a === 'rechazar_verificacion' || a === 'rechazar_final' || a === 'descartar'
              ? 'text-destructive hover:text-destructive'
              : undefined
          return (
            <Button
              key={a}
              size="sm"
              variant={variant}
              onClick={() => onClickAccion(a)}
              disabled={busy}
              className={cn('gap-1.5', tone)}
            >
              <Icon className="size-3.5" />
              {ACCION_LABELS[a]}
            </Button>
          )
        })}
      </div>

      <Dialog
        open={accionDialog !== null}
        onOpenChange={(o) => !o && setAccionDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {accionDialog ? ACCION_LABELS[accionDialog] : 'Acción'}
            </DialogTitle>
          </DialogHeader>
          {accionDialog && (
            <div className="space-y-2">
              <Label className="text-xs">
                {REQUIERE_INPUT[accionDialog]?.label}
                {REQUIERE_INPUT[accionDialog]?.motivoRequerido && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                autoFocus
              />
              {(accionDialog === 'marcar_verificacion' ||
                accionDialog === 'completar_directo') &&
                tipo?.evidencia_requerida.length ? (
                <p className="text-xs text-warning">
                  Este tipo de tarea requiere evidencias:{' '}
                  {tipo.evidencia_requerida.join(', ')}. Cargalas desde el
                  detalle antes de cerrar.
                </p>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAccionDialog(null)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!accionDialog) return
                const cfg = REQUIERE_INPUT[accionDialog]
                if (cfg?.motivoRequerido && !input.trim()) {
                  toast.error('Tenés que indicar un motivo.')
                  return
                }
                const key = cfg?.motivoRequerido ? 'motivo' : 'comentario'
                ejecutar(accionDialog, { [key]: input.trim() || undefined })
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
