import type { Manifiesto } from './tipos'

/**
 * Validador del FORMATO del manifiesto (versión 1.0.0).
 *
 * Separado del comparador a propósito, porque responden dos preguntas
 * distintas:
 *
 *   comparador → ¿la declaración coincide con el CÓDIGO?
 *   validador  → ¿la declaración está bien FORMADA, y es coherente con las
 *                otras declaraciones?
 *
 * El validador no toca la base. Corre sobre datos en memoria, así que se puede
 * ejecutar antes de commitear sin credenciales de nada.
 */

export const FORMATO_ACTUAL = '1.0.0'

export interface Problema {
  campo: string
  mensaje: string
  gravedad: 'error' | 'aviso'
}

const MOLDES_VALIDOS = new Set([
  'lista_maestra', 'ficha', 'tablero', 'bandeja', 'wizard',
  'chat', 'formulario', 'feed', 'calendario', 'otro',
])
const ACCIONES_PERMISO = new Set(['ver', 'crear', 'editar', 'aprobar', 'eliminar'])
const PARTICIPACIONES = new Set(['sugiere', 'prepara', 'hace_y_avisa', 'nunca'])
const CAPACIDADES = new Set([
  'cargar', 'recomendar', 'detectar', 'ejecutar', 'responder', 'explicar', 'priorizar',
])

