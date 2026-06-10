'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, ShieldCheck, CircleCheck, CircleSlash } from 'lucide-react'
import { toast } from 'sonner'

import { ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/types/admin'
import {
  PERMISO_MODULOS,
  PERMISO_ACCIONES,
  PERMISO_MODULO_LABELS,
  PERMISO_ACCION_LABELS,
  PRESET_POR_ROL,
  permisosEfectivos,
  type MatrizPermisos,
  type PermisosCustom,
} from '@/lib/types/permisos'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

import type { UsuarioAdminRow } from './page'

const NONE = '__none__'
const ROLES = Object.keys(ADMIN_ROLE_LABELS) as AdminRole[]

type Sucursal = { id: string; nombre: string }

export function UsuariosClient({
  usuarios,
  sucursales,
}: {
  usuarios: UsuarioAdminRow[]
  sucursales: Sucursal[]
}) {
  const [editing, setEditing] = useState<UsuarioAdminRow | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Sucursal</th>
              <th className="px-3 py-2 font-medium">Último ingreso</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{u.nombre || '(sin nombre)'}</div>
                  <div className="text-xs text-muted-foreground">{u.email || u.id}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary" className="font-normal">
                    {ADMIN_ROLE_LABELS[u.rol]}
                  </Badge>
                  {Object.keys(u.permisos_custom ?? {}).length > 0 && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-primary">
                      <ShieldCheck className="size-3" /> custom
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {u.sucursal_nombre || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {u.ultimo_login
                    ? new Date(u.ultimo_login).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      })
                    : 'nunca'}
                </td>
                <td className="px-3 py-2">
                  {u.activo ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <CircleCheck className="size-3.5" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleSlash className="size-3.5" /> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No hay usuarios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <UsuarioSheet
          mode="crear"
          sucursales={sucursales}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <UsuarioSheet
          mode="editar"
          usuario={editing}
          sucursales={sucursales}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function UsuarioSheet({
  mode,
  usuario,
  sucursales,
  onClose,
}: {
  mode: 'crear' | 'editar'
  usuario?: UsuarioAdminRow
  sucursales: Sucursal[]
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<AdminRole>(usuario?.rol ?? 'sucursal')
  const [sucursalId, setSucursalId] = useState<string>(usuario?.sucursal_id ?? NONE)
  const [activo, setActivo] = useState<boolean>(usuario?.activo ?? true)

  const [personalizar, setPersonalizar] = useState<boolean>(
    Object.keys(usuario?.permisos_custom ?? {}).length > 0,
  )
  const [matriz, setMatriz] = useState<MatrizPermisos>(() =>
    permisosEfectivos(usuario?.rol ?? 'sucursal', usuario?.permisos_custom),
  )

  // Si no se personaliza, la matriz mostrada sigue al preset del rol.
  const matrizMostrada = useMemo(
    () => (personalizar ? matriz : PRESET_POR_ROL[rol]),
    [personalizar, matriz, rol],
  )

  function onRolChange(nuevo: AdminRole) {
    setRol(nuevo)
    if (!personalizar) setMatriz(PRESET_POR_ROL[nuevo])
  }

  function togglePersonalizar(v: boolean) {
    setPersonalizar(v)
    if (v) setMatriz(matrizMostrada) // arranca desde lo que se ve
  }

  function toggleCelda(modulo: string, accion: string) {
    setMatriz((prev) => ({
      ...prev,
      [modulo]: {
        ...prev[modulo as keyof MatrizPermisos],
        [accion]: !prev[modulo as keyof MatrizPermisos][
          accion as keyof MatrizPermisos[keyof MatrizPermisos]
        ],
      },
    }))
  }

  async function submit() {
    if (mode === 'crear') {
      if (!email.trim() || !password) {
        toast.error('Email y contraseña son obligatorios.')
        return
      }
      if (password.length < 8) {
        toast.error('La contraseña debe tener al menos 8 caracteres.')
        return
      }
    }
    if (rol === 'sucursal' && sucursalId === NONE) {
      toast.error('El rol Sucursal requiere asignar una sucursal.')
      return
    }

    const permisos_custom: PermisosCustom = personalizar
      ? (matriz as unknown as PermisosCustom)
      : {}

    setBusy(true)
    try {
      if (mode === 'crear') {
        const r = await fetch('/api/admin/usuarios', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nombre,
            email,
            password,
            rol,
            sucursal_id: sucursalId === NONE ? null : sucursalId,
            permisos_custom,
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || 'No se pudo crear el usuario.')
        toast.success('Usuario creado.')
      } else {
        const r = await fetch(`/api/admin/usuarios/${usuario!.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            nombre,
            rol,
            sucursal_id: sucursalId === NONE ? null : sucursalId,
            activo,
            permisos_custom,
          }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || 'No se pudo guardar.')
        toast.success('Usuario actualizado.')
      }
      onClose()
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error inesperado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>
            {mode === 'crear' ? 'Nuevo usuario' : 'Editar usuario'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          <Field label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
          </Field>

          {mode === 'crear' ? (
            <>
              <Field label="Email *">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@socialahorro.com"
                />
              </Field>
              <Field label="Contraseña inicial * (mín. 8)">
                <Input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="contraseña temporal"
                />
              </Field>
            </>
          ) : (
            <Field label="Email">
              <Input value={email} disabled />
            </Field>
          )}

          <Field label="Rol">
            <Select value={rol} onValueChange={(v) => onRolChange(v as AdminRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ADMIN_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Sucursal">
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger>
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ninguna</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {mode === 'editar' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              Usuario activo
            </label>
          )}

          {/* Matriz de permisos */}
          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Permisos personalizados</span>
              <input
                type="checkbox"
                checked={personalizar}
                onChange={(e) => togglePersonalizar(e.target.checked)}
                className="size-4 accent-[hsl(var(--primary))]"
              />
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {personalizar
                ? 'Editá la matriz. Sobrescribe el preset del rol.'
                : `Usando el preset del rol "${ADMIN_ROLE_LABELS[rol]}".`}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Módulo</th>
                    {PERMISO_ACCIONES.map((a) => (
                      <th key={a} className="px-1 py-1 text-center font-medium">
                        {PERMISO_ACCION_LABELS[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISO_MODULOS.map((m) => (
                    <tr key={m} className="border-t border-border/60">
                      <td className="py-1.5 pr-2">{PERMISO_MODULO_LABELS[m]}</td>
                      {PERMISO_ACCIONES.map((a) => (
                        <td key={a} className="px-1 py-1.5 text-center">
                          <input
                            type="checkbox"
                            disabled={!personalizar}
                            checked={matrizMostrada[m][a]}
                            onChange={() => toggleCelda(m, a)}
                            className={cn(
                              'size-4 accent-[hsl(var(--primary))]',
                              !personalizar && 'opacity-50',
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button size="lg" disabled={busy} onClick={submit} className="mt-2">
            {busy ? 'Guardando…' : mode === 'crear' ? 'Crear usuario' : 'Guardar cambios'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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
