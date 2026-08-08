'use server'

import { revalidatePath } from 'next/cache'

import { puedeArmar, puedeVer, requireFabricaAccess } from '@/lib/fabrica/auth'
import { conversar, type Turno } from '@/lib/fabrica/chat'
import { traerProyecto } from '@/lib/fabrica/datos'
import { aplicar, proponer, rechazar, revertirPropuesta } from '@/lib/fabrica/propuestas'
import { verificarPool } from '@/lib/fabrica/verificador'
import type { Overrides } from '@/lib/fabrica/overrides'

async function permiso(slug: string) {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto) return { ok: false as const, error: 'No se encontró el proyecto.' }
  if (!puedeArmar(acceso, proyecto.id)) {
    return { ok: false as const, error: 'Tu rol en este proyecto no alcanza para decidir en el Taller.' }
  }
  return { ok: true as const, proyecto, acceso }
}

export async function accionProponer(
  slug: string,
  clave: string,
  cambio: Overrides,
  porque: string,
): Promise<{ ok: boolean; carril?: string; error?: string }> {
  const p = await permiso(slug)
  if (!p.ok) return { ok: false, error: p.error }

  const r = await proponer({
    proyectoId: p.proyecto.id,
    clave,
    cambio,
    porque,
    autorId: p.acceso.usuarioId,
  })
  revalidatePath(`/fabrica/${slug}/taller`)
  return { ok: r.ok, carril: r.propuesta?.carril, error: r.error }
}

export async function accionAplicar(
  slug: string,
  propuestaId: string,
  nota?: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = await permiso(slug)
  if (!p.ok) return { ok: false, error: p.error }
  const r = await aplicar({ propuestaId, autorId: p.acceso.usuarioId, nota })
  revalidatePath(`/fabrica/${slug}/taller`)
  return { ok: r.ok, error: r.error }
}

export async function accionRechazar(
  slug: string,
  propuestaId: string,
  nota: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = await permiso(slug)
  if (!p.ok) return { ok: false, error: p.error }
  const r = await rechazar({ propuestaId, autorId: p.acceso.usuarioId, nota })
  revalidatePath(`/fabrica/${slug}/taller`)
  return r
}

export async function accionRevertirPropuesta(
  slug: string,
  propuestaId: string,
  nota: string,
): Promise<{ ok: boolean; error?: string }> {
  const p = await permiso(slug)
  if (!p.ok) return { ok: false, error: p.error }
  const r = await revertirPropuesta({ propuestaId, autorId: p.acceso.usuarioId, nota })
  revalidatePath(`/fabrica/${slug}/taller`)
  return r
}

/** "Verificar este pool ahora", sin esperar a que alguien navegue. */
export async function accionVerificar(
  slug: string,
  clave: string,
): Promise<{ ok: boolean; resumen?: string; error?: string }> {
  const p = await permiso(slug)
  if (!p.ok) return { ok: false, error: p.error }

  const r = await verificarPool({
    proyectoId: p.proyecto.id,
    clave,
    autorId: p.acceso.usuarioId,
    origen: 'provocada',
  })
  revalidatePath(`/fabrica/${slug}/taller`)
  // EL MOTIVO MANDA SOBRE LOS NÚMEROS.
  //
  // Antes se mostraba el motivo sólo si no había pantallas declaradas. Un pool
  // APAGADO declara ocho pantallas y no verifica ninguna: el resumen decía
  // "0/8 resueltas · 0 cableadas · 0 problema(s)" y se comía el "el lector está
  // apagado". Tres ceros tranquilizadores tapando la única frase que importaba.
  return {
    ok: true,
    resumen: r.motivo
      ? r.motivo
      : `${r.resueltas}/${r.declaradas} resueltas · ${r.cableadas} cableadas · ${r.diferencias} problema(s).`,
  }
}

/**
 * Hablar con NORA sobre esta declaración.
 *
 * Nota el permiso: para conversar alcanza con VER, para proponer hace falta
 * ARMAR. Y el que sólo puede ver no recibe una versión del chat que se
 * autolimite por texto: recibe una a la que ni siquiera se le ofrece la
 * herramienta de proponer.
 */
export async function accionConversar(
  slug: string,
  historia: Turno[],
  mensaje: string,
): Promise<{ ok: boolean; texto?: string; carril?: string; error?: string }> {
  const acceso = await requireFabricaAccess()
  const proyecto = await traerProyecto(slug)
  if (!proyecto) return { ok: false, error: 'No se encontró el proyecto.' }
  if (!puedeVer(acceso, proyecto.id)) return { ok: false, error: 'No tenés acceso a este proyecto.' }

  const r = await conversar({
    proyectoId: proyecto.id,
    usuarioId: acceso.usuarioId,
    puedeProponer: puedeArmar(acceso, proyecto.id),
    historia,
    mensaje,
  })
  if (r.propuestaId) revalidatePath(`/fabrica/${slug}/taller`)
  return { ok: true, texto: r.texto, carril: r.carril }
}
