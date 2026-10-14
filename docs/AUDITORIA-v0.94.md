# Auditoría de NORA HQ · 14 de octubre de 2026

Qué funciona de verdad, qué está construido y vacío, y qué está roto. Nada de
esto se arregló: esta sesión sólo mira y mide.

Todo lo que dice este informe está contado contra la base real. Donde no se pudo
medir, lo dice.

---

## Los cuatro números

| | |
|---|---:|
| **Anda** — tiene datos reales y se puede usar hoy | **6 sectores** |
| **Construido y vacío** — la pantalla está, la tabla está, no hay un registro | **9 sectores** |
| **Declarado y apagado** — a propósito, con el motivo y el dato que falta | **5 cosas** |
| **Roto** — existe y no funciona, o afirma algo que no es cierto | **6 cosas** |

Y un número que no estaba en la lista: **196 rutas** construidas, de las cuales
**37 no están en ningún menú**.

---

## Lo primero: seis cosas rotas

### 1 · La pantalla de armar un pedido no puede crear un pedido

Probado: se arma el pedido como lo hace la pantalla y la base lo rechaza.

```
new row for relation "orders" violates check constraint "orders_origin_number_ck"
```

La restricción exige que todo pedido que no venga de la tienda web tenga un
número manual. `/api/pedidos/crear` —el endpoint de v0.91— no lo asigna. Existe
una función vieja que sí lo asigna (`create_manual_order`), pero esa no conoce
las columnas nuevas: sucursal, cliente del CRM ni forma de entrega.

Con el número puesto a mano, **el resto del circuito anda**: reserva el stock, el
disponible baja de 64 a 63, pasa por los seis estados, llega a entregado con
fecha y el historial registra los cambios.

**Es una línea de código.** Y es lo que separa la pantalla de poder usarse.

### 2 · NORA dice que hay 4.293 documentos vencidos. Son 412

Preguntado textual: «¿Cuánto le debo a los proveedores?»

> 🔴 4293 documento(s) a pagar vencido(s)

La deuda real es **412 facturas por $128.532.326**. La diferencia son los **3.913
comprobantes marcados «se pagó y no se anotó»**, que v0.93 excluyó
explícitamente de la deuda, más 631 pagados, 294 notas de crédito y 71 en
cuarentena.

El mismo error está en el **badge rojo del menú de Finanzas**: cuenta igual.

Dos pantallas afirman cosas distintas sobre el mismo dato, y la que está mal es
la que se ve primero.

### 3 · Un bucle de ruido que se autoalimenta

- Una recurrencia genera **«Cargar trazabilidad ANMAT» cuatro veces por día**,
  todos los días desde el 27 de agosto: **196 tareas, 192 vencidas**.
- El cron de escalamiento ve esas 192 vencidas y manda una notificación por cada
  una: **768 notificaciones «Escalamiento: tarea vencida 2h+»**.
- El resumen diario suma otras 192.

**989 notificaciones, 768 de ellas la misma.** Nadie lo nota porque nadie entra.
El día que alguien entre, es lo primero que va a ver.

### 4 · Los tres roles ven exactamente lo mismo

Se crearon tres usuarios de prueba —encargado, mostrador y repartidor— y se entró
con la sesión de cada uno. Los tres ven, idéntico:

| | |
|---|---:|
| Facturas de proveedores | 4.976 |
| La deuda completa | 413 filas |
| Clientes | 150 |
| Arqueos de caja | 48 |
| Anomalías | 13.076 |
| El catálogo | 46.009 |

La separación por rol existe **sólo en las pantallas** (`requireAdminHubAccess`).
A nivel de datos, las políticas de lectura dicen «cualquier usuario activo del
hub»:

```sql
EXISTS (SELECT 1 FROM users_admin ua WHERE ua.id = auth.uid() AND ua.activo)
```

Un repartidor con su token —que vive en su navegador— puede pedirle a la API la
deuda completa, los clientes y los arqueos. No hace falta nada raro: es una URL.

