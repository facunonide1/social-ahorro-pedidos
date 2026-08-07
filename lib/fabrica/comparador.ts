import { createClient } from '@/lib/supabase/server'
import { SUBAPPS } from '@/lib/os/subapps'
import { TOOL_META } from '@/lib/ai/tool-meta'

import type { Diferencia, Manifiesto, ResultadoVerificacion } from './tipos'

/**
 * Comparador DECLARACIÓN ↔ CÓDIGO.
 *
 * Una declaración en modo espejo es una afirmación sobre el código: "Ofertas
 * tiene estas 14 entidades y estas 11 pantallas". Una afirmación que nadie
 * verifica se pudre sola: el código cambia, la declaración no, y un día la
 * fábrica arma un proyecto con una pieza que ya no es la que cree.
 *
 * SI DIFIEREN, SE CORRIGE LA DECLARACIÓN. El código de un sector que funciona
 * no se toca para que la fábrica cierre sus números.
 *
 * FRONTERA: este archivo IMPORTA de Social Ahorro (el registry de sub-apps y el
 * catálogo de herramientas del asistente) y no escribe una sola línea en él. La
 * dependencia va en un solo sentido, que es la regla.
 *
 * QUÉ SE PUEDE VERIFICAR DE VERDAD, y qué no:
 *
 *   entidades → contra el catálogo de Postgres. Verificación exacta y en los
 *               dos sentidos: qué declara y no existe, qué existe y no declara.
 *   acciones  → contra TOOL_META, que es la fuente única de las herramientas
 *               del asistente. Exacta y en los dos sentidos.
 *   pantallas → contra el registry de navegación. PARCIAL a propósito: el
 *               registry dice qué se puede navegar desde la sub-app, no qué
 *               rutas existen en disco. Una ficha de detalle no está en el
 *               registry y eso es normal. Por eso las diferencias de pantalla
 *               se reportan como "no navegable", no como "no existe": decir
 *               "falta en el código" cuando la pantalla existe sería mentir.
 */

/** Por defecto una pantalla se navega desde el menú, salvo que diga lo contrario. */
function declaraNavegable(p: { navegable?: boolean }): boolean {
  return p.navegable !== false
}

