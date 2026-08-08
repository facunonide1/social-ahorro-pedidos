# La constitución

Hay cosas que la fábrica **no puede modificar**: ni por configuración de
proyecto, ni por chat, ni a pedido del dueño.

Hasta v0.60 esto era doctrina — estaba en los comentarios y en la cabeza de
quien escribía. Desde el formato **1.2.0** está en el manifiesto, y el validador
lo hace cumplir.

**Por qué ahora y no después:** la próxima pieza es el lector, que hace que la
declaración *mande* sobre el código. Un lector que gobierne sin conocer los
límites puede aplicar una declaración que apague un control, y el control
apagado se ve recién cuando hace falta. Los límites tienen que estar en el
formato **antes** de que la declaración mande.

---

## Cómo se declara

```ts
constitucional: [
  {
    limite: 'control_de_caja',
    tipo: 'entidad',
    elemento: 'arqueos_caja',
    motivo: 'El arqueo es ciego: el cajero cuenta sin ver lo que el sistema espera…',
  },
]
```

`modificable` existe **sólo para poder rechazarlo**. Sin ese campo, marcar algo
como modificable sería simplemente no declararlo, y no habría nada contra qué
fallar.

### Qué rechaza el validador

Probado con casos a propósito en `scripts/fabrica-probar-constitucion.ts`:

| Se intenta | Resultado |
| --- | --- |
| `modificable: true` sobre un elemento constitucional | **error** |
| Declararlo constitucional *y* ofrecerlo como parámetro configurable | **error** |
| Inventar un límite fuera de los seis | **error** |
| Declararlo sin motivo | **error** |
| Un agente con `aprobar` en un pool con `confirmacion_humana` | **error** |
| Un agente pidiendo más permisos que su pool | **error** |

> La regla del agente salió de una prueba que falló. El caso original estaba mal
> escrito, y al arreglarlo quedó a la vista que faltaba la regla de verdad: si
> el pool declaró que algo necesita confirmación humana, **ningún agente suyo
> puede aprobar** — sería el mismo control firmado por el sistema que lo tenía
> que pedir.

### Una contradicción que encontró apenas se encendió

`retencion_auditoria_dias` estaba declarado intocable arriba y ofrecido como
parámetro abajo. Las dos cosas eran ciertas a medias: **alargar** el plazo es
configuración legítima; **acortarlo** es borrar auditoría con otro nombre. Lo
constitucional no era el parámetro sino la acción de acortarlo.

---

## Los seis límites


## Cumplimiento regulado

1 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Clientes | `clientes` | entidad | Son datos de personas. Las columnas sensibles declaradas no se exportan sin permiso explícito, y el pool no se instala en un proyecto que no vaya a manejarlas. |

## La autoridad del precio de venta

4 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Motor de documentos | `doc_precios_historial` | entidad | Guarda lo que se PAGÓ, no lo que se cobra. Ningún proceso deriva de acá un precio de venta: esa autoridad es del sistema de facturación. |
| Compras | `doc_precios_historial` | entidad | Es lo que se pagó, no lo que se cobra. Ningún proceso de compras escribe un precio de venta a partir de un costo: la autoridad del precio de venta es del sistema de facturación. |
| Ofertas | `fijar_precio_venta` | accion | La autoridad sobre el precio de venta es del sistema de facturación. La fábrica propone; el precio lo escribe otro. No es configurable en ningún proyecto. |
| Ofertas | `ofertas_exports_sifaco` | entidad | Es el envío hacia el sistema que manda sobre el precio. La dirección es una sola: se exporta, no se importa un precio de vuelta. |

## Umbrales de aprobación y permisos

5 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Configuración | `users_admin.rol` | campo | Quién puede qué se cambia a mano, con nombre y apellido. Ninguna configuración de proyecto ni ningún chat reparte roles. |
| Configuración | `users_admin.permisos_custom` | campo | Los permisos finos son el último control que queda cuando el rol es amplio. Se editan a mano o no son un control. |
| Configuración | `users_admin.pin_hash` | campo | Es una credencial. No se lee, no se copia entre proyectos y no se muestra en ninguna pantalla ni exportación. |
| Finanzas | `umbral_aprobacion_pago` | parametro | A partir de qué monto un pago necesita una segunda firma se cambia a mano, con nombre y apellido. No por configuración de proyecto ni por chat. |
| Compras | `ordenes_compra.sucursal_compradora_id` | campo | Define qué punto emite el comprobante y por lo tanto quién declara la compra. No es lo mismo que el punto destino, y no se completa solo ni se infiere: tiene impacto fiscal. |

## Reglas de control de caja

3 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Finanzas | `arqueos_caja` | entidad | El arqueo es ciego: el cajero cuenta sin ver lo que el sistema espera. Si se pudiera configurar en visible, el control desaparece y la tabla queda igual de llena. |
| Finanzas | `arqueos_caja.secuencia_alterada` | campo | Marca que los montos sellados al abrir no son los que llegaron al cerrar. Es la única señal de que alguien reintentó el cierre con otros números. |
| Finanzas | `caja_turnos.arqueo_ciego` | campo | Se sella al abrir el turno y no se puede cambiar con el turno abierto. |