**Es el hallazgo más importante de la auditoría.** El auditor de permisos dice
«TODO BIEN» porque mira las herramientas de NORA, no la RLS.

### 5 · Dos crons existen y nunca van a correr

`/api/cron/avisos-proveedores` y `/api/cron/avisos-compras` están escritos,
compilados y desplegados — y **no están en `vercel.json`**. Nadie los invoca
nunca. Los escribí yo en v0.93 y v0.94 y no los registré.

También está `/api/cron/recurrencias`, en la misma situación.

### 6 · `proveedores_detectar()` da timeout con un usuario real

Con la llave de servicio tarda 433 ms. Con la sesión de cualquiera de los tres
roles: `canceling statement due to statement timeout`.

El motivo: la política de `facturas_proveedor` hace dos subconsultas a
`users_admin` **por cada una de las 4.976 filas**. Probado como dueño parece
bien; probado como usuario se cae.

---

## Qué hay, sector por sector

| Sector | Estado | Qué anda | Qué falta | Qué lo destraba |
|---|---|---|---|---|
| **Catálogo / maestro SIFACO** | **ANDA** | 46.009 productos, 49.339 códigos de barras, 598.117 filas de ventas mensuales, 13 meses | el 49% no tiene costo (22.588) | que SIFACO exporte el costo |
| **Compras · qué y cuánto** | **ANDA** | 3.392 ítems urgentes por $100,8 M, las tres urgencias, las tres listas de qué no comprar | — | — |
| **Deuda a proveedores** | **ANDA** | 412 facturas por $128,5 M, 4.976 comprobantes de 2026, 55 proveedores | 3.913 marcados «pagado sin anotar» hay que revisarlos | que Facundo defina desde qué fecha algo cuenta como impago |
| **Anomalías del maestro** | **ANDA** | 13.076 reales | — | — |
| **Ofertas de SIFACO** | **ANDA** | 6.461 leídas del archivo, 18 ofertas propias reales | — | — |
| **Canales / tienda web** | **ANDA a medias** | 7.737 publicaciones espejadas, 11 productos con receta detectados | el espejo no corre desde el 1 de septiembre | correrlo de nuevo, o ponerlo en un cron |
| **Pedidos** | **ROTO** | 21 pedidos reales, pero de mayo | no se puede crear uno nuevo | una línea: asignar `manual_order_number` |
| **Recepción de mercadería** | **CONSTRUIDO Y VACÍO** | — | ni una recepción | que alguien saque la primera foto |
| **Histórico de costos** | **CONSTRUIDO Y VACÍO** | el motor escribe solo al confirmar | 0 líneas; 1 sola extracción, del 7 de agosto | ídem: la primera factura |
| **Pagos** | **CONSTRUIDO Y VACÍO** | — | 0 pagos registrados | — |
| **Órdenes de compra** | **CONSTRUIDO Y VACÍO** | el circuito completo se probó y anda | 0 órdenes reales | nada: se puede usar hoy |
| **Clientes / CRM** | **CONSTRUIDO Y VACÍO** | — | las 150 filas son **todas de demostración** | importar clientes reales |
| **Caja y arqueos** | **CONSTRUIDO Y VACÍO** | — | los 48 arqueos son **todos demo**; 0 cajas generales | cargar las cajas |
| **Ventas diarias** | **CONSTRUIDO Y VACÍO** | — | las 7.620 filas son **todas demo** | el archivo de ventas por sucursal |
| **Stock por sucursal** | **CONSTRUIDO Y VACÍO** | — | las 480 filas son **todas demo** | `tabla3e` completo |
| **Envíos y zonas** | **CONSTRUIDO Y VACÍO** | — | 0 zonas; las 8 que hay son demo de otra cosa | que Facundo cargue zonas y tarifas |
| **Compliance** | **CONSTRUIDO Y VACÍO** | — | 0 papeles, 0 recalls, 0 despachos | cargar los papeles de habilitación |
| **Comunicación interna** | **CONSTRUIDO Y VACÍO** | — | 0 canales, 0 mensajes | que haya usuarios |
| **NORA (el agente)** | **ANDA a medias** | 38 herramientas, contesta bien 7 de 10 preguntas | afirma 4.293 donde son 412 | arreglar `lo_urgente` |
| **La fábrica** | **ANDA** (aparte) | 10 instalaciones, 269 versiones de pool, 16 sectores censados | — | — |