export async function verificarEspejo(
  manifiesto: Manifiesto,
  prefijosTabla: string[],
): Promise<ResultadoVerificacion> {
  const diferencias: Diferencia[] = []

  try {
    const sb = createClient()

    /* ── Entidades ───────────────────────────────────────────────────── */
    const declaradas = manifiesto.entidades.map((e) => e.tabla)
    const propias = manifiesto.entidades
      .filter((e) => e.acceso === 'propia')
      .map((e) => e.tabla)

    const [{ data: existen }, { data: porPrefijo }] = await Promise.all([
      sb.rpc('fab_tablas_existentes', { p_nombres: declaradas }),
      sb.rpc('fab_tablas_con_prefijo', { p_prefijos: prefijosTabla }),
    ])

    const enEsquema = new Set(((existen ?? []) as { tabla: string }[]).map((r) => r.tabla))
    const delSector = ((porPrefijo ?? []) as { tabla: string }[]).map((r) => r.tabla)

    for (const t of declaradas) {
      if (!enEsquema.has(t)) {
        diferencias.push({
          tipo: 'entidad',
          elemento: t,
          en_declaracion: true,
          en_codigo: false,
          nota: 'Declarada, pero no existe ninguna tabla con ese nombre.',
        })
      }
    }

    const declaradasSet = new Set(propias)
    for (const t of delSector) {
      if (!declaradasSet.has(t)) {
        diferencias.push({
          tipo: 'entidad',
          elemento: t,
          en_declaracion: false,
          en_codigo: true,
          nota: 'Existe en el esquema y el manifiesto no la menciona.',
        })
      }
    }

    /* ── Acciones del asistente ──────────────────────────────────────── */
    const meta = TOOL_META as Record<string, { capa: string; modulo?: string }>
    const declaradasAcc = new Set(manifiesto.acciones.map((a) => a.clave))

    for (const a of manifiesto.acciones) {
      if (!meta[a.clave]) {
        diferencias.push({
          tipo: 'accion',
          elemento: a.clave,
          en_declaracion: true,
          en_codigo: false,
          nota: 'Declarada, pero el asistente no tiene una herramienta con esa clave.',
        })
      }
    }

    for (const [clave, m] of Object.entries(meta)) {
      if (m.modulo === manifiesto.pool && !declaradasAcc.has(clave)) {
        diferencias.push({
          tipo: 'accion',
          elemento: clave,
          en_declaracion: false,
          en_codigo: true,
          nota: 'El asistente la ofrece y el manifiesto no la declara.',
        })
      }
    }

    /* ── Pantallas (verificación parcial: navegación) ────────────────── */
    const subApp = SUBAPPS.find((s) => s.id === manifiesto.pool)
    if (!subApp) {
      diferencias.push({
        tipo: 'pantalla',
        elemento: manifiesto.pool,
        en_declaracion: true,
        en_codigo: false,
        nota: 'No hay sub-app registrada con esa clave: no se puede verificar la navegación.',
      })
    } else {
      const navegables = new Set(subApp.modulos.map((m) => m.ruta))
      const declaradasPant = new Set(manifiesto.pantallas.map((p) => p.ruta))

      for (const p of manifiesto.pantallas) {
        const dice = declaraNavegable(p)
        const esta = navegables.has(p.ruta)
        if (dice && !esta) {
          diferencias.push({
            tipo: 'pantalla',
            elemento: p.ruta,
            en_declaracion: true,
            en_codigo: false,
            nota: 'Declarada como navegable, pero el menú de la sub-app no la lleva.',
          })
        } else if (!dice && esta) {
          diferencias.push({
            tipo: 'pantalla',
            elemento: p.ruta,
            en_declaracion: true,
            en_codigo: true,
            nota: 'Declarada como no navegable, pero el menú de la sub-app sí la lleva.',
          })
        }
      }

      for (const m of subApp.modulos) {
        if (!declaradasPant.has(m.ruta)) {
          diferencias.push({
            tipo: 'pantalla',
            elemento: m.ruta,
            en_declaracion: false,
            en_codigo: true,
            nota: 'El menú de la sub-app la navega y el manifiesto no la declara.',
          })
        }
      }

      /* ── Permisos ──────────────────────────────────────────────────── */
      const declaradosPerm = new Set(manifiesto.permisos)
      for (const perm of subApp.permisosRequeridos) {
        if (!declaradosPerm.has(perm)) {
          diferencias.push({
            tipo: 'permiso',
            elemento: perm,
            en_declaracion: false,
            en_codigo: true,
            nota: 'La sub-app lo exige y el manifiesto no lo declara.',
          })
        }
      }
      for (const perm of manifiesto.permisos) {
        if (!(subApp.permisosRequeridos as string[]).includes(perm)) {
          diferencias.push({
            tipo: 'permiso',
            elemento: perm,
            en_declaracion: true,
            en_codigo: false,
            nota: 'Declarado, pero la sub-app no lo exige.',
          })
        }
      }
    }
  } catch {
    // No se muestra el error técnico: no le sirve a nadie que lo vaya a leer.
    return {
      resultado: 'error',
      diferencias: [],
      faltan_en_codigo: 0,
      faltan_en_declaracion: 0,
      resumen: 'No se pudo leer el esquema para comparar. Probá de nuevo en un rato.',
    }
  }

  const faltanEnCodigo = diferencias.filter((d) => d.en_declaracion && !d.en_codigo).length
  const faltanEnDeclaracion = diferencias.filter((d) => !d.en_declaracion && d.en_codigo).length

  return {
    resultado: diferencias.length === 0 ? 'coincide' : 'difiere',
    diferencias,
    faltan_en_codigo: faltanEnCodigo,
    faltan_en_declaracion: faltanEnDeclaracion,
    resumen: redactarResumen(diferencias, faltanEnCodigo, faltanEnDeclaracion),
  }
}

function redactarResumen(
  diferencias: Diferencia[],
  faltanEnCodigo: number,
  faltanEnDeclaracion: number,
): string {
  if (diferencias.length === 0) {
    return 'La declaración coincide con el código.'
  }

  const partes: string[] = []
  if (faltanEnDeclaracion > 0) {
    partes.push(
      `${faltanEnDeclaracion} ${faltanEnDeclaracion === 1 ? 'cosa está' : 'cosas están'} en el código y no en la declaración`,
    )
  }
  if (faltanEnCodigo > 0) {
    partes.push(
      `${faltanEnCodigo} ${faltanEnCodigo === 1 ? 'está declarada' : 'están declaradas'} y no se encontraron`,
    )
  }
  const otras = diferencias.length - faltanEnCodigo - faltanEnDeclaracion
  if (otras > 0) {
    partes.push(`${otras} ${otras === 1 ? 'pantalla existe' : 'pantallas existen'} pero no se navegan`)
  }

  return partes.join('; ') + '.'
}
