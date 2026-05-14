import { Fragment } from 'react'

import { cn } from '@/lib/utils'

/**
 * Renderer de markdown mínimo para el contenido que genera la IA
 * (resumen diario, respuestas). Soporta encabezados (#, ##, ###),
 * bullets (-, *), negrita (**texto**) y párrafos. Es a propósito
 * acotado: la IA solo usa este subset.
 */
export function Markdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let bullets: string[] = []

  const flushBullets = () => {
    if (bullets.length === 0) return
    blocks.push(
      <ul
        key={`ul-${blocks.length}`}
        className="my-2 ml-4 list-disc space-y-1 text-sm"
      >
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/)
    if (bulletMatch) {
      bullets.push(bulletMatch[1])
      continue
    }
    flushBullets()
    if (!line.trim()) continue

    if (line.startsWith('### ')) {
      blocks.push(
        <h4
          key={blocks.length}
          className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          {renderInline(line.slice(4))}
        </h4>,
      )
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h3
          key={blocks.length}
          className="mt-4 text-sm font-bold tracking-tight text-foreground"
        >
          {renderInline(line.slice(3))}
        </h3>,
      )
    } else if (line.startsWith('# ')) {
      blocks.push(
        <h2
          key={blocks.length}
          className="mt-4 text-base font-bold tracking-tight text-foreground"
        >
          {renderInline(line.slice(2))}
        </h2>,
      )
    } else {
      blocks.push(
        <p key={blocks.length} className="text-sm leading-relaxed text-foreground">
          {renderInline(line)}
        </p>,
      )
    }
  }
  flushBullets()

  return <div className={cn('space-y-1', className)}>{blocks}</div>
}

/** Resuelve **negrita** dentro de una línea. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={i}>{p}</Fragment>
  })
}