---

## Lo que está declarado y apagado — bien hecho

Estas cinco no son deudas: son cosas escritas a propósito, con el motivo a la
vista y el dato que les falta identificado. Se prenden solas cuando el dato
llegue.

| Qué | Le falta |
|---|---|
| Transferir antes de comprar | `tabla3e` completo |
| Comparación de precios entre droguerías | facturas fotografiadas |
| Aviso «un proveedor subió más que el resto» | ídem |
| Seis crons de cálculo (frenados por la guarda de demo) | datos reales en vez de los 480 stocks y 7.620 ventas inventados |
| Mercado Envíos y la API de PedidosYa | decisión de integrarlos |

Los seis crons frenados **se evalúan todos los días** y dejan dicho por qué no
corrieron. El de hoy, textual: *«frenado: ventas_diarias (7620 de 7620),
irregularidades_stock (108 de 108)»*. Eso funciona exactamente como se diseñó.

---

## Las cinco preguntas del dueño

### 1 · ¿Cuánto tengo en stock y cuánto vale? — **SE PUEDE**
**$266.374.988 al costo**, 8.295 productos con stock. Consolidado de las cuatro
sucursales. **Por sucursal no se puede**: falta `tabla3e`.

### 2 · ¿Qué tengo que comprar esta semana y a quién? — **A MEDIAS**
Qué y cuánto, sí: **3.392 ítems por $100.842.221** entre «ya» y «esta semana».

A quién, sólo para **3.238 de los 46.009** productos: los que están en
`compra_venta.csv`. **A qué precio, no**: ese dato no existe en ningún archivo.

### 3 · ¿Cuánto le debo a los proveedores hoy? — **SE PUEDE, pero el sistema se contradice**
**$128.532.326 en 412 facturas.** La pantalla de deuda lo dice bien. El badge del
menú y NORA dicen 4.293 documentos. Hay que creerle a la pantalla.

### 4 · ¿Cuánto vendí ayer y con qué margen? — **NO SE PUEDE**
Cero ventas reales. Las 7.620 filas de `ventas_diarias` son **todas de
demostración**. El margen tampoco: 22.588 productos no tienen costo cargado.

NORA lo dice bien cuando se le pregunta: *«No tengo una herramienta para
consultar márgenes de ganancia ni rentabilidad general del negocio.»*

### 5 · ¿Qué está mal hoy que yo no sepa? — **A MEDIAS**
**13.076 anomalías reales** del maestro de SIFACO, que se pueden mirar. De avisos
de NORA hay **1 real** y 15 de demostración.

---

## Lo que falta, en tres columnas

Ordenado por cuánto destraba, no por sector.

### 1 · `tabla3e` completo — un archivo, cinco cosas
**Carga de datos.** Lo exporta SIFACO. Destraba:
- el stock por sucursal (hoy las 480 filas son demo)
- los quiebres reales
- la transferencia antes de comprar, ya escrita
- la reserva de stock por local en vez de sobre el total
- la sucursal de despacho de un pedido

### 2 · La primera factura fotografiada — una foto, tres cosas
**Carga de datos.** Alguien en el depósito con el celular. Destraba:
- el histórico de costos, que hoy tiene 0 líneas
- la comparación de precios entre droguerías
- el aviso de «este proveedor subió más que el resto»

### 3 · Los usuarios del equipo
**Decisión de Facundo.** Hoy hay 4 usuarios, los 4 `super_admin`, ninguno con
sucursal. Sin usuarios nadie entra. El circuito del encargado está probado.

