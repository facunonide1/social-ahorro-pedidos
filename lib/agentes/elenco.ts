/**
 * EL ELENCO.
 *
 * ── QUÉ ES UN AGENTE, Y QUÉ NO ──────────────────────────────────────────────
 *
 * Un agente NO es un módulo nuevo. Es una LECTURA de lo que el sistema ya
 * calcula, con nombre y nivel encima. Abasto no tiene su propio motor de
 * compras: lee `reco_compras`, que existe desde la v0.94.
 *
 * Esto no es una restricción de diseño que nos pusimos: es la única forma de
 * que la capa de dirección no se desincronice del sistema. Si Abasto calculara
 * su propio faltante, en tres semanas Abasto y el plan de compra dirían cosas
 * distintas, y nadie sabría cuál creer.
 *
 * ── SI NO HAY DATO, EL AGENTE SE APAGA ──────────────────────────────────────
 *
 * No inventa y no se esconde. Vigía aparece en el equipo, gris, diciendo que
 * no hay ni una fecha de vencimiento cargada y qué lo encendería. Un agente
 * que desaparece cuando no tiene datos hace creer que el sector está cubierto.
 *
 * ── EL ALCANCE CAMBIA EL ELENCO ─────────────────────────────────────────────
 *
 * Elegir Arabia no es filtrar: es ver OTRO equipo. Abasto es de cadena —Facundo
 * compra para las cuatro— así que no aparece cuando mirás una sucursal sola.
 * Despacho es por sucursal, porque el pedido se arma donde está el stock.
 */

export type Alcance = 'cadena' | 'sucursal'
export type Nivel = 'sugiere' | 'prepara' | 'hace_y_avisa' | 'nunca'

export const NIVEL_TEXTO: Record<Nivel, { t: string; d: string }> = {
  sugiere: { t: 'Sugiere', d: 'Propone y la persona decide' },
  prepara: { t: 'Prepara', d: 'Deja todo hecho, falta confirmar' },
  hace_y_avisa: { t: 'Hace y avisa', d: 'Solo lo reversible y sin efecto sobre plata' },
  nunca: { t: 'Nunca', d: 'Apagado a propósito' },
}

/** Una acción concreta de un agente. El desglose es lo que hace útil el panel. */
export interface AccionDeAgente {
  clave: string
  nombre: string
  /**
   * v1.4 · F.2 · El alcance de ESTA acción, cuando no es el del agente.
   *
   * Canal es el primero que lo necesita y el motivo es real: el catálogo y
   * los precios son de la cadena —el recargo de PedidosYa es uno solo— y el
   * tiempo de preparación y las cancelaciones son del local que despacha.
   *
   * Un agente con dos alcances no es un agente mal diseñado: es que el
   * sector tiene dos. Partirlo en dos agentes haría que «el canal pierde
   * plata» y «el canal tarda» los mirara gente distinta, y son el mismo
   * canal.
   */
  alcance?: Alcance
  /** Los niveles que esta acción puede tomar. Si `hace_y_avisa` no está, no se ofrece. */
  niveles: Nivel[]
  /** Por qué no puede llegar más alto. Null cuando llega a todos. */
  techo?: string
  /** Pide un tope de monto para poder actuar sola. */
  pideLimite?: boolean
}

export interface Agente {
  id: string
  nombre: string
  queHace: string
  alcance: Alcance
  /** De dónde lee. Se muestra: un agente que no dice de dónde saca el número es un oráculo. */
  deDondeLee: string
  icono: string
  acciones: AccionDeAgente[]
}

const SUGIERE_O_PREPARA: Nivel[] = ['nunca', 'sugiere', 'prepara']
const TODOS: Nivel[] = ['nunca', 'sugiere', 'prepara', 'hace_y_avisa']

