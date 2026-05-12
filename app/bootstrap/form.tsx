'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, PartyPopper } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Status =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'already_bootstrapped' }
  | { kind: 'schema_missing'; hint: string }

export default function BootstrapForm() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<{ email: string } | null>(null)
  const [form, setForm] = useState({
    nombre: 'Admin Principal',
    email: 'admin@socialahorro.com.ar',
    password: '',
  })

  useEffect(() => {
    fetch('/api/admin/bootstrap')
      .then((r) => r.json())
      .then((j) => {
        if (j?.error === 'users_admin_no_existe_o_sin_acceso') {
          setStatus({ kind: 'schema_missing', hint: j.hint ?? '' })
        } else if (j?.bootstrapped) {
          setStatus({ kind: 'already_bootstrapped' })
        } else {
          setStatus({ kind: 'ready' })
        }
      })
      .catch(() =>
        setStatus({ kind: 'schema_missing', hint: 'No pude consultar el estado.' }),
      )
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (form.password.length < 8) {
      setErr('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setOk({ email: json.email })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    } finally {
      setBusy(false)
    }
  }

  if (status.kind === 'checking') {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Chequeando estado…
      </div>
    )
  }

  if (status.kind === 'schema_missing') {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Falta aplicar migraciones</AlertTitle>
          <AlertDescription>
            <p className="mt-1">
              Antes de crear el primer administrador hay que correr las migraciones{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">0017_fix_handle_new_user_trigger.sql</code>{' '}
              y{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">0016_admin_hub_schema.sql</code>{' '}
              (en ese orden) en el SQL Editor de Supabase.
            </p>
            {status.hint && (
              <p className="mt-2 text-xs opacity-80">{status.hint}</p>
            )}
          </AlertDescription>
        </Alert>
        <Button onClick={() => location.reload()} className="w-full">
          Ya las corrí, revisar de nuevo
        </Button>
      </div>
    )
  }

  if (status.kind === 'already_bootstrapped') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="size-12 text-success" aria-hidden />
        <h2 className="text-lg font-bold">El Admin Hub ya está configurado</h2>
        <p className="text-sm text-muted-foreground">
          Ya existe al menos un super_admin activo. Para agregar más usuarios, iniciá sesión con uno existente.
        </p>
        <Button asChild className="w-full">
          <a href="/login">
            Ir al login
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
    )
  }

  if (ok) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <PartyPopper className="size-12 text-primary" aria-hidden />
        <h2 className="text-xl font-bold">Super admin creado</h2>
        <Alert variant="success" className="text-left">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            <span className="font-semibold">{ok.email}</span>
          </AlertDescription>
        </Alert>
        <p className="text-xs text-muted-foreground">
          Guardá la contraseña que elegiste — no la podemos recuperar desde acá.
        </p>
        <Button asChild className="w-full">
          <a href="/login">
            Ir al login
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
    )
  }

  // status.kind === 'ready'
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight">Crear primer super_admin</h2>
        <p className="text-xs text-muted-foreground">
          Este formulario se desactiva apenas exista un super_admin. Elegí una contraseña fuerte y anotá los datos.
        </p>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor="bootstrap-nombre"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Nombre
        </Label>
        <Input
          id="bootstrap-nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Admin Principal"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="bootstrap-email"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Email
        </Label>
        <Input
          id="bootstrap-email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="admin@socialahorro.com.ar"
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="bootstrap-password"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Contraseña <span className="font-normal normal-case text-muted-foreground/80">(mínimo 8)</span>
        </Label>
        <Input
          id="bootstrap-password"
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <p className="text-[11px] text-muted-foreground">
          Sugerencia: mezclá mayúsculas, números y al menos un símbolo.
        </p>
      </div>

      <Button type="submit" disabled={busy} className="mt-1 h-12 w-full">
        {busy ? 'Creando…' : (
          <>
            Crear super_admin
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  )
}
