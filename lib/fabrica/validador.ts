import { fueraDeContrato } from './tipos'
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

export const FORMATO_ACTUAL = '2.1.0'

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
const PARTICIPACIONES = new Set(['sugiere', 'prepara', 'informa', 'hace_y_avisa', 'nunca'])
const CAPACIDADES = new Set([
  'cargar', 'recomendar', 'detectar', 'ejecutar', 'responder', 'explicar', 'priorizar',
])
const LIMITES = new Set([
  'cumplimiento_regulado', 'autoridad_precio', 'umbrales_y_permisos',
  'control_de_caja', 'auditoria', 'confirmacion_humana',
])
const TIPOS_CONSTITUCIONALES = new Set([
  'entidad', 'campo', 'accion', 'automatizacion', 'parametro',
])

/**
 * Valida un manifiesto solo, sin mirar a los demás.
 *
 * NUNCA LANZA, y eso NO es defensa por las dudas: es la diferencia entre que un
 * manifiesto roto se reporte y que desaparezca.
 *
 * El lector llama a esto dentro de un try/catch. Si acá se lanzaba —y se
 * lanzaba, con un manifiesto sin `entidades`— el catch devolvía el objeto
 * "apagado", el pool se comportaba como si el flag estuviera bajo, y NO se
 * registraba fallback: un manifiesto corrupto en la base se veía exactamente
 * igual que un pool que nadie prendió. Lo encontró la prueba adversaria.
 */
