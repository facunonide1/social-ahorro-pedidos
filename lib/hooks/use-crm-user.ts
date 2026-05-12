'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserPedidos } from '@/lib/types'

export type CrmUser = UserPedidos

export function useCrmUser() {
  const [user, setUser] = useState<CrmUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      try {
        const { data: authData } = await supabase.auth.getUser()
        if (cancelled) return
        if (!authData.user) {
          setUser(null)
          setIsLoading(false)
          return
        }

        const { data, error: dbError } = await supabase
          .from('users_pedidos')
          .select('id, email, name, role, active')
          .eq('id', authData.user.id)
          .maybeSingle<CrmUser>()

        if (cancelled) return

        if (dbError) {
          setUser(null)
          setError(new Error(dbError.message))
        } else if (!data || !data.active) {
          setUser(null)
          setError(data ? new Error('user_not_active') : new Error('user_not_found'))
        } else {
          setUser(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { user, isLoading, error }
}