### 4 · Cerrar el agujero de la RLS
**Sesión de código.** Las políticas de lectura no distinguen rol. Es lo único de
esta lista que es un riesgo y no una falta.

### 5 · Las seis cosas rotas
**Sesión de código.** La primera —el número del pedido— es una línea.

### 6 · Zonas, tarifas y el costo de la moto
**Carga de datos + decisión.** Sin eso, Envíos no se puede usar.

### 7 · Qué código de SIFACO es cada sucursal
**Decisión de Facundo.** GUZ, FIG, ARA, TES contra SA-01..04. Nadie lo declaró.

### 8 · La tasa de referencia y la cobertura objetivo
**Decisión de Facundo.** Hoy 3% mensual y 1 mes. Son números que puse yo porque
hacía falta alguno.

---

## El camino más corto a que alguien use NORA el lunes

**Compras.** Es el único sector donde el dato real ya está adentro y la pantalla
ya lo muestra bien.

Lo que ya anda hoy, sin cargar nada:
- `/admin/compras/plan` — 3.392 ítems urgentes por $100,8 M, con cuánto pedir de
  cada uno, las tres urgencias y las tres listas de qué no comprar
- `/admin/compras/a-quien` — a quién se le compra cada producto, y cuánto se le
  compró a cada droguería en 12 meses (Americana $661 M, Asopro $242 M)
- `/admin/compras/como-pagar` — contado con descuento contra plazo, en pesos de hoy
- `/admin/finanzas/deuda` — $128,5 M en 412 facturas
- El circuito de la orden de compra, probado de punta a punta en esta auditoría

**Lo que hay que hacer antes del lunes, en este orden:**

1. **Crear un usuario** con rol `comprador` o `gerente`. Cinco minutos.
2. **Arreglar el badge y `lo_urgente`** para que no digan 4.293. Media hora.
   Sin esto, lo primero que ve es un número falso diez veces más grande.
3. **Apagar la recurrencia de «Cargar trazabilidad ANMAT»** y borrar las 989
   notificaciones. Diez minutos. Sin esto, la campana tiene 768 avisos iguales.

Con eso, el lunes alguien abre el plan de compra y arma un pedido de verdad.

**Lo que NO hace falta para eso**: `tabla3e`, las facturas, las zonas, los
clientes. Todo eso destraba otras cosas, no ésta.

---

## Lo que está peor de lo que parece

**Seis sectores enteros son 100% de demostración.** No «tienen algunos datos de
prueba»: no tienen ni una fila real.

| Tabla | Filas | Reales |
|---|---:|---:|
| `ventas_diarias` | 7.620 | **0** |
| `stock_items` | 480 | **0** |
| `clientes` | 150 | **0** |
| `arqueos_caja` | 48 | **0** |
| `irregularidades_stock` | 108 | **0** |
| `vencimientos` | 26 | **0** |
| `controles_zona` | 64 | **0** |
| `stock_snapshots` | 960 | **0** |

El lente las tapa cuando está puesto. **Pero el lente está apagado por
defecto**: hay que prenderlo. Alguien que entre sin saber ve 7.620 ventas que
nunca ocurrieron.

**El auditor del lente tiene los números viejos.** Dice `tareas: 12` cuando hay
**64** de demostración, y `controles_zona: 0` cuando hay **64**. Las pantallas que
leen esas dos tablas se marcan como «no mienten hoy» y sí mienten. El auditor
está subestimando su propio hallazgo.

**Tres integraciones no mueven un dato desde hace meses.**

| | Último movimiento real | Hace |
|---|---|---:|
| Pedidos de la tienda web | 12 de mayo | 5 meses |
| Avisos de WhatsApp | 5 de mayo | 5 meses |
| Espejo del catálogo de Woo | 1 de septiembre | 6 semanas |
| Importación de SIFACO | 31 de agosto | 6 semanas |
| Motor de documentos | 7 de agosto · **1 sola extracción** | 2 meses |
| Conversaciones con NORA | 7 de agosto · **4 en total** | 2 meses |

