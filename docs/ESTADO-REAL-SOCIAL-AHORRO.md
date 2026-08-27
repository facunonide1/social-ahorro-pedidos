# ¿Qué tan listo está NORA para operar?

Relevamiento del 27-ago-2026. **No se tocó nada**: es una foto, no un arreglo.

---

## 1 · La línea honesta

> **Hoy NORA no está operando sobre datos reales del negocio. Lo único cargado
> con información de verdad es la lista de ofertas de abril (215 productos) y los
> 21 pedidos de la app de clientes, de abril y mayo. Todo el resto del sistema
> —stock, compras, finanzas, documentos, tareas, personas— está vacío o lleno de
> datos de demostración.**

El sistema está construido y funciona. Lo que no tiene es la información del
negocio adentro. Son dos problemas distintos y sólo uno está resuelto.

---

## 2 · Los datos

De unas 180 tablas, **53 tienen alguna fila y 127 están completamente vacías.**

### Lo que tiene volumen es todo de demostración

| Qué | Filas | De demostración | Reales |
|---|---|---|---|
| Ventas diarias | 7.620 | **7.620** | 0 |
| Fotos de stock | 960 | **960** | 0 |
| Stock por sucursal | 480 | **480** | 0 |
| Clientes | 150 | **150** | 0 |
| Irregularidades de stock | 108 | **108** | 0 |
| Arqueos de caja | 48 | **48** | 0 |
| Vencimientos | 26 | **26** | 0 |

### Las maestras, que son la base de todo

| Qué | Estado |
|---|---|
| **Productos** | 120, y **los 120 son de demostración** (códigos DEMO-0001 a DEMO-0120). Ni un producto real del negocio. |
| **Proveedores** | **Cero.** Ninguna droguería cargada. |
| **Sucursales** | 4, pero se llaman «Sucursal Central / Este / Norte / Sur». No son los nombres reales de los locales de Ituzaingó. |
| **Tipos de tarea** | 29 cargados y bien definidos. Es la única maestra realmente lista. |

### Lo que sí es real

| Qué | Filas | Cuándo |
|---|---|---|
| **Lista de ofertas** (Colgate, etc., con códigos de barra) | 215 | Todas del 21-abr, una sola carga |
| **Pedidos de clientes** (la app pública) | 21 | 21-abr al 12-may |
| **Mensajes de WhatsApp** | 13 | abril y mayo |
| **Ofertas cargadas a mano** | 6 | — |
| **Clientes de la app** | 9 | mezclados con pruebas («test test126») |

### Lo que está en cero y debería tener algo

Órdenes de compra · recepciones · devoluciones · transferencias · documentos a
pagar · pagos · cheques · movimientos de caja · impuestos · gastos fijos ·
histórico de precios de compra · movimientos de stock · conteos · campañas ·
mensajes internos · turnos de empleados · despachos de controlados ·
importaciones desde SIFACO. **Todo en cero.**

---

## 3 · Quién puede usarlo

**Nadie del equipo tiene usuario todavía.**

Hay 4 usuarios administradores y **los 4 son super administradores**:

- `facundo.nonide@gmail.com` — vos
- `admin@socialahorro.com.ar`
- `admin@socialahorro.com` — parece un duplicado con dominio equivocado
- `admin@admin.com` — de prueba

**Ninguno tiene sucursal asignada.** No existe ni un encargado, ni un cajero, ni
un repositor. El sistema tiene permisos por rol y por sucursal bien armados, pero
no hay a quién aplicárselos.

El último ingreso al sistema fue el 14 de agosto, y fui yo probando.

### Qué le pasa a un encargado que entre mañana

1. **No puede entrar**: no tiene usuario. Hay que crearlo primero.
2. Si se lo creás, **ve la pantalla de inicio funcionando** con cinco urgencias
   — pero todas salen de los datos de demostración: «6 productos vencen en 30
   días», «84h sin farmacéutico». Ninguna es real.
