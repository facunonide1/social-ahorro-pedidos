'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'

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

const schema = z
  .object({
    current: z.string().min(1, 'Ingresá tu contraseña actual'),
    next: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[0-9]/, 'Tiene que incluir al menos un número'),
    repeat: z.string().min(1, 'Repetí la nueva contraseña'),
  })
  .refine((v) => v.next === v.repeat, {
    path: ['repeat'],
    message: 'Las contraseñas no coinciden',
  })

type Values = z.infer<typeof schema>

export default function PasswordCard({ email }: { email: string }) {
  const supabase = createClient()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: '', next: '', repeat: '' },
  })

  async function onSubmit(values: Values) {
    // Re-autenticar con la contraseña actual antes de cambiarla. Esto
    // evita que alguien con sesión secuestrada cambie la pass sin saber
    // la actual.
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password: values.current,
    })
    if (signErr) {
      form.setError('current', { message: 'Contraseña actual incorrecta' })
      return
    }

    const { error: updErr } = await supabase.auth.updateUser({
      password: values.next,
    })
    if (updErr) {
      toast.error('No pudimos cambiar la contraseña', { description: updErr.message })
      return
    }

    toast.success('Contraseña actualizada')
    form.reset({ current: '', next: '', repeat: '' })
  }

  const busy = form.formState.isSubmitting

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguridad</CardTitle>
        <CardDescription>
          Cambiá tu contraseña. Te vamos a pedir la actual antes de actualizarla.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="current"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña actual</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="next"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres, con números"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="repeat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repetir nueva contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={busy} className="self-start">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Cambiando…
                </>
              ) : (
                'Cambiar contraseña'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
