import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'

type RepStat = {
  id: string
  name: string
  delivered: number
  in_progress: number
  avg_minutes: number | null
}

type ZoneStat = {
  id: string | null
  name: string
  color: string
  total: number
  delivered: number
  avg_minutes: number | null
}

function formatMins(m: number | null) {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export default function TeamStats({
  reps,
  zones,
}: {
  reps: RepStat[]
  zones: ZoneStat[]
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
          Repartidores (últimos 30 días)
        </div>
        {reps.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Todavía no hay repartidores activos con entregas.
          </div>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repartidor</TableHead>
                  <TableHead className="text-right">Entregados</TableHead>
                  <TableHead className="text-right">En progreso</TableHead>
                  <TableHead>Tiempo prom. entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reps.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">{r.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="success">{r.delivered}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.in_progress}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMins(r.avg_minutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-success">
          Zonas (últimos 30 días)
        </div>
        {zones.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Sin datos de zonas en los últimos 30 días.
          </div>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">Total pedidos</TableHead>
                  <TableHead className="text-right">Entregados</TableHead>
                  <TableHead>Tiempo prom. entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id ?? 'sin-zona'}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: z.color }}
                          aria-hidden
                        />
                        <span className="font-semibold">{z.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {z.delivered}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMins(z.avg_minutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  )
}
