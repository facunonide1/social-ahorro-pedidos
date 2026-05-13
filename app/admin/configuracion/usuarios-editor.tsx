'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { UserPedidos, UserRole } from '@/lib/types'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  repartidor: 'Repartidor',
}

const ROLE_BADGE_VARIANT: Record<
  UserRole,
  React.ComponentProps<typeof Badge>['variant']
> = {
  admin: 'destructive',
  operador: 'info',
  repartidor: 'success',
}

type Draft = {
  email: string
  password: string
  name: string
  role: UserRole
}

function emptyDraft(): Draft {
  return { email: '', password: '', name: '', role: 'operador' }
}

export default function UsuariosEditor({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserPedidos[]
  currentUserId: string
}) {
  const router = useRouter()
  const sb = createClient()
  const [users, setUsers] = useState(initialUsers)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (!draft.email.trim() || !draft.password || !draft.role) {
      setErr('Email, contraseña y rol son obligatorios.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: draft.email.trim(),
          password: draft.password,
          name: draft.name.trim() || null,
          role: draft.role,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setUsers((arr) => [json.user, ...arr])
      setDraft(emptyDraft())
      setMsg(`Usuario ${json.user?.email} creado.`)
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  async function patchUser(
    u: UserPedidos,
    patch: Partial<Pick<UserPedidos, 'role' | 'active' | 'name'>>,
  ) {
    setErr(null)
    const { data, error } = await sb
      .from('users_pedidos')
      .update(patch)
      .eq('id', u.id)
      .select('*')
      .maybeSingle<UserPedidos>()
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setUsers((arr) => arr.map((x) => (x.id === data.id ? data : x)))
    router.refresh()
  }

  async function removeUser(u: UserPedidos) {
    if (u.id === currentUserId) {
      setErr('No podés eliminar tu propio usuario.')
      return
    }
    if (
      !confirm(
        `¿Eliminar al usuario ${u.name || u.email}? No se puede deshacer.`,
      )
    )
      return
    setErr(null)
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setUsers((arr) => arr.filter((x) => x.id !== u.id))
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    }
  }

  return (
    <div className="space-y-3">
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <form onSubmit={createUser} className="space-y-3">
            <div className="text-sm font-semibold">Nuevo usuario</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_1fr]">
              <Field label="Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="juan@socialahorro.com"
                />
              </Field>
              <Field label="Nombre">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </Field>
              <Field label="Rol">
                <Select
                  value={draft.role}
                  onValueChange={(v) => setDraft({ ...draft, role: v as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="repartidor">Repartidor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Contraseña (mínimo 6 caracteres)">
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder="••••••••"
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creando…
                  </>
                ) : (
                  'Crear usuario'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {users.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay usuarios. Creá el primero arriba.
            </CardContent>
          </Card>
        )}
        {users.map((u) => {
          const isSelf = u.id === currentUserId
          return (
            <Card key={u.id} className={!u.active ? 'opacity-60' : undefined}>
              <CardContent className="grid grid-cols-1 items-center gap-3 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {u.name || u.email}
                    {isSelf && (
                      <Badge variant="info" className="text-[10px]">
                        vos
                      </Badge>
                    )}
                    {!u.active && (
                      <Badge variant="outline" className="text-[10px]">
                        inactivo
                      </Badge>
                    )}
                    <Badge variant={ROLE_BADGE_VARIANT[u.role]} className="text-[10px]">
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {u.email}
                  </div>
                </div>

                <Select
                  value={u.role}
                  disabled={isSelf}
                  onValueChange={(v) => patchUser(u, { role: v as UserRole })}
                >
                  <SelectTrigger
                    className="w-[150px]"
                    title={isSelf ? 'No podés cambiar tu propio rol.' : ''}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                    <SelectItem value="operador">{ROLE_LABELS.operador}</SelectItem>
                    <SelectItem value="repartidor">{ROLE_LABELS.repartidor}</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSelf}
                  onClick={() => patchUser(u, { active: !u.active })}
                  title={isSelf ? 'No podés desactivar tu propio usuario' : ''}
                >
                  {u.active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={isSelf}
                  onClick={() => removeUser(u)}
                  aria-label="Eliminar"
                  className="text-destructive hover:text-destructive"
                  title={isSelf ? 'No podés eliminar tu propio usuario' : 'Eliminar'}
                >
                  <X className="size-4" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        La contraseña sólo se pide al crear el usuario. Si olvidaron la clave,
        usá el panel de Supabase Auth para enviar un reset por mail.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
