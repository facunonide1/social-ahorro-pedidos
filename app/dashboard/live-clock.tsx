'use client'

import { useEffect, useState } from 'react'

function format(now: Date) {
  const fecha = now.toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const hora = now.toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
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
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2a2a', textTransform: 'capitalize' }}>
        {fecha}
      </span>
      <span style={{ fontSize: 11, color: '#999' }}>{hora}</span>
    </div>
  )
}