/** Valida un manifiesto solo, sin mirar a los demás. */
export function validarManifiesto(m: Manifiesto): Problema[] {
  const p: Problema[] = []
  const err = (campo: string, mensaje: string) => p.push({ campo, mensaje, gravedad: 'error' })
  const avi = (campo: string, mensaje: string) => p.push({ campo, mensaje, gravedad: 'aviso' })

  if (m.formato !== FORMATO_ACTUAL) {
    err('formato', `es "${m.formato}" y el esquema vigente es ${FORMATO_ACTUAL}`)
  }
  if (!m.pool || !/^[a-z][a-z0-9-]*$/.test(m.pool)) {
    err('pool', 'la clave debe ser minúsculas, números y guiones')
  }
  if (!m.nombre) err('nombre', 'falta')

  // Un núcleo desinstalable no es un núcleo; un vertical no-desinstalable ata el
  // proyecto a un rubro para siempre. Las dos combinaciones son errores de
  // modelo, no de tipeo.
  if (m.categoria === 'nucleo' && m.desinstalable) {
    err('desinstalable', 'un pool de núcleo no puede ser desinstalable')
  }
  if (m.categoria === 'vertical' && !m.desinstalable) {
    err('desinstalable', 'un pool vertical tiene que poder sacarse: si no, ata el proyecto a un rubro')
  }

  /* ── Entidades ─────────────────────────────────────────────────────── */
  if (m.entidades.length === 0) avi('entidades', 'el pool no declara ninguna entidad')
  const propias = m.entidades.filter((e) => e.acceso === 'propia')
  if (propias.length === 0) {
    avi('entidades', 'ninguna entidad propia: el pool no es dueño de nada')
  }
  const vistas = new Set<string>()
  for (const e of m.entidades) {
    if (vistas.has(e.tabla)) err(`entidades.${e.tabla}`, 'declarada dos veces')
    vistas.add(e.tabla)
    if (!e.rol) err(`entidades.${e.tabla}`, 'falta el rol en una línea')
    if (e.acceso === 'leida' && e.escriben_otros) {
      err(`entidades.${e.tabla}`, 'escriben_otros sólo tiene sentido sobre una entidad propia')
    }
    if (e.acceso === 'propia' && e.dueno) {
      err(`entidades.${e.tabla}`, 'una entidad propia no declara dueño ajeno')
    }
    if (e.acceso === 'leida' && !e.dueno) {
      avi(`entidades.${e.tabla}`, 'entidad leída sin dueño declarado: no se sabe a qué pool pedirle cambios')
    }
    if (e.referencia_abierta && !e.referencia_abierta.nota) {
      err(`entidades.${e.tabla}`, 'una referencia abierta sin nota no se entiende desde afuera')
    }
  }

  /* ── Pantallas ─────────────────────────────────────────────────────── */
  const rutas = new Set<string>()
  for (const s of m.pantallas) {
    if (rutas.has(s.ruta)) err(`pantallas.${s.ruta}`, 'declarada dos veces')
    rutas.add(s.ruta)
    if (!MOLDES_VALIDOS.has(s.molde)) err(`pantallas.${s.ruta}`, `molde desconocido: ${s.molde}`)
    if (!s.titulo) err(`pantallas.${s.ruta}`, 'falta el título')
    // Una prestada con permiso propio es una contradicción: si el permiso lo
    // pone este pool, la pantalla no es de otro.
    if (s.pertenencia === 'prestada' && s.permiso) {
      err(`pantallas.${s.ruta}`, 'una pantalla prestada no declara permiso propio')
    }
  }

  /* ── Acciones ──────────────────────────────────────────────────────── */
  const claves = new Set<string>()
  for (const a of m.acciones) {
    if (claves.has(a.clave)) err(`acciones.${a.clave}`, 'declarada dos veces')
    claves.add(a.clave)
    if (!a.descripcion) {
      err(`acciones.${a.clave}`, 'sin descripción: es lo que lee una persona antes de confirmar')
    }
  }

  /* ── Permisos ──────────────────────────────────────────────────────── */
  if (m.permisos.length === 0) avi('permisos', 'el pool no exige ningún permiso')
  for (const perm of m.permisos) {
    if (perm.acciones.length === 0) err(`permisos.${perm.modulo}`, 'sin acciones')
    for (const a of perm.acciones) {
      if (!ACCIONES_PERMISO.has(a)) err(`permisos.${perm.modulo}`, `acción desconocida: ${a}`)
    }
  }

  /* ── Agentes ───────────────────────────────────────────────────────── */
  for (const ag of m.agentes ?? []) {
    if (!ag.trabajo) err(`agentes.${ag.clave}`, 'sin trabajo declarado en lenguaje de negocio')
    if (ag.acciones.length === 0) err(`agentes.${ag.clave}`, 'un agente sin acciones no hace nada')
    for (const acc of ag.acciones) {
      if (!PARTICIPACIONES.has(acc.participacion)) {
        err(`agentes.${ag.clave}.${acc.clave}`, `participación desconocida: ${acc.participacion}`)
      }
      // Lo que más importa que esté escrito: por qué se le permitió actuar solo.
      if (acc.participacion === 'hace_y_avisa' && !acc.motivo) {
        err(
          `agentes.${ag.clave}.${acc.clave}`,
          'hace_y_avisa sin motivo: hay que poder leer por qué se le dejó actuar solo',
        )
      }
      // La regla dice que hace_y_avisa es sólo para lo reversible y sin efecto
      // sobre plata. En modo espejo aparecen automatizaciones que ya la violan.
      // Se avisa, no se rechaza: el manifiesto describe lo que hay, y ocultarlo
      // sería declarar un sistema que no existe.
      if (acc.participacion === 'hace_y_avisa' && acc.reversible === false) {
        avi(
          `agentes.${ag.clave}.${acc.clave}`,
          'actúa solo y NO es reversible. Debería bajar a prepara',
        )
      }
      if (acc.participacion === 'hace_y_avisa' && acc.toca_dinero) {
        avi(
          `agentes.${ag.clave}.${acc.clave}`,
          'actúa solo y toca dinero. Debería bajar a prepara',
        )
      }
    }
    for (const c of ag.capacidades) {
      if (!CAPACIDADES.has(c)) err(`agentes.${ag.clave}`, `capacidad desconocida: ${c}`)
    }
    // El techo de permisos del agente no puede exceder el del pool que lo aporta.
    for (const perm of ag.permisos) {
      const delPool = m.permisos.find((x) => x.modulo === perm.modulo)
      if (!delPool) {
        err(`agentes.${ag.clave}`, `pide el módulo "${perm.modulo}" que el pool no declara`)
        continue
      }
      for (const a of perm.acciones) {
        if (!delPool.acciones.includes(a)) {
          err(
            `agentes.${ag.clave}`,
            `pide "${perm.modulo}.${a}" y el pool no lo tiene: un agente nunca supera a quien lo creó`,
          )
        }
      }
    }
  }

  return p
}

