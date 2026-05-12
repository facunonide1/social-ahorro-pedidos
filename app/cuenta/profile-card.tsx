'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { UserPedidos } from '@/lib/types'
import { updateAccountName } from '@/app/cuenta/actions'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  name: z
    .string()
    .min(1, 'Ingresá un nombre')
    .max(100, 'Máximo 100 caracteres'),
})

type Values = z.infer<typeof schema>

const ROLE_LABELS: Record<UserPedidos['role'], string> = {
  admin: 'Administrador',
  operador: 'Operador',
  repartidor: 'Repartidor',
}

const ROLE_VARIANTS: Record<UserPedidos['role'], 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  operador: 'secondary',
  repartidor: 'outline',
}

export default function ProfileCard({ profile }: { profile: UserPedidos }) {
  const [currentName, setCurrentName] = useState(profile.name ?? '')

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: currentName },
  })

  async function onSubmit(values: Values) {
    const res = await updateAccountName(values.name)
    if (!res.ok) {
      toast.error('No pudimos guardar el nombre', { description: res.error })
      return
    }
    setCurrentName(res.name)
    form.reset({ name: res.name })
    toast.success('Nombre actualizado')
  }

  const busy = form.formState.isSubmitting
  const dirty = form.formState.isDirty

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información personal</CardTitle>
        <CardDescription>Tu nombre visible y datos de cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Tu nombre" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label htmlFor="cuenta-email" className="flex items-center gap-1.5">
                Email
                <Lock className="size-3 text-muted-foreground" aria-hidden />
              </Label>
              <Input
                id="cuenta-email"
                value={profile.email}
                disabled
                aria-readonly
                className="bg-muted/40"
              />
              <p className="text-[11px] text-muted-foreground">
                El email no se puede cambiar desde acá. Pedile al administrador.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Rol</Label>
              <div>
                <Badge variant={ROLE_VARIANTS[profile.role]}>
                  {ROLE_LABELS[profile.role]}
                </Badge>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy || !dirty}
              className="self-start"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
