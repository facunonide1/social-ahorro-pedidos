'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MapPin, Plus, X } from 'lucide-react'

import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import type { AdminRole, Sucursal } from '@/lib/types/admin'
import type { UsuarioRow } from './page'

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

const NONE = '__none__'

const ALL_ROLES: AdminRole[] = [
  'super_admin',
  'gerente',
  'comprador',
  'administrativo',
  'tesoreria',
  'auditor',
  'sucursal',
]

const ROLE_BADGE_VARIANT: Record<AdminRole, React.ComponentProps<typeof Badge>['variant']> = {
  super_admin: 'destructive',
  gerente: 'info',
  comprador: 'info',
  administrativo: 'success',
  tesoreria: 'warning',
  auditor: 'outline',
  sucursal: 'secondary',
}

type CreatingState = {
  email: string
  nombre: string
  password: string
  rol: AdminRole
  sucursal_id: string
}

function emptyCreating(): CreatingState {
  return {
    email: '',
    nombre: '',
    password: '',
    rol: 'administrativo',
    sucursal_id: '',
  }
}

export default function UsuariosEditor({
  initialUsers,
  sucursales,
  currentUserId,
}: {
  initialUsers: UsuarioRow[]
  sucursales: Pick<Sucursal, 'id' | 'nombre' | 'activa'>[]
  currentUserId: string
}) {
  const router = useRouter()
  const [users, setUsers] = useState<UsuarioRow[]>(initialUsers)
  const [creating, setCreating] = useState<CreatingState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function createUser() {
    if (!creating) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/hub/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: creating.email,
          password: creating.password,
          nombre: creating.nombre,
          rol: creating.rol,
          sucursal_id: creating.rol === 'sucursal' ? creating.sucursal_id : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setMsg(`Usuario ${json.email} creado.`)
      setCreating(null)
      router.refresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  async function patch(
    u: UsuarioRow,
    body: { rol?: AdminRole; sucursal_id?: string | null; activo?: boolean },
  ) {
    setErr(null)
    const res = await fetch(`/api/hub/usuarios/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      setErr(json?.error || 'error')
      return
    }
    if (json.user)
      setUsers((arr) => arr.map((x) => (x.id === u.id ? { ...x, ...json.user } : x)))
    router.refresh()
  }

  async function remove(u: UsuarioRow) {
    if (!confirm(`¿Eliminar a ${u.nombre || u.email}? No se puede deshacer.`)) return
    setErr(null)
    const res = await fetch(`/api/hub/usuarios/${u.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json?.error || 'error')
      return
    }
    setUsers((arr) => arr.filter((x) => x.id !== u.id))
    router.refresh()
  }

  const sucursalesActivas = sucursales.filter((s) => s.activa)

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

      <div className="flex justify-end">
        <Button
          variant={creating ? 'outline' : 'default'}
          onClick={() => setCreating(creating ? null : emptyCreating())}
        >
          {creating ? (
            'Cancelar'
          ) : (
            <>
              <Plus className="size-4" />
              Nuevo usuario
            </>
          )}
        </Button>
      </div>

      {creating && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">Crear usuario</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_1fr]">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  type="email"
                  value={creating.email}
                  onChange={(e) => setCreating({ ...creating, email: e.target.value })}
                  placeholder="usuario@socialahorro.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Nombre
                </Label>
                <Input
                  value={creating.nombre}
                  onChange={(e) => setCreating({ ...creating, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rol
                </Label>
                <Select
                  value={creating.rol}
                  onValueChange={(v) => setCreating({ ...creating, rol: v as AdminRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ADMIN_ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div
              className={
                creating.rol === 'sucursal'
                  ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
                  : 'grid grid-cols-1 gap-3'
              }
            >
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Contraseña (mín. 8)
                </Label>
                <Input
                  type="password"
                  value={creating.password}
                  onChange={(e) =>
                    setCreating({ ...creating, password: e.target.value })
                  }
                />
              </div>
              {creating.rol === 'sucursal' && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sucursal asignada
                  </Label>
                  <Select
                    value={creating.sucursal_id || NONE}
                    onValueChange={(v) =>
                      setCreating({
                        ...creating,
                        sucursal_id: v === NONE ? '' : v,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {sucursalesActivas.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={createUser} disabled={busy} size="sm">
                {busy ? 'Creando…' : 'Crear'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {users.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Sin usuarios.
            </CardContent>
          </Card>
        )}
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.id === currentUserId}
            sucursales={sucursales}
            onPatch={patch}
            onRemove={remove}
          />
        ))}
      </div>

      <p className="pt-2 text-xs text-muted-foreground">
        Para resetear la contraseña de alguien, usá el panel Authentication de
        Supabase (no exponemos endpoint para evitar tomar la cuenta de otros
        admins).
      </p>
    </div>
  )
}

function UserRow({
  user: u,
  isSelf,
  sucursales,
  onPatch,
  onRemove,
}: {
  user: UsuarioRow
  isSelf: boolean
  sucursales: Pick<Sucursal, 'id' | 'nombre' | 'activa'>[]
  onPatch: (
    u: UsuarioRow,
    body: { rol?: AdminRole; sucursal_id?: string | null; activo?: boolean },
  ) => void | Promise<void>
  onRemove: (u: UsuarioRow) => void | Promise<void>
}) {
  const variant = ROLE_BADGE_VARIANT[u.rol]
  return (
    <Card className={!u.activo ? 'opacity-60' : undefined}>
      <CardContent className="grid grid-cols-1 items-center gap-3 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {u.nombre || u.email}
            {isSelf && (
              <Badge variant="info" className="text-[10px]">
                vos
              </Badge>
            )}
            {!u.activo && (
              <Badge variant="outline" className="text-[10px]">
                inactivo
              </Badge>
            )}
            <Badge variant={variant} className="text-[10px] capitalize">
              {ADMIN_ROLE_LABELS[u.rol]}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{u.email}</div>
          {u.sucursal_nombre && (
            <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {u.sucursal_nombre}
            </div>
          )}
        </div>

        <Select
          value={u.rol}
          disabled={isSelf}
          onValueChange={(v) => onPatch(u, { rol: v as AdminRole })}
        >
          <SelectTrigger className="w-[160px]" title={isSelf ? 'No podés cambiar tu propio rol' : ''}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ADMIN_ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {u.rol === 'sucursal' ? (
          <Select
            value={u.sucursal_id || NONE}
            disabled={isSelf}
            onValueChange={(v) => onPatch(u, { sucursal_id: v === NONE ? null : v })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="— Sin sucursal —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Sin sucursal —</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={isSelf}
            onClick={() => onPatch(u, { activo: !u.activo })}
            title={isSelf ? 'No podés desactivarte a vos mismo' : ''}
          >
            {u.activo ? 'Desactivar' : 'Activar'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isSelf}
            onClick={() => onRemove(u)}
            aria-label="Eliminar usuario"
            className="text-destructive hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
