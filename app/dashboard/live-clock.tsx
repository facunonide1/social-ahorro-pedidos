'use client'

import { useEffect, useState } from 'react'

function format(now: Date) {
  const fecha = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const hora = now.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return { fecha, hora }
}

export default function LiveClock() {
  const [{ fecha, hora }, set] = useState(() => format(new Date()))

  useEffect(() => {
    const t = setInterval(() => set(format(new Date())), 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm font-medium capitalize text-foreground">{fecha}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{hora}</span>
    </span>
  )
}