## Auditoría

9 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Centro de Datos | `snapshots_import` | entidad | Es cómo estaba todo antes de la carga. Si se pudiera borrar, una importación mal hecha sería irreversible. |
| Motor de documentos | `doc_extracciones` | entidad | Es lo que el modelo leyó y con cuánta confianza. Sin eso no se puede auditar por qué el sistema creyó lo que creyó. |
| Inteligencia | `auditoria_logs` | entidad | No se desactiva, no se borra y no se edita. Es la única tabla del sistema que sólo crece, y un registro que se puede editar no sirve para nada. |
| Inteligencia | `acortar_retencion_auditoria` | accion | El plazo de retención se puede alargar por configuración. Acortarlo, no: sería borrar registros de auditoría llamándolo de otra manera. |
| Tareas | `tareas_historial` | entidad | Quién cambió qué y cuándo. Es lo que permite reconstruir por qué una tarea terminó como terminó. |
| Stock | `movimientos_stock` | entidad | Cada entrada y salida con su motivo y su autor. No se edita: corregir un movimiento se hace con otro movimiento. |
| Stock | `irregularidades_stock` | entidad | Las diferencias sin explicación no se borran cuando incomodan. Se explican o siguen abiertas. |
| Finanzas | `registro_de_movimientos` | automatizacion | Todo movimiento de caja y de cuenta queda registrado con autor. No se desactiva ni se edita después. |
| Compras | `proveedor_score_eventos` | entidad | El puntaje de un tercero se construye con hechos registrados uno por uno. Si se pudieran editar, el puntaje deja de significar algo. |

## Confirmación humana antes de ejecutar

13 elemento(s).

| Pool | Qué | Tipo | Por qué no se toca |
| --- | --- | --- | --- |
| Centro de Datos | `crear_item_nuevo` | accion | El catálogo es la maestra de la que dependen todos los pools. Un alta automática desde un archivo mal formateado lo contamina y después nadie sabe de dónde salió esa fila. |
| Centro de Datos | `aplicar_perfil_conocido` | accion | Una carga masiva toca tablas de medio sistema. Se deja armada con el resumen de qué entra y qué queda afuera, y la suelta una persona. |
| Motor de documentos | `extraer_documento` | accion | Lo que el modelo leyó no entra a las cuentas sin que una persona lo mire. Un importe mal leído que se contabiliza solo no se descubre hasta el cierre. |
| Inteligencia | `aprobaciones` | entidad | La cola existe para que una persona decida. Un asistente que se auto-aprueba convierte el control en un trámite. |
| Inteligencia | `aprobar_en_nombre_de_alguien` | accion | Nadie aprueba en nombre de otro. La aprobación vale por quién la firma. |
| Tareas | `tareas.verificacion_humana` | campo | Marca que el trabajo lo dio por bueno una persona, no el sistema. Si se pudiera apagar por configuración, la verificación deja de existir y las tareas siguen cerrándose igual. |
| Tareas | `verificar_trabajo_propio` | accion | Nadie verifica lo que él mismo generó. Si el agente crea y aprueba, el circuito de control es decorativo. |
| Clientes | `eliminar_cliente` | accion | Borrar el dato de una persona no es editar un poco más, y no hay vuelta atrás. |
| Clientes | `proponer_fusion_duplicados` | accion | Fusionar dos clientes reescribe compras y puntos de los dos. Se propone y espera. |
| Stock | `ajustar_stock` | accion | Un ajuste sin conteo humano no corrige el stock: borra la evidencia de que faltaba algo. |
| Finanzas | `ejecutar_pago` | accion | Ningún agente ejecuta un pago. La plata sale cuando una persona dice que sale. |
| Compras | `emitir_orden` | accion | Una orden emitida es un compromiso con un tercero. Se manda cuando una persona la manda. |
| Ofertas | `publicar_al_club` | accion | Un push a los clientes sale del negocio hacia afuera y no se des-envía. Sale cuando una persona aprueba la oferta. |

---

## Resumen por pool

| Pool | Elementos |
| --- | ---: |
| Centro de Datos | 3 |
| Clientes | 3 |
| Compras | 4 |
| Configuración | 3 |
| Finanzas | 6 |
| Inteligencia | 4 |
| Motor de documentos | 3 |
| Ofertas | 3 |
| Stock | 3 |
| Tareas | 3 |

**Los diez pools declaran al menos un elemento constitucional.** No es un
resultado buscado: se recorrieron los diez preguntando qué no se puede tocar, y
en ninguno la respuesta fue "nada".

## Lo que NO está acá

- **Vocabulario de rubro.** `cumplimiento_regulado` está declarado sobre datos
  de personas en Clientes. Lo específico de farmacia —libro rubricado,
  controlados, receta— vive en Compliance, que todavía no está declarado. El
  límite existe en el formato y espera al pool.
- **Los umbrales concretos.** El manifiesto declara que el umbral de aprobación
  de pagos no se configura; cuál es el número es del proyecto, y se cambia a
  mano.
