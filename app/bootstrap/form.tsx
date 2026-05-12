'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  PartyPopper,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

type Status =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'already_bootstrapped' }
  | { kind: 'schema_missing'; hint: string }

const schema = z.object({
  nombre: z
    .string()
    .min(1, 'Ingresá un nombre')
    .max(100, 'Máximo 100 caracteres'),
  email: z.email('Email inválido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128, 'Demasiado largo'),
})

type Values = z.infer<typeof schema>

export default function BootstrapForm() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<{ email: string } | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: 'Admin Principal',
      email: 'admin@socialahorro.com.ar',
      password: '',
    },
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

  async function onSubmit(values: Values) {
    setErr(null)
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) {
        setErr(json?.error || 'error')
        return
      }
      setOk({ email: json.email })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'error_red')
    }
  }

  if (status.kind === 'checking') {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
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
  const busy = form.formState.isSubmitting

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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

        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="Admin Principal" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="admin@socialahorro.com.ar"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Sugerencia: mezclá mayúsculas, números y al menos un símbolo.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={busy} className="mt-1 h-12 w-full">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              Crear super_admin
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}