3. **Casi todo lo que abra va a estar vacío**, con carteles correctos que le
   explican qué falta.
4. **No le va a dar error casi en ningún lado.** Las pantallas están sólidas.

---

## 4 · Sector por sector

| Sector | Pantallas | Sus datos | Estado | Qué falta |
|---|---|---|---|---|
| **Tareas** | 5 | 12 tareas (8 demo, 4 reales), **ninguna completada** | **Casi usable** | Usuarios reales y agendar el generador de recurrencias |
| **Ofertas** | 11 | 215 productos reales + 6 ofertas | **Casi usable** | Es lo más cerca de operar; falta decidir el circuito |
| **Stock / Operaciones** | 23 | Todo demo: 480 stocks, 26 vencimientos, 108 irregularidades | **Vacío** | Catálogo real y la importación desde SIFACO |
| **Compras** | 17 | Cero en todo | **Vacío** | Cargar las droguerías. Sin proveedores no hay compra posible |
| **Finanzas** | 19 | 48 arqueos demo, el resto en cero | **Vacío** | Cuentas, cheques y el circuito de caja |
| **Clientes** | 10 | 150 clientes demo | **Vacío** | Definir si el CRM sale de la cuponera o de SIFACO |
| **Centro de Datos** | 8 | 7.620 ventas demo, 0 importaciones reales | **Vacío** | Es la puerta de entrada de SIFACO: sin esto no entra nada |
| **Personas / RRHH** | 7 | 1 empleado, 8 turnos, 0 evaluaciones | **Vacío** | Cargar la gente |
| **Compliance** | 6 | 1 procedimiento en borrador, 0 despachos | **Vacío** | Lo tiene que completar el Director Técnico |
| **Comunicación** | 4 | Cero mensajes y cero canales | **Vacío** | — |
| **Conteo por zona** | 4 | Cero (recién construido) | **Vacío** | Depende del catálogo real |
| **Pedidos (app pública)** | — | 21 pedidos, 9 clientes | **Único con uso real**, parado desde mayo | — |

### Las automatizaciones

Hay **16 tareas automáticas programadas** (resumen del día, agenda, alertas de
stock, auditoría nocturna, recordatorios, campañas…).

**Ninguna dejó rastro de haber corrido nunca.** Todas las tablas donde deberían
escribir están en cero: no hay ni un resumen del día, ni una agenda generada, ni
un registro de auditoría, ni una alerta de stock, ni una métrica diaria.

Y una está construida pero **no está agendada**: el generador de tareas
recurrentes. Hay 4 plantillas de recurrencia cargadas esperando a alguien que
nunca las va a ejecutar.

---

## 5 · Lo que está roto

Ordenado por gravedad.

### Grave

**1 · Se puede ajustar el stock desde NORA.**
En la ficha de cada producto, dentro de Stock, hay un botón **«Ajustar»** que
permite sumar o restar unidades con un motivo. Eso escribe el stock en NORA
directamente. Es exactamente lo mismo que se retiró en la sesión anterior con la
pantalla vieja de inventarios: quedó vivo el hermano, en otra pantalla.
*Va contra la regla número uno: la autoridad de stock es SIFACO.*

**2 · El sistema promete cosas que hoy no pasan.**
La pantalla de Tareas dice «NORA te arma la agenda del día». La de recurrencias
dice «plantillas que generan tareas automáticamente cada día». Ninguna de las dos
está ocurriendo: la agenda nunca se generó y el generador de recurrencias no está
programado.

### Molesto

**3 · El panel de inicio da dos números distintos para lo mismo.**
Arriba dice «56 productos con stock crítico» y tres líneas más abajo «2 faltantes
por comprar». Son la misma pregunta con dos respuestas.

**4 · El clip para adjuntar archivos del asistente no hace nada.** Confirmado: se
toca y no abre nada.

**5 · El saludo del asistente se ve mal y cita un proveedor que no existe.**
Muestra los asteriscos del formato sin procesar y pone de ejemplo *«quiero hacer
pago Denver»* — un proveedor que no está cargado, porque no hay ninguno.