**El dato del stock tiene seis semanas.** El archivo que está cargado es del 24
de agosto. Todo lo que dice el plan de compra —los $100,8 M urgentes— se calcula
sobre eso. No está mal el cálculo: está vieja la foto.

**Las 37 rutas huérfanas.** Veintiuna son de la fábrica, que es un producto
aparte y tiene su propia puerta. Las que importan: `/admin/canales` y
`/admin/canales/regla-9` —donde están los 11 productos con receta publicados en
la tienda— y las cuatro de `/admin/recepciones`, que es la pantalla del depósito
de v0.93. **La pantalla que hay que usar el lunes para fotografiar facturas no
está en ningún menú.**

**Y lo que se construyó y probablemente no se use:** el CRM de pedidos viejo
(`/pedidos`, `/clientes`, `/repartidor`) quedó duplicado con el sector Pedidos
nuevo. Son la misma tabla `orders` por dos puertas distintas, con dos padrones de
usuarios (`users_pedidos` con 8 filas, `users_admin` con 4). Mantener las dos es
mantener dos veces lo mismo.

---

## Los cuatro auditores, al 14 de octubre

| Auditor | Resultado |
|---|---|
| Cortes de consulta | 77 en riesgo · 16 mienten hoy · **0 sin aceptar** |
| Tablas ciegas (RLS) | 10 sin políticas · **0 ciegas** (ninguna la lee una pantalla) |
| Lente de demostración | 33 pantallas · 8 afirman sobre datos inventados · **0 sin aceptar** |
| Permisos de NORA | **TODO BIEN** |

Los cuatro pasan. Pero el de permisos mira las herramientas de NORA y **no mira
la RLS**, que es donde está el agujero del punto 4. Un auditor que pasa no es lo
mismo que un sistema sin agujeros: es un sistema sin los agujeros que ese auditor
sabe buscar.

---

## Las 68 columnas del maestro

Comparadas una por una contra el catálogo. **No falta ninguna por copiar.**

- **49 copiadas** al catálogo o a sus tablas satélite
- **19 que no corresponde copiar**: 3 ids internos de SIFACO, 3 fiscales, 3 de
  coberturas sociales que nada de NORA usa todavía, `dmv_30` (NORA calcula su
  propia demanda), `gcom`, 2 casi vacías y **6 vacías en el archivo**

Verificado con cuántos productos tienen cada una cargada: `sku` 46.009,
`condicion_venta` 46.009, `nombre_comercial` 46.009, `vademecum` 45.710,
`registro_sanitario` 24.423, `ult_venta` 14.546, `clasificacion_abc` 6.637,
`ubicacion` 946.

Esto cierra lo que quedó abierto en v0.91 y v0.92.

---

## Qué se probó de verdad en esta auditoría

No es un listado: se ejecutó.

- **Tres usuarios de prueba creados** (encargado, mostrador, repartidor), se entró
  con la sesión de cada uno, se midieron 17 lecturas y 7 funciones por rol, y se
  borraron. Quedan cero.
- **El camino de un pedido**, de punta a punta: buscar producto, crear cliente,
  crear pedido, reservar, los seis estados, entregar. Borrado al terminar.
- **El camino de una compra**: recomendación → a quién → orden → renglones →
  seguimiento → emitir → texto para WhatsApp. Borrado al terminar.
- **Diez preguntas a NORA** con el modelo real y las 38 herramientas reales.
- **Los cuatro auditores** corridos.
- **Las 68 columnas** del maestro comparadas contra el esquema real.
- **Conteo exacto** de filas de las 232 tablas, separando demo de real.

Lo único que no se probó: la extracción de una factura de verdad, porque hace
falta una foto. Y el navegador — todo se probó contra la base y las funciones,
no haciendo clic.
