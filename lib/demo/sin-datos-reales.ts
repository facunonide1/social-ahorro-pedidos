/**
 * QUÉ LE FALTA A UN SECTOR QUE ESTÁ VACÍO.
 *
 * ── POR QUÉ UNA TABLA VACÍA NO ALCANZA ──────────────────────────────────────
 *
 * Con el lente prendido por defecto (v0.95), los sectores que sólo tienen datos
 * de demostración muestran cero. Un cero sin explicación se lee como «mirá, no
 * hay nada que hacer» — y lo que pasa es otra cosa: que el dato no entró nunca.
 *
 * La auditoría del 14 de octubre contó ocho tablas con 8.880 filas y CERO
 * reales. Esta es la frase que va en cada una de esas pantallas, con el dato que
 * la destraba.
 */

export interface SectorVacio {
  /** Qué no se puede hacer, en una frase. */
  que: string
  /** Por qué, medido. */
  porque: string
  /** El dato concreto que lo destraba, y de dónde sale. */
  destraba: string
}

export const SECTORES_VACIOS: Record<string, SectorVacio> = {
  ventas: {
    que: 'No se puede decir cuánto se vendió ni con qué margen',
    porque: 'Las 7.620 filas de ventas cargadas son de demostración: ni una pasó por el negocio.',
    destraba: 'El archivo de ventas por sucursal de SIFACO, que se carga en Centro de Datos → Ventas diarias.',
  },
  stock_sucursal: {
    que: 'No se puede decir cuánto stock hay en cada sucursal',
    porque: 'SIFACO exporta el maestro con el total de las cuatro, sin apertura. Las 480 filas por sucursal que hay son de demostración.',
    destraba: 'El archivo `tabla3e` completo. El que se cargó tiene 296 filas y vino filtrado por laboratorio.',
  },
  clientes: {
    que: 'No se puede hablar de los clientes de la cadena',
    porque: 'Los 150 clientes cargados son de demostración.',
    destraba: 'Importar los clientes reales, o que se vayan creando solos al cargar pedidos.',
  },
  caja: {
    que: 'No se puede arquear ninguna caja',
    porque: 'Los 48 arqueos son de demostración y no hay ninguna caja general cargada.',
    destraba: 'Crear las cajas de cada sucursal y empezar a cargar los arqueos del día.',
  },
  vencimientos: {
    que: 'No se puede decir qué se vence',
    porque: 'Los 26 vencimientos cargados son de demostración y no hay ningún lote real.',
    destraba: 'Cargar los lotes con su vencimiento, o que entren con la recepción de mercadería.',
  },
  irregularidades: {
    que: 'No se puede hablar de irregularidades de stock',
    porque: 'Las 108 cargadas son de demostración, y se calculan sobre el stock por sucursal, que tampoco está.',
    destraba: 'El archivo `tabla3e` completo, igual que el stock por sucursal.',
  },
  zonas: {
    que: 'No se puede cobrar un envío ni armar un viaje',
    porque: 'No hay ninguna zona de reparto cargada.',
    destraba: 'Cargarlas en Pedidos → Envíos, con su sucursal, tarifa, km y minutos.',
  },
  recepcion: {
    que: 'No hay ninguna recepción de mercadería registrada',
    porque: 'La pantalla está lista y nadie la usó todavía.',
    destraba: 'Sacarle la foto a la primera factura cuando llegue el próximo pedido.',
  },
  costos: {
    que: 'No se puede comparar a qué precio vende cada droguería',
    porque: 'El histórico de costos tiene 0 líneas: se llena al confirmar una factura fotografiada, y no entró ninguna.',
    destraba: 'Dos o tres meses de facturas fotografiadas en la recepción.',
  },
  pagos: {
    que: 'No hay ningún pago registrado',
    porque: 'La deuda está cargada —412 comprobantes— pero todavía no se registró un pago contra ella.',
    destraba: 'Registrar el primer pago desde la pantalla de deuda.',
  },
  compliance: {
    que: 'No se puede decir si el compliance está en orden',
    porque: 'No hay ningún papel de habilitación, recall ni despacho de controlados cargado. No es que esté todo bien: es que no hay nada contra qué mirarlo.',
    destraba: 'Cargar los papeles de habilitación. El libro recetario sigue siendo el registro legal.',
  },
  comunicacion: {
    que: 'No hay ningún canal ni mensaje',
    porque: 'El chat interno está construido y no se usó.',
    destraba: 'Que haya más de un usuario con quien hablar.',
  },
}