**6 · Dos accesos rápidos repetidos en el inicio.** «Pedirle a NORA» aparece dos
veces, y conviven «Crear tarea» y «Nueva tarea».

**7 · Un cartel con jerga interna.** El estado vacío de Documentos dice «Cargá un
documento **o el demo**». «El demo» no significa nada para quien va a usarlo.

**8 · El botón «Cargar demo» está a la vista en producción**, en la cabecera de
Clientes, junto a uno de borrar. Si alguien del equipo lo toca, se llena de datos
falsos.

### Lo que está mejor de lo que esperaba

No encontré **ni un enlace roto**: los 53 destinos de la aplicación existen todos.
Ni un botón sin función, ni un «pendiente» olvidado en el código, ni un error en
la consola del navegador, ni una pantalla que no cargue. Los carteles de «esto
está vacío» explican bien qué falta y llevan a donde hay que ir.

---

## 6 · Las diez reglas de oro

| # | Regla | Estado |
|---|---|---|
| 1 | SIFACO manda en precio y stock | ⚠️ **Tiene una excepción viva**: el botón «Ajustar» de la ficha de producto. El precio de venta, en cambio, no se escribe desde ningún lado. |
| 2 | Transferencias con 3 fotos | ✅ Cumple: foto al crear, al despachar y al recibir, y el stock se mueve en cada paso |
| 3 | Arqueo ciego con secuencia | ✅ Cumple, y además detecta si alguien altera los montos después de sellarlos |
| 4 | Ofertas: borrador → aprobación → ejecuta | ✅ Cumple, con los estados completos |
| 5 | Toda tarea completada genera control | ⚠️ **Casi**: 26 de los 29 tipos de tarea lo tienen. Tres quedaron sin verificación |
| 6 | Toda pantalla con productos exporta Excel con código | ⚠️ **Casi**: 37 pantallas exportan, pero **Vencimientos y Alertas no**, y las dos muestran productos |
| 7 | Retiros solo con aprobación | ✅ Cumple: el retiro entra como pendiente y hace falta un permiso específico para aprobarlo |
| 8 | Sucursal explícita en toda compra | ✅ Cumple |
| 9 | Libro rubricado y farmacéutico intocables | ✅ Cumple por diseño: NORA guarda sólo quién/cuándo/producto/turno, y el procedimiento dice que el registro legal es el libro. **Pero no se puede verificar en la práctica: cero despachos registrados** |
| 10 | Permisos por rol × sucursal × sub-app | ✅ Construido y sólido. **Sin usar: los 4 usuarios son super administradores** |

---

## 7 · Deuda técnica

Está sana, y conviene decirlo porque es la parte que suele estar peor.

- **Errores de tipos: cero.** El build falla si aparece uno, como corresponde.
- **El revisor de estilo de código está apagado** en el build. Es lo único
  aflojado.
- **Seguridad de la base: cero errores.** Quedan 65 advertencias menores, las
  mismas de siempre, ninguna nueva.
- **Migraciones**: 104 archivos, 91 registradas. La diferencia es de las primeras,
  aplicadas antes de que se llevara el registro; el esquema está al día.
- **5 tablas viejas esperando ser borradas**, ninguna vencida (vencen en
  noviembre).

---

## 8 · Qué hace falta para operar

### Trabajo humano — es lo que más bloquea

1. **Cargar el catálogo real de productos.** Hoy son 120 inventados. Sin esto no
   funciona stock, ni compras, ni conteos, ni ofertas contra precio.
2. **Cargar las droguerías.** Están en cero. Sin proveedores no hay una sola
   compra posible.
3. **Ponerles el nombre real a las 4 sucursales.**
4. **Crear los usuarios del equipo**, con su rol y su sucursal. Hoy hay 4 super
   administradores y ninguna persona real.
5. **Borrar los datos de demostración** una vez que entren los reales, para que
   nadie tome una decisión mirando un número inventado.

