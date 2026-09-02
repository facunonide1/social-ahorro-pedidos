/**
 * QUÉ SABE EL SISTEMA Y QUÉ NO PUEDE AFIRMAR.
 *
 * ── LA PARTE QUE NO SUELE ESTAR ─────────────────────────────────────────────
 *
 * La lista de lo que NO se puede afirmar es tan importante como la de lo que
 * sí. Un sistema que sólo muestra lo que sabe deja que el que mira complete el
 * resto con una suposición, y esa suposición no queda escrita en ningún lado.
 *
 * Todo lo de acá se CUENTA en la base cada vez. Ninguna cifra está escrita a
 * mano: una lista de limitaciones que envejece es peor que no tenerla, porque
 * se sigue leyendo como verdadera.
 */

type Sb = { from: (t: string) => any; rpc?: (n: string, a?: any) => any }

export interface DatoDelSistema {
  que: string
  cuantos: number | null
  /** Si `cuantos` es null, por qué no se puede contar. */
  nota?: string
}

export interface LimitacionDeclarada {
  titulo: string
  /** El hecho, medido. No la sospecha. */
  porque: string
  queDestraba: string
}

export interface EstadoDelSistema {
  datos: DatoDelSistema[]
  limitaciones: LimitacionDeclarada[]
}

async function contar(sb: Sb, tabla: string, filtros: (q: any) => any = (q) => q): Promise<number | null> {
  try {
    const { count, error } = await filtros(sb.from(tabla).select('id', { count: 'exact', head: true }))
    return error ? null : (count ?? 0)
  } catch { return null }
}

export async function estadoDelSistema(sb: Sb): Promise<EstadoDelSistema> {
  const [
    productos, conStock, controlados, sinCondicion, sinPrecio, sinUltVenta,
    ofertas, clientes, pedidosAbiertos, pedidosSinSucursal, zonas, canalesSinSucursal,
    sucursalesSinCodigo, proveedores, tareas, reservas, noPublicables,
  ] = await Promise.all([
    contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).eq('activo', true)),
    contar(sb, 'producto_stock_sifaco', (q) => q.gt('stock', 0)),
    contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).eq('es_controlado', true)),
    contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).is('condicion_venta', null)),
    contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).is('precio_sugerido', null)),
    contar(sb, 'productos_catalogo', (q) => q.eq('es_demo', false).is('ult_venta', null)),
    contar(sb, 'ofertas_sifaco'),
    contar(sb, 'clientes', (q) => q.eq('activo', true)),
    contar(sb, 'orders', (q) => q.in('status', ['nuevo', 'confirmado', 'en_preparacion', 'listo', 'en_camino'])),
    contar(sb, 'pedidos_sin_sucursal'),
    contar(sb, 'zonas_reparto', (q) => q.eq('activa', true)),
    contar(sb, 'canales_venta', (q) => q.is('sucursal_despacho_id', null)),
    contar(sb, 'sucursales', (q) => q.eq('activa', true).is('codigo_sifaco', null)),
    contar(sb, 'proveedores', (q) => q.eq('activo', true)),
    contar(sb, 'tareas', (q) => q.eq('es_demo', false)),
    contar(sb, 'reservas_stock', (q) => q.eq('estado', 'activa')),
    contar(sb, 'no_publicables_para_revisar'),
  ])

  const datos: DatoDelSistema[] = [
    { que: 'Productos en el catálogo', cuantos: productos },
    { que: 'Con stock declarado por SIFACO', cuantos: conStock },
    { que: 'Controlados o con receta', cuantos: controlados },
    { que: 'Ofertas leídas de SIFACO', cuantos: ofertas },
    { que: 'Clientes activos', cuantos: clientes },
    { que: 'Proveedores activos', cuantos: proveedores },
    { que: 'Tareas reales', cuantos: tareas },
    { que: 'Pedidos abiertos', cuantos: pedidosAbiertos },
    { que: 'Reservas de stock activas', cuantos: reservas },
    { que: 'Zonas de reparto', cuantos: zonas },
  ]

  const lim: LimitacionDeclarada[] = []

  if ((sucursalesSinCodigo ?? 0) > 0) {
    lim.push({
      titulo: 'No puede decir cuánto stock hay en cada sucursal',
      porque: `El stock que declara SIFACO es el total de las cuatro, sin apertura. Y ${sucursalesSinCodigo} sucursales no tienen declarado su código de SIFACO (GUZ, FIG, ARA, TES).`,
      queDestraba: 'El archivo tabla3e completo, más decir qué código de SIFACO es cada sucursal.',
    })
  }
  if ((sinPrecio ?? 0) > 0) {
    lim.push({
      titulo: `No puede poner precio a ${sinPrecio} productos`,
      porque: 'SIFACO no declara ni prec_vta ni publico para ellos. No es que valgan cero.',
      queDestraba: 'Cargarles precio en SIFACO, o confirmar que no se venden.',
    })
  }
  if ((sinCondicion ?? 0) > 0) {
    lim.push({
      titulo: `No puede aplicar la regla 9 a ${sinCondicion} productos`,
      porque: 'No tienen condición de venta declarada. Ante la duda no se ofrecen por canal abierto.',
      queDestraba: 'Que el archivo del maestro traiga la columna vl para esos códigos.',
    })
  }
  if ((sinUltVenta ?? 0) > 0) {
    lim.push({
      titulo: `No sabe si ${sinUltVenta} productos se vendieron alguna vez`,
      porque: 'SIFACO no declara última venta para ellos. Un producto sin última venta puede no haberse vendido nunca o no tener el dato cargado, y son cosas distintas.',
      queDestraba: 'Nada de este lado: es lo que el archivo trae.',
    })
  }
  if ((canalesSinSucursal ?? 0) > 0) {
    lim.push({
      titulo: 'No puede saber de qué sucursal sale un pedido que entra solo',
      porque: `${canalesSinSucursal} canales no tienen sucursal de despacho configurada, y el stock no está abierto por local: deducirla sería inventarla.`,
      queDestraba: 'Elegir la sucursal de despacho de cada canal en /admin/canales.',
    })
  }
  if ((zonas ?? 0) === 0) {
    lim.push({
      titulo: 'No puede decir si un envío pierde plata',
      porque: 'No hay ninguna zona de reparto cargada, y sin zonas no hay tarifa ni costo contra qué compararla.',
      queDestraba: 'Cargar las zonas con su sucursal, tarifa, km y minutos, y el costo de la moto.',
    })
  }
  if ((noPublicables ?? 0) > 0) {
    lim.push({
      titulo: 'No puede verificar los archivos que se subieron a mano a un canal',
      porque: `NORA no los generó, así que no tiene registro de qué se subió. Lo que sí tiene es la lista de los ${noPublicables} productos que no se pueden ofrecer por canal abierto.`,
      queDestraba: 'Cruzar esa lista contra lo que se subió. Está en /admin/canales/regla-9.',
    })
  }
  if ((pedidosSinSucursal ?? 0) > 0) {
    lim.push({
      titulo: `${pedidosSinSucursal} pedidos abiertos no tienen sucursal asignada`,
      porque: 'Entraron por un canal sin regla de despacho. No es un error: es trabajo pendiente.',
      queDestraba: 'Asignarlos desde el tablero, o configurar el canal.',
    })
  }

  lim.push({
    titulo: 'El stock no es en tiempo real',
    porque: 'Es la foto del archivo diario de SIFACO. Entre archivo y archivo el mostrador vende y NORA no se entera.',
    queDestraba: 'Una conexión en vivo con SIFACO, que hoy no existe.',
  })

  return { datos, limitaciones: lim }
}