/**
 * Valida el catálogo entero: lo que un manifiesto solo no puede saber.
 *
 * Acá se contrasta `usado_por` contra el `depende_de` de los demás. Es la razón
 * por la que la relación inversa se puede declarar sin que se pudra: está
 * duplicada, pero la duplicación se verifica.
 */
export function validarCatalogo(manifiestos: Manifiesto[]): Problema[] {
  const p: Problema[] = []
  const porClave = new Map(manifiestos.map((m) => [m.pool, m]))
  const declarados = new Set(porClave.keys())

  for (const m of manifiestos) {
    for (const dep of m.depende_de) {
      if (!declarados.has(dep)) {
        p.push({
          campo: `${m.pool}.depende_de`,
          mensaje: `necesita "${dep}", que todavía no está declarado`,
          gravedad: 'aviso',
        })
      }
    }

    // usado_por ↔ depende_de, en los dos sentidos, sólo entre declarados.
    for (const usuario of m.usado_por ?? []) {
      const otro = porClave.get(usuario)
      if (!otro) {
        p.push({
          campo: `${m.pool}.usado_por`,
          mensaje: `dice que "${usuario}" lo usa; no se puede verificar hasta declararlo`,
          gravedad: 'aviso',
        })
        continue
      }
      if (!otro.depende_de.includes(m.pool)) {
        p.push({
          campo: `${m.pool}.usado_por`,
          mensaje: `dice que "${usuario}" lo usa, pero "${usuario}" no lo declara en depende_de`,
          gravedad: 'error',
        })
      }
    }
    for (const otro of manifiestos) {
      if (otro.pool === m.pool) continue
      if (otro.depende_de.includes(m.pool) && !(m.usado_por ?? []).includes(otro.pool)) {
        p.push({
          campo: `${m.pool}.usado_por`,
          mensaje: `"${otro.pool}" depende de él y no figura en usado_por`,
          gravedad: 'error',
        })
      }
    }
  }

  // Dos pools no pueden ser dueños de la misma tabla. Es LA contradicción que
  // rompe la instalación: al instalar los dos, uno pisa al otro.
  const dueno = new Map<string, string>()
  for (const m of manifiestos) {
    for (const e of m.entidades.filter((x) => x.acceso === 'propia')) {
      const previo = dueno.get(e.tabla)
      if (previo && previo !== m.pool) {
        p.push({
          campo: `entidades.${e.tabla}`,
          mensaje: `la declaran propia "${previo}" y "${m.pool}": una tabla tiene un solo dueño`,
          gravedad: 'error',
        })
      }
      dueno.set(e.tabla, m.pool)
    }
  }

  // Una entidad leída que nombra un dueño ya declarado tiene que coincidir.
  for (const m of manifiestos) {
    for (const e of m.entidades) {
      if (e.acceso !== 'leida' || !e.dueno) continue
      const real = dueno.get(e.tabla)
      if (real && real !== e.dueno) {
        p.push({
          campo: `${m.pool}.entidades.${e.tabla}`,
          mensaje: `la da por dueña de "${e.dueno}" y la declara propia "${real}"`,
          gravedad: 'error',
        })
      }
    }
  }

  // Una pantalla no puede ser propia de dos pools.
  const duenoPantalla = new Map<string, string>()
  for (const m of manifiestos) {
    for (const s of m.pantallas.filter((x) => x.pertenencia !== 'prestada')) {
      const previo = duenoPantalla.get(s.ruta)
      if (previo && previo !== m.pool) {
        p.push({
          campo: `pantallas.${s.ruta}`,
          mensaje: `la reclaman "${previo}" y "${m.pool}"; una tiene que declararla prestada`,
          gravedad: 'error',
        })
      }
      duenoPantalla.set(s.ruta, m.pool)
    }
  }

  return p
}
