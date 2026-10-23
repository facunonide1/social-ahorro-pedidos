import Link from 'next/link'
import { Bot, Info, ShieldCheck } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { leerEquipo, type LecturaDeAgente } from '@/lib/agentes/lectura'
import { NIVEL_TEXTO, type Alcance } from '@/lib/agentes/elenco'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'El agente Canal' }

/**
 * A.5 · EL AGENTE CANAL.
 *
 * ── POR QUÉ LA TARJETA MUESTRA LAS SIETE ACCIONES Y NO SÓLO LA FRASE ────────
 *
 * Porque «el agente Canal está en prepara» no dice nada accionable. Lo que
 * importa es qué prepara: cinco cosas de la cadena —el catálogo y el recargo
 * son uno solo para las cuatro sucursales— y dos del local que despacha. Un
 * agente con dos alcances no está mal diseñado: el sector tiene dos.
 *
 * ── Y POR QUÉ NINGUNA ACCIÓN PASA DE «PREPARA» ──────────────────────────────
 *
 * Porque todas terminan en publicar, despublicar o cambiar un precio, y las
 * tres mueven plata de forma visible para un cliente. El techo está declarado
 * en el elenco, no en esta pantalla: si mañana alguien sube el nivel desde
 * Configuración, el elenco lo va a rechazar.
 */
export default async function AgenteCanalPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })

  // El agente Canal tiene acciones en los dos alcances: se leen los dos y se
  // juntan, porque la pantalla es del canal y no de una sucursal.
  const [cadena, sucursal] = await Promise.all([
    leerEquipo(null),
    leerEquipo('__ninguna__').catch(() => null),
  ])

  const canal: LecturaDeAgente | null =
    cadena.agentes.find((l) => l.agente.id === 'canal')
    ?? sucursal?.agentes.find((l) => l.agente.id === 'canal')
    ?? null

  return (
    <>
      <PageHeader
        title="El agente Canal"
        description="Lo que mira, lo que propone hoy y hasta dónde puede llegar."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'El agente' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-5 p-4 md:p-6">
        {canal === null ? (
          <p className="rounded-lg border border-dashed p-6 text-sm leading-snug text-muted-foreground">
            <b>No se pudo leer el agente Canal.</b> No es que no exista: es que la lectura del
            equipo falló y no se sabe qué diría.
          </p>
        ) : (
          <>
            {/* ── LO QUE DICE HOY ──────────────────────────────────────── */}
            <section className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Bot className="size-4" />
                <span className="text-sm font-medium">{canal.agente.nombre}</span>
                <Badge variant="outline" className="text-[10px]">
                  {NIVEL_TEXTO[canal.nivel].t}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {NIVEL_TEXTO[canal.nivel].d}
                </span>
              </div>

              {canal.encendido ? (
                <p className="mt-3 text-sm leading-relaxed">{canal.frase}</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  <p className="text-sm leading-snug">
                    <b>Está callado</b> porque {canal.motivoApagado}.
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    Qué lo enciende: {canal.queLoEnciende}
                  </p>
                </div>
              )}

              {/* El marcador. Hoy vacío, y dicho — no en cero. */}
              <p className="mt-3 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
                {canal.marcador === null || canal.marcador.propuestas === 0 ? (
                  <>
                    <b>Sin antecedentes:</b> nunca se registró una decisión sobre lo que propuso.
                    El marcador no está en cero —cero sería «propuso y se equivocó»—, está vacío.
                    Se llena desde la{' '}
                    <Link href="/admin/decisiones" className="underline decoration-dotted">
                      bitácora de decisiones
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    {canal.marcador.propuestas} propuestas · {canal.marcador.aceptadas} aceptadas ·{' '}
                    {canal.marcador.acertadas} acertadas
                  </>
                )}
              </p>
            </section>

            {/* ── LAS SIETE ACCIONES ───────────────────────────────────── */}
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Qué puede hacer ({canal.agente.acciones.length})
              </h2>
              <div className="divide-y rounded-lg border">
                {canal.agente.acciones.map((a) => {
                  const alcance: Alcance = a.alcance ?? canal.agente.alcance
                  const tope = a.niveles[a.niveles.length - 1]
                  return (
                    <div key={a.clave} className="px-3 py-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{a.nombre}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {alcance === 'cadena' ? 'cadena' : 'por sucursal'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          hasta {NIVEL_TEXTO[tope].t.toLowerCase()}
                        </Badge>
                      </div>
                      {a.techo && (
                        <p className="mt-1 flex gap-1.5 leading-snug text-muted-foreground">
                          <ShieldCheck className="mt-0.5 size-3 shrink-0" />
                          <span>{a.techo}</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            <p className="flex gap-1.5 rounded-lg border border-dashed p-4 text-[11px] leading-snug text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <b>Ninguna de las siete pasa de «prepara».</b> Todas terminan en publicar,
                despublicar o cambiar un precio, y las tres las ve un cliente. El nivel se cambia
                en{' '}
                <Link href="/admin/configuracion" className="underline decoration-dotted">
                  Configuración
                </Link>
                , y el elenco rechaza cualquier nivel por encima del techo declarado.
              </span>
            </p>
          </>
        )}
      </div>
    </>
  )
}