### Decisiones tuyas

6. **Cómo entran las ventas de SIFACO**: a mano, por archivo, cada cuánto y quién
   lo hace. Es la llave de casi todo lo demás.
7. **Qué sector arranca primero** y quién es el responsable de que se use.
8. **Si el botón «Ajustar» stock se va o se queda.** Hoy contradice la regla de
   oro número uno.

### Sesiones de código

9. Retirar o cerrar el ajuste manual de stock (medio día).
10. Agendar el generador de recurrencias, o sacar la promesa de la pantalla.
11. Los arreglos chicos del punto 5: el clip, los duplicados, los dos números que
    no coinciden, el cartel del «demo».
12. Esconder el botón «Cargar demo» detrás de algo que el equipo no toque.

### Cambio de operación en el negocio

13. Alguien tiene que **hacer el trabajo dentro de NORA**, no en paralelo. Es lo
    más difícil de todo y no lo resuelve ninguna sesión de código.

---

## 9 · Por dónde empezaría

**Por Tareas.**

Es el único sector que **no depende de que carguen nada**: los 29 tipos de tarea
ya están definidos y bien pensados. Sólo necesita usuarios de verdad.

- **Qué datos necesita:** ninguno. No depende del catálogo, ni de proveedores, ni
  de SIFACO.
- **Cuánta gente:** empieza con dos o tres. Un encargado que asigna y alguien que
  ejecuta.
- **Qué pasa si sale mal:** nada grave. Una tarea mal asignada se reasigna. No se
  pierde plata, no se rompe el stock, no se afecta a un cliente.
- **Qué deja instalado:** que la gente entre a NORA todos los días. Ese hábito es
  el que después hace posible todo lo demás — y es lo que hoy no existe, porque
  el último ingreso fue hace dos semanas y era una prueba mía.

Segundo, cuando esté el catálogo real: **el conteo por zona**. Está recién
terminado, probado, y es un circuito cerrado que no toca el stock de SIFACO.

### Lo que no conviene tocar todavía

- **Compras y Finanzas**: dependen de proveedores y del catálogo. Activarlos sin
  eso es garantizar que no se usen.
- **Centro de Datos**: es la puerta de SIFACO y es la decisión más importante,
  pero conviene tomarla con el catálogo ya cargado.
- **Compliance**: necesita al Director Técnico, no a un programador.
- **Comunicación y Clientes**: no bloquean nada y compiten por la atención del
  equipo.
- **Las automatizaciones**: no conviene prenderlas hasta que haya datos reales.
  Hoy generarían avisos sobre información inventada.

---

## 10 · Lo que no esperaba

**La calidad del código es mejor que el estado del proyecto.** Buscando cosas
rotas encontré muchas menos de las que esperaba: ni un enlace muerto, ni errores
de tipos, ni fallas en la consola. Los estados vacíos están bien escritos y
explican qué falta. El problema de NORA no es que esté mal hecho.

**El sistema está vacío pero se comporta como si estuviera lleno.** El panel de
inicio muestra cinco urgencias, el asistente redacta un informe del día, hay
badges con números en el menú. Todo eso sale de datos de demostración. Alguien
que entre por primera vez va a creer que el sistema está operando, y ese es el
riesgo más grande que encontré: no que esté vacío, sino que **no se note que está
vacío**.

**Ninguna automatización corrió nunca.** Están las 16 agendadas y sin una sola
línea de resultado. Eso significa que o nunca se dispararon, o se dispararon y
salieron sin hacer nada por falta de datos — y hoy no hay forma de distinguir una
cosa de la otra, porque no se registra cuándo corrió cada una.

**Hay más sistema construido que negocio adentro.** 144 pantallas y 134 servicios
para 21 pedidos reales de hace cuatro meses. Eso no es un defecto de nadie: es lo
que pasa cuando se construye rápido y bien. Pero la próxima sesión que agregue
una pantalla número 145 va a estar agrandando la parte que ya sobra.
