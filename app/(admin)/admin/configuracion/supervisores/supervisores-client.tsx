'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserCheck, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import {
  CATEGORIAS,
  CATEGORIA_LABELS,
  type SupervisorTarea,
  type TareaCategoria,
} from '@/lib/types/tareas-enterprise'
import type { AdminUserOption } from '@/lib/admin-hub/users'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Sucursal = { id: string; nombre: string; codigo: string | null }

export function SupervisoresClient({
  sucursales,
  supervisores,
  users,
  currentUserId,
}: {
  sucursales: Sucursal[]
  supervisores: SupervisorTarea[]
  users: AdminUserOption[]
  currentUserId: string
}) {
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const sb = createClient()

  const userName = (id: string) => {
    const u = users.find((x) => x.id === id)
    return u?.nombre || u?.email || id.slice(0, 8)
  }
  const sucName = (id: string) => {
    const s = sucursales.find((x) => x.id === id)
    return s ? (s.codigo ? `${s.codigo} · ${s.nombre}` : s.nombre) : id.slice(0, 8)
  }

  // Resumen: por cada sucursal, su supervisor o "vacante"
  const resumen = useMemo(
    () =>
      sucursales.map((s) => ({
        sucursal: s,
        sup: supervisores.find((sup) => sup.sucursal_id === s.id),
      })),
    [sucursales, supervisores],
  )

  async function quitar(id: string) {
    if (!confirm('¿Quitar a este supervisor?')) return
    const { error } = await sb.from('supervisores_tareas').update({ activo: false }).eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Supervisor quitado.')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Hoy supervisan
        </div>
        <div className="flex flex-wrap gap-2">
          {resumen.map(({ sucursal, sup }) => (
            <div
              key={sucursal.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm',
                sup ? 'border-border' : 'border-amber-500/40 bg-amber-500/5',
              )}
            >
              <span className="font-medium">{sucursal.codigo || sucursal.nombre}</span>
              <span className="text-muted-foreground">→</span>
              {sup ? (
                <span className="flex items-center gap-1">
                  <UserCheck className="size-3.5 text-emerald-500" />
                  {userName(sup.user_id)}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" /> vacante
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Designar supervisor
        </Button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Sucursal</th>
              <th className="px-3 py-2 font-medium">Supervisor</th>
              <th className="px-3 py-2 font-medium">Categorías</th>
              <th className="px-3 py-2 font-medium">Designado por</th>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {supervisores.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{sucName(s.sucursal_id)}</td>
                <td className="px-3 py-2">{userName(s.user_id)}</td>
                <td className="px-3 py-2">
                  {!s.categorias || s.categorias.length === 0 ? (
                    <Badge variant="secondary" className="font-normal">Todas</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {s.categorias.map((c) => (
                        <Badge key={c} variant="outline" className="font-normal">
                          {CATEGORIA_LABELS[c as TareaCategoria] ?? c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {s.designado_por ? userName(s.designado_por) : '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => quitar(s.id)} aria-label="Quitar supervisor">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {supervisores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No hay supervisores designados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <SupervisorSheet
          sucursales={sucursales}
          users={users}
          currentUserId={currentUserId}
          existentes={supervisores}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

function SupervisorSheet({
  sucursales,
  users,
  currentUserId,
  existentes,
  onClose,
}: {
  sucursales: Sucursal[]
  users: AdminUserOption[]
  currentUserId: string
  existentes: SupervisorTarea[]
  onClose: () => void
}) {
  const router = useRouter()
  const sb = createClient()
  const [busy, setBusy] = useState(false)
  const [sucId, setSucId] = useState('')
  const [userId, setUserId] = useState('')
  const [cats, setCats] = useState<TareaCategoria[]>([])

  function toggleCat(c: TareaCategoria) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  async function submit() {
    if (!sucId || !userId) {
      toast.error('Elegí sucursal y supervisor.')
      return
    }
    const yaExiste = existentes.some((e) => e.sucursal_id === sucId && e.user_id === userId)
    if (yaExiste) {
      toast.error('Ese usuario ya supervisa esa sucursal.')
      return
    }
    setBusy(true)
    const { error } = await sb.from('supervisores_tareas').insert({
      sucursal_id: sucId,
      user_id: userId,
      categorias: cats.length > 0 ? cats : null,
      designado_por: currentUserId,
      activo: true,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Supervisor designado.')
    onClose()
    router.refresh()
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Designar supervisor</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Sucursal">
            <Select value={sucId} onValueChange={setSucId}>
              <SelectTrigger><SelectValue placeholder="Elegí una sucursal" /></SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.codigo ? `${s.codigo} · ` : ''}{s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Supervisor">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Elegí un usuario" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Categorías que supervisa
            </Label>
            <p className="text-xs text-muted-foreground">
              Sin seleccionar = supervisa <b>todas</b> las categorías.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CATEGORIAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  aria-pressed={cats.includes(c)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    cats.includes(c)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {CATEGORIA_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <Button className="mt-2" disabled={busy} onClick={submit}>
            {busy ? 'Guardando…' : 'Designar'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