export function validarManifiesto(m: Manifiesto): Problema[] {
  const p: Problema[] = []
  const err = (campo: string, mensaje: string) => p.push({ campo, mensaje, gravedad: 'error' })
  const avi = (campo: string, mensaje: string) => p.push({ campo, mensaje, gravedad: 'aviso' })

  // Las colecciones obligatorias, antes de tocarlas. Que falte una es un error
  // del manifiesto, no una excepción del validador.
  if (!m || typeof m !== 'object') {
    return [{ campo: 'manifiesto', mensaje: 'no es un objeto', gravedad: 'error' }]
  }
  for (const [campo, valor] of [
    ['entidades', m.entidades],
    ['pantallas', m.pantallas],
  ] as const) {
    if (!Array.isArray(valor)) {
      err(campo, `falta o no es una lista: el manifiesto está incompleto o corrupto`)
    }
  }
  if (p.some((x) => x.gravedad === 'error')) return p

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
    if (e.acceso !== 'propia' && e.escriben_otros) {
      err(`entidades.${e.tabla}`, 'escriben_otros sólo tiene sentido sobre una entidad propia')
    }
    if (e.acceso === 'propia' && e.dueno) {
      err(`entidades.${e.tabla}`, 'una entidad propia no declara dueño ajeno')
    }
    // Escribir en una tabla ajena sin decir de quién es deja la escritura sin
    // responsable: nadie sabe a quién avisarle si cambia la forma.
    if (e.acceso === 'escrita' && !e.dueno) {
      err(`entidades.${e.tabla}`, 'escribe en una tabla ajena y no declara de quién es')
    }
    if (e.acceso === 'leida' && !e.dueno) {
      avi(`entidades.${e.tabla}`, 'entidad leída sin dueño declarado: no se sabe a qué pool pedirle cambios')
    }
    if (e.referencia_abierta && !e.referencia_abierta.nota) {
      err(`entidades.${e.tabla}`, 'una referencia abierta sin nota no se entiende desde afuera')
    }
  }

  /* ── Hechos ────────────────────────────────────────────────────────── */
  const clavesConf = new Set((m.configurable ?? []).map((c) => c.clave))
  const vistosHechos = new Set<string>()
  for (const h of m.hechos ?? []) {
    if (vistosHechos.has(h.clave)) err(`hechos.${h.clave}`, 'declarado dos veces')
    vistosHechos.add(h.clave)
    if (!h.afirma) err(`hechos.${h.clave}`, 'no dice qué afirma')
    // Un hecho sin comprobación es una afirmación sin respaldo, y este proyecto
    // ya sabe lo que cuesta una de ésas.
    if (!h.comprobado_por) err(`hechos.${h.clave}`, 'no dice cómo se comprobó')
    if (h.tipo !== 'permanente' && h.tipo !== 'condicionado') {
      err(`hechos.${h.clave}`, `tipo desconocido: ${h.tipo}. Es permanente o condicionado`)
    }
    // Un condicionado sin decir de qué depende se lee igual que un permanente,
    // que es exactamente lo que la distinción vino a evitar.
    if (h.tipo === 'condicionado' && !h.depende_de) {
      err(`hechos.${h.clave}`, 'es condicionado y no dice de qué depende')
    }
    if (h.tipo === 'permanente' && h.depende_de) {
      avi(`hechos.${h.clave}`, 'dice de qué depende pero se declara permanente: si depende de algo, es condicionado')
    }
    if (clavesConf.has(h.clave)) {
      err(`hechos.${h.clave}`, 'está declarado como hecho Y como configurable: es una cosa o la otra')
    }
  }

  /* ── Pantallas ─────────────────────────────────────────────────────── */
  const rutas = new Set<string>()
  for (const s of m.pantallas) {
    if (rutas.has(s.ruta)) err(`pantallas.${s.ruta}`, 'declarada dos veces')
    rutas.add(s.ruta)
    if (!MOLDES_VALIDOS.has(s.molde)) err(`pantallas.${s.ruta}`, `molde desconocido: ${s.molde}`)
    if (!s.titulo) err(`pantallas.${s.ruta}`, 'falta el título')
    // `titulo_de_oficio` y `nombre_en_el_negocio` sólo existen en el manifiesto
    // EFECTIVO, que `resolver()` arma en memoria. Declararlos en la pieza sería
    // meterle a la pieza el vocabulario de un negocio, que es exactamente lo que
    // 1.5.0 vino a evitar.
    if (s.titulo_de_oficio !== undefined)
      err(`pantallas.${s.ruta}`, 'titulo_de_oficio no se declara: el `titulo` de la pieza YA es el término del oficio')
    if (s.nombre_en_el_negocio !== undefined)
      err(
        `pantallas.${s.ruta}`,
        'nombre_en_el_negocio es de la instalación, no de la pieza: va como override `vocabulario`',
      )
    // Una prestada con permiso propio es una contradicción: si el permiso lo
    // pone este pool, la pantalla no es de otro.
    if (s.pertenencia === 'prestada' && s.permiso) {
      err(`pantallas.${s.ruta}`, 'una pantalla prestada no declara permiso propio')
    }
    // Una ruta con parámetro casi siempre se titula con los datos de la fila.
    // No es un error, pero declararla gobernable sin pensarlo sí lo sería.
    //
    // `titulo_dinamico: false` explícito significa "lo miré y es fijo": el
    // aviso deja de aparecer. Un aviso que sigue apareciendo después de que
    // alguien lo revisó no es un aviso, es ruido.
    if (s.ruta.includes('[') && s.molde === 'ficha' && s.titulo_dinamico === undefined) {
      avi(
        `pantallas.${s.ruta}`,
        'es una ficha con parámetro y no dice si su título sale de los datos: declarar titulo_dinamico',
      )
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

  /* ── Peso de los configurables ─────────────────────────────────────── */
  // Sin peso no se puede decidir el carril, y un carril mal decidido es peor
  // que no tener carriles: da la sensación de control sin el control.
  const PESOS = new Set(['inocuo', 'operativo', 'sensible'])
  for (const c of m.configurable ?? []) {
    if (!c.peso) {
      err(`configurable.${c.clave}`, 'sin peso declarado: no se puede derivar su carril')
    } else if (!PESOS.has(c.peso)) {
      err(`configurable.${c.clave}`, `peso desconocido: ${c.peso}`)
    }
    if (c.peso === 'sensible' && !c.peso_motivo) {
      avi(`configurable.${c.clave}`, 'marcado sensible sin decir por qué')
    }
  }

  /* ── Constitución ──────────────────────────────────────────────────── */
  // Lo que no se toca. El campo `modificable` existe SÓLO para poder
  // rechazarlo: sin él, marcar algo como modificable sería simplemente no
  // declararlo, y no habría nada contra qué fallar.
  const clavesConfigurables = new Set((m.configurable ?? []).map((c) => c.clave))
  for (const c of m.constitucional ?? []) {
    if (!LIMITES.has(c.limite)) err(`constitucional.${c.elemento}`, `límite desconocido: ${c.limite}`)
    if (!TIPOS_CONSTITUCIONALES.has(c.tipo)) {
      err(`constitucional.${c.elemento}`, `tipo desconocido: ${c.tipo}`)
    }
    if (!c.motivo) {
      err(
        `constitucional.${c.elemento}`,
        'sin motivo: es lo que se lee cuando alguien pide tocarlo, y sin eso el límite parece un capricho',
      )
    }
    // EL RECHAZO QUE JUSTIFICA EL CAMPO.
    if ((c as { modificable?: unknown }).modificable === true) {
      err(
        `constitucional.${c.elemento}`,
        `declarado modificable bajo el límite "${c.limite}". Un elemento constitucional no se modifica por configuración`,
      )
    }
    // Y la contradicción más silenciosa: declararlo intocable arriba y ofrecerlo
    // como parámetro abajo.
    if (clavesConfigurables.has(c.elemento)) {
      err(
        `constitucional.${c.elemento}`,
        'está declarado constitucional y a la vez ofrecido como parámetro configurable',
      )
    }
  }

  /* ── Deprecadas ────────────────────────────────────────────────────── */
  const propiasTablas = new Set(m.entidades.map((e) => e.tabla))
  for (const d of m.deprecadas ?? []) {
    if (!d.motivo) err(`deprecadas.${d.tabla}`, 'sin motivo')
    if (!d.desde) err(`deprecadas.${d.tabla}`, 'sin fecha de baja')
    // Una tabla deprecada declarada también como propia viaja a cada proyecto
    // nuevo: es exactamente lo que el campo existe para evitar.
    if (propiasTablas.has(d.tabla)) {
      err(`deprecadas.${d.tabla}`, 'declarada deprecada y a la vez como entidad del pool')
    }
  }

  /* ── Dimensiones ───────────────────────────────────────────────────── */
  for (const d of m.dimensiones ?? []) {
    if (d.columnas.length === 0) err(`dimensiones.${d.clave}`, 'sin columnas: no se puede verificar')
    for (const col of d.columnas) {
      if (!col.includes('.')) {
        err(`dimensiones.${d.clave}`, `"${col}" tiene que ser tabla.columna para poder verificarse`)
      }
    }
    if (d.valores.length < 2) {
      avi(`dimensiones.${d.clave}`, 'con menos de dos valores no parte nada')
    }
  }

  /* ── Agentes ───────────────────────────────────────────────────────── */
  for (const ag of m.agentes ?? []) {
    if (!ag.trabajo) err(`agentes.${ag.clave}`, 'sin trabajo declarado en lenguaje de negocio')
    if (ag.acciones.length === 0) err(`agentes.${ag.clave}`, 'un agente sin acciones no hace nada')
    for (const acc of ag.acciones) {
      // ── El contrato de automatización, desde 2.1.0 ─────────────────
      const auto = acc.automatizacion
      if (auto) {
        if (auto.corre_sola !== true) {
          err(`agentes.${ag.clave}.${acc.clave}`, 'declara contrato de automatización sin corre_sola: si alguien la dispara, es una acción')
        }
        if (!['cron', 'trigger', 'evento'].includes(auto.disparo)) {
          err(`agentes.${ag.clave}.${acc.clave}`, `disparo desconocido: ${auto.disparo}`)
        }
        if (!auto.donde_corre) {
          err(`agentes.${ag.clave}.${acc.clave}`, 'no dice dónde corre: sin eso no se puede verificar nada')
        }
        // Sin esto, "apagala" se lee como "que no haya pasado", y eso es falso
        // para toda automatización que ya corrió una vez.
        if (!auto.al_apagar) {
          err(`agentes.${ag.clave}.${acc.clave}`, 'no dice qué queda hecho si se apaga: apagar no es deshacer')
        }
        // Una que corre sola y le llega a alguien de afuera no es lo mismo que
        // una que crea una tarea interna. El corte es de v0.60 y se aplica acá.
        if (auto.corre_sola && acc.compromete_tercero && acc.participacion === 'hace_y_avisa') {
          err(
            `agentes.${ag.clave}.${acc.clave}`,
            'corre sola, compromete a un tercero y está en hace_y_avisa: ese nivel exige reversibilidad y no comprometer a nadie de afuera',
          )
        }
        if (auto.agendada === false && acc.participacion === 'hace_y_avisa') {
          avi(
            `agentes.${ag.clave}.${acc.clave}`,
            'declarada hace_y_avisa y NO está agendada: no corre sola, así que el nivel declarado no describe lo que pasa',
          )
        }
      }

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
      // `hace_y_avisa` exige reversibilidad y no tocar plata. `informa` no
      // exige reversibilidad —un aviso leído no se des-lee— pero sí exige no
      // comprometer a nadie de afuera: ahí está toda la diferencia entre los
      // dos niveles.
      if (acc.participacion === 'hace_y_avisa' && acc.reversible === false) {
        avi(
          `agentes.${ag.clave}.${acc.clave}`,
          'actúa solo y NO es reversible. O es un aviso interno (informa) o baja a prepara',
        )
      }
      if (acc.participacion === 'hace_y_avisa' && acc.toca_dinero) {
        avi(`agentes.${ag.clave}.${acc.clave}`, 'actúa solo y toca dinero. Debería bajar a prepara')
      }
      if (acc.participacion === 'informa' && acc.compromete_tercero) {
        err(
          `agentes.${ag.clave}.${acc.clave}`,
          'informa es sólo hacia adentro del equipo. Si le llega a un tercero, es prepara',
        )
      }
      if (acc.participacion === 'informa' && acc.toca_dinero) {
        err(`agentes.${ag.clave}.${acc.clave}`, 'un aviso no mueve plata')
      }
      // La brecha es un hallazgo sobre el sistema, no un defecto de la
      // declaración: por eso avisa y no falla.
      if (acc.brecha) {
        avi(
          `agentes.${ag.clave}.${acc.clave}`,
          `declarada ${acc.participacion} y el código todavía no lo cumple: ${acc.brecha}`,
        )
      }
    }
    for (const c of ag.capacidades) {
      if (!CAPACIDADES.has(c)) err(`agentes.${ag.clave}`, `capacidad desconocida: ${c}`)
    }
    // La constitución manda sobre los agentes, no sólo sobre la configuración.
    // Si el pool declaró que algo necesita confirmación humana, ningún agente
    // suyo puede tener el permiso de aprobar: sería el mismo control firmado
    // por el sistema que lo tenía que pedir.
    const exigenConfirmacion = (m.constitucional ?? []).some(
      (c) => c.limite === 'confirmacion_humana',
    )
    if (exigenConfirmacion) {
      for (const perm of ag.permisos) {
        if (perm.acciones.includes('aprobar')) {
          err(
            `agentes.${ag.clave}`,
            `pide "${perm.modulo}.aprobar" y el pool declara elementos bajo confirmación humana: un agente no aprueba lo que él mismo tiene que pedir`,
          )
        }
      }
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

    // Un pool base no necesita que nadie lo liste: la dependencia es de todos.
    if (m.usado_por_todos) continue

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

  // Escritura cruzada: si un pool declara `escrita`, el dueño tiene que
  // reconocerlo con `escriben_otros`. Si no, el dueño cree que la tabla es
  // suya y de nadie más, y va a cambiarle la forma sin avisar.
  for (const m of manifiestos) {
    for (const e of m.entidades.filter((x) => x.acceso === 'escrita')) {
      const otro = manifiestos.find((x) => x.pool === e.dueno)
      if (!otro) {
        p.push({
          campo: `${m.pool}.entidades.${e.tabla}`,
          mensaje: `escribe en tabla de "${e.dueno}", que todavía no está declarado`,
          gravedad: 'aviso',
        })
        continue
      }
      const suya = otro.entidades.find((x) => x.tabla === e.tabla && x.acceso === 'propia')
      if (!suya) {
        p.push({
          campo: `${m.pool}.entidades.${e.tabla}`,
          mensaje: `dice que es de "${e.dueno}" y "${e.dueno}" no la declara propia`,
          gravedad: 'error',
        })
      } else if (!suya.escriben_otros) {
        p.push({
          campo: `${e.dueno}.entidades.${e.tabla}`,
          mensaje: `"${m.pool}" escribe acá y el dueño no lo declara con escriben_otros`,
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
