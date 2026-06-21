'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, ShieldCheck, CircleCheck, CircleSlash, KeyRound, Link2,
  UserCog, IdCard, Eye, Search, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { ADMIN_ROLE_LABELS, ROLES_CATALOGO, ROLES_LEGACY, type AdminRole } from '@/lib/types/admin'
import {
  PERMISO_ACCIONES, PERMISO_MODULO_LABELS, PERMISO_ACCION_LABELS, PERMISO_MODULO_GRUPOS,
  PRESET_POR_ROL, permisosEfectivos, diffContraPreset, esOverride,
  type MatrizPermisos, type PermisosCustom, type PermisoModulo,
} from '@/lib/types/permisos'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import type { PersonaRow } from './page'

const NONE = '__none__'
type Sucursal = { id: string; nombre: string }

export function UsuariosClient({ personas, sucursales }: { personas: PersonaRow[]; sucursales: Sucursal[] }) {
  const [editing, setEditing] = useState<PersonaRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [fTipo, setFTipo] = useState<string>('todos')
  const [fRol, setFRol] = useState<string>('todos')
  const [fSuc, setFSuc] = useState<string>('todas')
  const [q, setQ] = useState('')

  const filtradas = useMemo(() => personas.filter((p) => {
    if (fTipo !== 'todos' && p.tipo !== fTipo && !(fTipo === 'sin_acceso' && !p.tieneAcceso)) {
      if (fTipo === 'sin_acceso') return !p.tieneAcceso
      if (fTipo !== p.tipo) return false
    }
    if (fRol !== 'todos' && p.rol !== fRol) return false
    if (fSuc !== 'todas' && p.sucursal_id !== fSuc && !p.sucursales_acceso.includes(fSuc)) return false
    if (q.trim()) {
      const s = q.toLowerCase()
      if (!(p.nombre ?? '').toLowerCase().includes(s) && !p.email.toLowerCase().includes(s) && !(p.puesto ?? '').toLowerCase().includes(s)) return false
    }
    return true
  }), [personas, fTipo, fRol, fSuc, q])

  const sinAcceso = personas.filter((p) => !p.tieneAcceso).length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="text-sm text-muted-foreground">
          {personas.length} personas · {personas.filter((p) => p.tieneAcceso).length} con acceso · {sinAcceso} sin acceso
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus className="size-4" /> Nuevo usuario</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, email, puesto…" className="h-9 w-56 pl-7" />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            <SelectItem value="ambos">Empleado + acceso</SelectItem>
            <SelectItem value="admin">Solo usuario panel</SelectItem>
            <SelectItem value="empleado">Solo empleado</SelectItem>
            <SelectItem value="sin_acceso">Sin acceso al sistema</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fRol} onValueChange={setFRol}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            {ROLES_CATALOGO.map((r) => <SelectItem key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</SelectItem>)}
            {ROLES_LEGACY.map((r) => <SelectItem key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSuc} onValueChange={setFSuc}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las sucursales</SelectItem>
            {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Persona</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Sucursal</th>
              <th className="px-3 py-2 font-medium">Acceso</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p, i) => (
              <tr key={p.userId ?? p.empleadoId ?? i} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.nombre || '(sin nombre)'}</div>
                  <div className="text-xs text-muted-foreground">{p.email || p.puesto || '—'}</div>
                </td>
                <td className="px-3 py-2">
                  <TipoBadge tipo={p.tipo} />
                </td>
                <td className="px-3 py-2">
                  {p.rol ? (
                    <span className="inline-flex items-center gap-1">
                      <Badge variant="secondary" className="font-normal">{ADMIN_ROLE_LABELS[p.rol]}</Badge>
                      {Object.keys(p.permisos_custom ?? {}).length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-primary"><ShieldCheck className="size-3" /> fino</span>}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.sucursal_nombre || '—'}
                  {p.sucursales_acceso.length > 1 && <span className="ml-1 text-[10px]">+{p.sucursales_acceso.length - 1}</span>}
                </td>
                <td className="px-3 py-2">
                  {p.tieneAcceso
                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CircleCheck className="size-3.5" /> Sí</span>
                    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CircleSlash className="size-3.5" /> No</span>}
                </td>
                <td className="px-3 py-2">
                  {p.activo
                    ? <span className="text-xs text-emerald-600">Activo</span>
                    : <span className="text-xs text-muted-foreground">Inactivo</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {p.tieneAcceso
                    ? <Button variant="ghost" size="sm" onClick={() => setEditing(p)}><Pencil className="size-3.5" /> Editar</Button>
                    : <Button variant="outline" size="sm" onClick={() => setEditing(p)}><KeyRound className="size-3.5" /> Dar acceso</Button>}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No hay personas con esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && <PersonaSheet mode="crear" sucursales={sucursales} onClose={() => setCreating(false)} />}
      {editing && (
        <PersonaSheet
          mode={editing.tieneAcceso ? 'editar' : 'dar_acceso'}
          persona={editing}
          sucursales={sucursales}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TipoBadge({ tipo }: { tipo: PersonaRow['tipo'] }) {
  const map = {
    ambos: { label: 'Empleado + panel', icon: UserCog, cls: 'text-primary' },
    admin: { label: 'Usuario panel', icon: ShieldCheck, cls: 'text-blue-600' },
    empleado: { label: 'Empleado', icon: IdCard, cls: 'text-muted-foreground' },
  }[tipo]
  const I = map.icon
  return <span className={cn('inline-flex items-center gap-1 text-xs', map.cls)}><I className="size-3.5" /> {map.label}</span>
}

function PersonaSheet({
  mode, persona, sucursales, onClose,
}: { mode: 'crear' | 'editar' | 'dar_acceso'; persona?: PersonaRow; sucursales: Sucursal[]; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [email, setEmail] = useState(persona?.email ?? '')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<AdminRole>(persona?.rol ?? 'empleado_general')
  const [sucursalId, setSucursalId] = useState<string>(persona?.sucursal_id ?? NONE)
  const [sucAcceso, setSucAcceso] = useState<string[]>(persona?.sucursales_acceso ?? [])
  const [activo, setActivo] = useState<boolean>(persona?.activo ?? true)
  const [tab, setTab] = useState<'datos' | 'permisos' | 'preview'>('datos')

  const [personalizar, setPersonalizar] = useState<boolean>(Object.keys(persona?.permisos_custom ?? {}).length > 0)
  const [matriz, setMatriz] = useState<MatrizPermisos>(() => permisosEfectivos(persona?.rol ?? 'empleado_general', persona?.permisos_custom))

  const esYoSuper = persona?.caller && persona?.rol === 'super_admin'
  const matrizMostrada = personalizar ? matriz : PRESET_POR_ROL[rol]

  // override map para resaltar (solo cuando personaliza)
  const customActual: PermisosCustom = personalizar ? diffContraPreset(rol, matriz) : {}

  function onRolChange(nuevo: AdminRole) {
    setRol(nuevo)
    if (!personalizar) setMatriz(PRESET_POR_ROL[nuevo])
  }
  function togglePersonalizar(v: boolean) {
    setPersonalizar(v)
    if (v) setMatriz(matrizMostrada)
  }
  function toggleCelda(m: PermisoModulo, a: string) {
    setMatriz((prev) => ({ ...prev, [m]: { ...prev[m], [a]: !prev[m][a as keyof MatrizPermisos[PermisoModulo]] } }))
  }
  function toggleSuc(id: string) {
    setSucAcceso((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function submit() {
    if (mode !== 'editar') {
      if (!email.trim() || !password) { toast.error('Email y contraseña son obligatorios.'); return }
      if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres.'); return }
    }
    if ((rol === 'encargado_sucursal' || rol === 'sucursal' || rol === 'cajero') && sucursalId === NONE) {
      toast.error('Este rol requiere una sucursal principal.'); return
    }
    const permisos_custom: PermisosCustom = personalizar ? diffContraPreset(rol, matriz) : {}
    const sucursal_id = sucursalId === NONE ? null : sucursalId

    setBusy(true)
    try {
      if (mode === 'editar') {
        const r = await fetch(`/api/admin/usuarios/${persona!.userId}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nombre, rol, sucursal_id, sucursales_acceso: sucAcceso, activo, permisos_custom }),
        })
        const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'No se pudo guardar.')
        toast.success('Usuario actualizado.')
      } else {
        // dar_acceso (a un empleado) o crear (nuevo)
        const r = await fetch('/api/admin/personas', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accion: 'dar_acceso', empleado_id: persona?.empleadoId ?? null,
            nombre, email, password, rol, sucursal_id, sucursales_acceso: sucAcceso, permisos_custom,
          }),
        })
        const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'No se pudo crear el acceso.')
        toast.success(mode === 'dar_acceso' ? 'Acceso otorgado al empleado.' : 'Usuario creado.')
      }
      onClose(); router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error inesperado.') } finally { setBusy(false) }
  }

  const titulo = mode === 'crear' ? 'Nuevo usuario' : mode === 'dar_acceso' ? `Dar acceso · ${persona?.nombre ?? ''}` : `Editar · ${persona?.nombre ?? ''}`

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{titulo}</SheetTitle></SheetHeader>

        {/* tabs */}
        <div className="mt-3 flex gap-1 border-b border-border text-sm">
          {(['datos', 'permisos', 'preview'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-3 py-1.5 capitalize', tab === t ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground')}>
              {t === 'datos' ? 'Datos y rol' : t === 'permisos' ? 'Permisos' : 'Vista previa'}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-4 pt-4">
          {tab === 'datos' && (
            <>
              <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" /></Field>
              {mode !== 'editar' ? (
                <>
                  <Field label="Email *"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@socialahorro.com" /></Field>
                  <Field label="Contraseña inicial * (mín. 8)"><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="contraseña temporal" /></Field>
                  {mode === 'dar_acceso' && <p className="-mt-2 text-xs text-muted-foreground">Se crea la cuenta de panel y se vincula al legajo de <b>{persona?.nombre}</b>.</p>}
                </>
              ) : <Field label="Email"><Input value={email} disabled /></Field>}

              <Field label="Rol">
                <Select value={rol} onValueChange={(v) => onRolChange(v as AdminRole)} disabled={esYoSuper}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES_CATALOGO.map((r) => <SelectItem key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</SelectItem>)}
                    {persona?.rol && ROLES_LEGACY.includes(persona.rol) && <SelectItem value={persona.rol}>{ADMIN_ROLE_LABELS[persona.rol]}</SelectItem>}
                  </SelectContent>
                </Select>
                {esYoSuper && <p className="mt-1 text-xs text-amber-600">No podés cambiar tu propio rol de super_admin.</p>}
              </Field>

              <Field label="Sucursal principal">
                <Select value={sucursalId} onValueChange={setSucursalId}>
                  <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Ninguna (acceso global)</SelectItem>
                    {sucursales.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Sucursales con acceso (además de la principal)">
                <div className="flex flex-wrap gap-1.5">
                  {sucursales.map((s) => (
                    <button key={s.id} type="button" onClick={() => toggleSuc(s.id)}
                      className={cn('rounded-md border px-2 py-1 text-xs', sucAcceso.includes(s.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Vacío = solo la principal (o global si no hay principal). Se cruza con el selector de sucursal.</p>
              </Field>

              {mode === 'editar' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={activo} disabled={esYoSuper} onChange={(e) => setActivo(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                  Usuario activo {esYoSuper && <span className="text-xs text-amber-600">(no podés desactivarte)</span>}
                </label>
              )}
            </>
          )}

          {tab === 'permisos' && (
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Permisos finos por sector</span>
                <span className="flex items-center gap-1.5 text-xs">
                  Ajustar sobre el rol
                  <input type="checkbox" checked={personalizar} onChange={(e) => togglePersonalizar(e.target.checked)} className="size-4 accent-[hsl(var(--primary))]" />
                </span>
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {personalizar ? 'Editá la matriz. Las celdas en violeta difieren del preset del rol.' : `Mostrando el preset del rol "${ADMIN_ROLE_LABELS[rol]}".`}
              </p>

              <div className="mt-3 space-y-3">
                {PERMISO_MODULO_GRUPOS.map((g) => (
                  <div key={g.grupo}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo}</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="w-1/3 py-1 text-left font-medium">Sector</th>
                          {PERMISO_ACCIONES.map((a) => <th key={a} className="px-1 py-1 text-center font-medium">{PERMISO_ACCION_LABELS[a]}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.modulos.map((m) => (
                          <tr key={m} className="border-t border-border/50">
                            <td className="py-1.5 pr-2">{PERMISO_MODULO_LABELS[m]}</td>
                            {PERMISO_ACCIONES.map((a) => {
                              const ov = personalizar && esOverride(rol, customActual, m, a)
                              return (
                                <td key={a} className="px-1 py-1.5 text-center">
                                  <input type="checkbox" disabled={!personalizar}
                                    checked={matrizMostrada[m][a]} onChange={() => toggleCelda(m, a)}
                                    className={cn('size-4 accent-[hsl(var(--primary))]', !personalizar && 'opacity-50', ov && 'ring-2 ring-primary ring-offset-1 rounded')} />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'preview' && <PreviewAcceso rol={rol} matriz={matrizMostrada} sucursalId={sucursalId} sucAcceso={sucAcceso} sucursales={sucursales} />}

          <Button size="lg" disabled={busy} onClick={submit} className="mt-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === 'crear' ? 'Crear usuario' : mode === 'dar_acceso' ? 'Dar acceso' : 'Guardar cambios'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Vista previa: qué módulos/menú vería este usuario con el rol+permisos. */
function PreviewAcceso({ rol, matriz, sucursalId, sucAcceso, sucursales }: {
  rol: AdminRole; matriz: MatrizPermisos; sucursalId: string; sucAcceso: string[]; sucursales: Sucursal[]
}) {
  const visibles = (Object.keys(PERMISO_MODULO_LABELS) as PermisoModulo[]).filter((m) => matriz[m].ver)
  const sucNombres = [sucursalId !== NONE ? sucursales.find((s) => s.id === sucursalId)?.nombre : null, ...sucAcceso.map((id) => sucursales.find((s) => s.id === id)?.nombre)].filter(Boolean)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Eye className="size-4" /> Qué ve este usuario</div>
        <p className="mt-1 text-xs text-muted-foreground">Rol: <b>{ADMIN_ROLE_LABELS[rol]}</b> · Sucursales: {sucNombres.length ? sucNombres.join(', ') : 'global (todas)'}</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Sectores visibles ({visibles.length}/{Object.keys(PERMISO_MODULO_LABELS).length})</div>
        <div className="space-y-1">
          {visibles.map((m) => {
            const acc = PERMISO_ACCIONES.filter((a) => matriz[m][a])
            return (
              <div key={m} className="flex items-center justify-between gap-2 text-sm">
                <span>{PERMISO_MODULO_LABELS[m]}</span>
                <span className="flex gap-1">
                  {acc.map((a) => <Badge key={a} variant="secondary" className="text-[9px] font-normal">{PERMISO_ACCION_LABELS[a]}</Badge>)}
                </span>
              </div>
            )
          })}
          {visibles.length === 0 && <div className="text-sm text-muted-foreground">Sin acceso a ningún sector.</div>}
        </div>
      </div>
    </div>
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