export const ELENCO: Agente[] = [
  {
    id: 'abasto',
    nombre: 'Abasto',
    queHace: 'Compras y reposición',
    alcance: 'cadena',
    deDondeLee: 'el plan de compra (v0.94) y la apertura por sucursal (v0.96)',
    icono: 'ShoppingCart',
    acciones: [
      { clave: 'armar_pedido', nombre: 'Armar el pedido de lo que falta', niveles: SUGIERE_O_PREPARA,
        techo: 'Emitir una orden compromete plata con un proveedor. La firma una persona.' },
      { clave: 'sacar_de_otra_sucursal', nombre: 'Sacar del pedido lo que hay en otra sucursal', niveles: TODOS,
        pideLimite: true },
      { clave: 'proponer_transferencia', nombre: 'Proponer una transferencia en vez de comprar', niveles: TODOS },
      { clave: 'emitir_orden', nombre: 'Emitir la orden de compra', niveles: ['nunca', 'sugiere', 'prepara'],
        techo: 'Emitir es comprometer plata. Nunca pasa de «prepara».' },
    ],
  },
  {
    id: 'tesoro',
    nombre: 'Tesoro',
    queHace: 'Caja y pagos',
    alcance: 'cadena',
    deDondeLee: 'la deuda (v0.93) y el control de caja (v0.97)',
    icono: 'Wallet',
    acciones: [
      { clave: 'armar_tanda_pagos', nombre: 'Armar la tanda de pagos de la semana', niveles: SUGIERE_O_PREPARA,
        techo: 'Regla de oro 7: pagar se aprueba.' },
      { clave: 'avisar_vencimiento', nombre: 'Avisar lo que vence', niveles: TODOS },
      { clave: 'cruzar_caja', nombre: 'Cruzar los cierres contra los tickets', niveles: TODOS,
        // Correr el cruce no mueve plata: escribe diferencias que mira una
        // persona. Por eso puede «hacer y avisar».
      },
      { clave: 'marcar_diferencia', nombre: 'Marcar una diferencia de caja', niveles: TODOS },
    ],
  },
  {
    id: 'reparto',
    nombre: 'Reparto',
    queHace: 'Stock entre sucursales',
    alcance: 'sucursal',
    deDondeLee: 'las transferencias y lo mal repartido (v0.96 y v0.97)',
    icono: 'ArrowLeftRight',
    acciones: [
      { clave: 'proponer_movimiento', nombre: 'Proponer qué mover y a dónde', niveles: TODOS },
      { clave: 'armar_pedido_entre_sucursales', nombre: 'Armar el pedido a otra sucursal', niveles: SUGIERE_O_PREPARA,
        techo: 'El stock se mueve en SIFACO. NORA acompaña; el movimiento lo hace una persona.' },
      { clave: 'avisar_diferencia', nombre: 'Avisar lo que salió y no llegó', niveles: TODOS },
    ],
  },
  {
    id: 'margen',
    nombre: 'Margen',
    queHace: 'Precios y promociones',
    alcance: 'cadena',
    deDondeLee: 'las ofertas de SIFACO (v0.88) y la medición de resultado',
    icono: 'Tag',
    acciones: [
      { clave: 'proponer_oferta', nombre: 'Proponer una oferta', niveles: SUGIERE_O_PREPARA,
        techo: 'Una oferta es un precio. SIFACO es la autoridad del precio (regla de oro 1).' },
      { clave: 'medir_oferta', nombre: 'Medir cómo salió una oferta', niveles: TODOS },
      { clave: 'avisar_sin_margen', nombre: 'Avisar lo que se vende por debajo del costo', niveles: TODOS },
    ],
  },
  {
    id: 'despacho',
    nombre: 'Despacho',
    queHace: 'Pedidos y entregas',
    alcance: 'sucursal',
    deDondeLee: 'los pedidos y los envíos (v0.91)',
    icono: 'Truck',
    acciones: [
      { clave: 'sugerir_sucursal', nombre: 'Sugerir de qué sucursal despachar', niveles: TODOS },
      { clave: 'avisar_demorado', nombre: 'Avisar un pedido demorado', niveles: TODOS },
      { clave: 'armar_viaje', nombre: 'Armar el viaje de reparto', niveles: SUGIERE_O_PREPARA,
        techo: 'Mandar a alguien a la calle lo decide quien conoce el día.' },
    ],
  },
  {
    id: 'vigia',
    nombre: 'Vigía',
    queHace: 'Vencimientos y mermas',
    alcance: 'sucursal',
    deDondeLee: 'los lotes con fecha de vencimiento',
    icono: 'CalendarClock',
    acciones: [
      { clave: 'avisar_por_vencer', nombre: 'Avisar lo que está por vencer', niveles: TODOS },
      { clave: 'proponer_liquidacion', nombre: 'Proponer liquidar antes de que venza', niveles: SUGIERE_O_PREPARA,
        techo: 'Liquidar es cambiar un precio.' },
    ],
  },
  // ── v1.1 · EL AGENTE CONVENIO ─────────────────────────────────────────────
  //
  // D.2 · Alcance de CADENA. Las obras sociales son de la empresa: el convenio
  // con OSDE es uno, aunque la presentación se arme por sucursal. Mirando una
  // sucursal no aparece, igual que Abasto.
  //
  // D.4 · **El techo de este agente es «prepara», en todas sus acciones.**
  //
  // No es prudencia genérica. Una presentación mal armada se manda y no se
  // vuelve: la obra social la debita entera y el período se pierde. Y una
  // reclamación mandada fuera de tiempo o sin respaldo quema el reclamo — no
  // se puede reclamar dos veces lo mismo.
  //
  // Las dos cosas son irreversibles hacia afuera, y «hace y avisa» es sólo
  // para lo reversible y sin efecto sobre plata.
  {
    id: 'convenio',
    nombre: 'Convenio',
    queHace: 'Obras sociales: presentación y débitos',
    alcance: 'cadena',
    deDondeLee: 'el padrón de convenios, las presentaciones y los débitos (v1.1)',
    icono: 'FileSignature',
    acciones: [
      { clave: 'avisar_cierre', nombre: 'Avisar qué presentación vence esta semana',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Avisar un cierre es gratis, pero el aviso que importa es la tarea al responsable, y esa la crea el que decide armar la presentación.' },

      { clave: 'armar_presentacion', nombre: 'Armar la presentación del período',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Una presentación mal armada se manda y no se vuelve: la obra social la debita entera y el período se pierde. La confirma una persona.' },

      { clave: 'avisar_debito_por_vencer', nombre: 'Avisar qué débito reclamable vence pronto',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Lo que sigue al aviso es reclamar, y un reclamo mandado sin respaldo quema el reclamo: no se puede reclamar dos veces lo mismo.' },

      { clave: 'avisar_motivo_que_crecio', nombre: 'Avisar qué motivo de débito creció',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Es una lectura para que alguien decida. El agente no cambia un proceso de mostrador.' },

      { clave: 'avisar_sucursal_que_debita_mas', nombre: 'Avisar qué sucursal debita más en el mismo motivo',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Muestra el número. Quién tiene que hacer qué con eso lo decide una persona: el número no distingue un problema de proceso de una sucursal que despacha más obra social.' },

      { clave: 'avisar_obra_social_que_cambio', nombre: 'Avisar qué obra social empezó a debitar más',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Decidir qué se hace con un convenio que empeoró es la decisión más grande del sector y no es de un agente.' },
    ],
  },
  {
    id: 'documentos',
    nombre: 'Documentos',
    queHace: 'Facturas y costos',
    alcance: 'cadena',
    deDondeLee: 'la recepción y el motor de documentos (v0.93)',
    icono: 'FileText',
    acciones: [
      { clave: 'leer_factura', nombre: 'Leer una factura fotografiada', niveles: TODOS },
      { clave: 'matchear_productos', nombre: 'Matchear los renglones con el catálogo', niveles: SUGIERE_O_PREPARA,
        techo: 'La primera vez que se matchea un producto lo confirma una persona (v0.93).' },
      { clave: 'avisar_costo_distinto', nombre: 'Avisar cuando el costo no coincide', niveles: TODOS },
    ],
  },
  // ── v1.4 · EL AGENTE CANAL ───────────────────────────────────────────────
  //
  // F.4 · **El techo es «prepara», en todas sus acciones.**
  //
  // No es prudencia genérica. Publicar algo mal en un canal abierto es un
  // problema con un cliente afuera: el que ve el precio equivocado, el que
  // compra lo que no hay, el que encuentra un producto con receta en una
  // tienda. Eso no se corrige con un undo.
  //
  // Y hay un motivo más simple que lo hace definitivo: **NORA no tiene
  // credenciales de ningún canal.** Aunque el techo fuera «hace y avisa», no
  // habría con qué hacerlo. El techo declara lo que ya es cierto.
  {
    id: 'canal',
    nombre: 'Canal',
    queHace: 'Catálogo, precios y salud de los canales',
    // El alcance del agente es el de la mayoría de sus acciones; las de
    // operación lo sobrescriben.
    alcance: 'cadena',
    deDondeLee: 'las publicaciones de cada canal, los detectores de canal y los pedidos (v1.4)',
    icono: 'Radio',
    acciones: [
      { clave: 'que_publicar', nombre: 'Proponer qué publicar en cada canal',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Publicar es visible para un cliente y NORA no tiene credenciales de ningún canal. Arma el lote; lo firma una persona y lo carga alguien.' },
      { clave: 'que_despublicar', nombre: 'Proponer qué despublicar',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Lo mismo al revés: sacar algo de un canal también se ve desde afuera.' },
      { clave: 'avisar_recargo_corto', nombre: 'Avisar si el recargo no cubre la comisión',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Cambiar un recargo cambia todos los precios de un canal. Y SIFACO es la autoridad de precio: NORA calcula y exporta, nunca escribe.' },
      { clave: 'avisar_canal_pierde', nombre: 'Avisar qué canal está dejando menos que el mostrador',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Cerrar o abrir un canal es una decisión del negocio, no de un agente.' },
      { clave: 'avisar_error_urgente', nombre: 'Avisar qué error del catálogo urge',
        niveles: SUGIERE_O_PREPARA,
        techo: 'Lo urgente del catálogo es casi siempre terreno legal, y eso lo resuelve una persona en el canal.' },
      // Las dos de operación son por sucursal: el pedido se prepara donde
      // está el stock, y el que tarda es el local.
      { clave: 'avisar_demora_preparacion', nombre: 'Avisar si la preparación tarda más de lo prometido',
        alcance: 'sucursal', niveles: SUGIERE_O_PREPARA,
        techo: 'Hoy ni siquiera puede: ningún pedido tiene marcados los dos momentos.' },
      { clave: 'proponer_cerrar_canal', nombre: 'Proponer cerrar un canal cuando no se da abasto',
        alcance: 'sucursal', niveles: SUGIERE_O_PREPARA,
        techo: 'Dejar de recibir pedidos lo decide quien está en el local y sabe si se da abasto.' },
    ],
  },
]

export function agentePorId(id: string): Agente | undefined {
  return ELENCO.find((a) => a.id === id)
}

/**
 * El elenco que corresponde al alcance elegido.
 *
 * Mirando la cadena se ven los de cadena; mirando una sucursal, los que
 * trabajan ahí. NO es el mismo equipo con menos datos.
 */
export function elencoDe(alcance: Alcance): Agente[] {
  return ELENCO
    .map((a) => {
      // v1.4 · un agente aparece en un alcance si ÉL es de ese alcance o si
      // tiene acciones de ese alcance — y cuando aparece, trae sólo las
      // acciones que corresponden.
      //
      // Canal es el primero así: el catálogo es de la cadena y el tiempo de
      // preparación es del local. Mostrarle a un encargado de sucursal la
      // acción de cambiar el recargo sería ofrecerle algo que no decide.
      const acciones = a.acciones.filter((ac) => (ac.alcance ?? a.alcance) === alcance)
      return acciones.length ? { ...a, acciones } : null
    })
    .filter((a): a is Agente => a !== null)
}
