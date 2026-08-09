# Los tres carriles

Sin carriles, todo cambio pesa lo mismo — y lo que pesa todo igual termina
aprobándose todo igual. El carril es lo que hace que la auto-modificación sea
segura en vez de peligrosa.

| | Carril | Qué pasa |
| --- | --- | --- |
| 🟢 | **se aplica solo** | Reversible, sin efecto sobre plata, permisos ni cumplimiento. Se aplica, avisa, y se revierte de un toque |
| 🟡 | **con firma** | Espera decisión humana |
| 🔴 | **prohibido** | El Taller no lo propone. Si alguien lo pide, **se registra el intento y se avisa** |

---

## El carril se DERIVA, no se elige

Lo determina qué campo se toca y qué dice el manifiesto sobre ese campo. Nadie
elige el carril de su propio cambio: ésa es la diferencia entre un control y un
formulario.

El carril de una propuesta es el **más restrictivo** de sus campos. Un cambio
que toca cinco etiquetas y un umbral es amarillo entero.

### El orden en que se decide

```
1 · ¿el campo está protegido por la constitución?        → 🔴
2 · ¿es un cambio de participación?                       → depende (ver abajo)
3 · ¿es un campo de la pieza, pedido desde un proyecto?   → 🔴
4 · ¿el tipo puede llegar a verde alguna vez?             → si no, 🟡
5 · ¿el verde está habilitado para ese tipo?              → si no, 🟡
6 ·                                                        → 🟢
```

### La constitución no bloquea apretar el control

Bajar el nivel de participación de una acción protegida **se permite** (aunque
espera firma igual). Prohibirlo sería impedir que un negocio sea más prudente
que la pieza, que es lo contrario de lo que la constitución protege.

Subirlo por encima del piso del pool, o tocar un `nunca`: 🔴.

---

## La regla de arranque

**Los primeros meses, TODO pide firma.** Incluso lo que después irá al verde.

El carril verde se habilita **por tipo de campo, a mano**, cuando ya se vieron
suficientes cambios de ese tipo como para saber que son inocuos. Sin fila en
`fab_carriles_habilitados` = amarillo. El default es pedir firma, no aplicar
solo.

Sólo dos tipos pueden llegar al verde alguna vez: **etiquetas** y
**visibilidad**. Los demás cambian cómo funciona algo, no cómo se llama.

Se habilita por *tipo* y no por *campo* porque un interruptor por campo es un
interruptor que nadie termina de configurar.

---

## La tabla

Derivada de verdad: esto salió de correr `carrilDeCampo` sobre casos reales de
los manifiestos declarados, con el verde deshabilitado (el estado de hoy).

| Campo | Nivel | Carril | Por qué |
| --- | --- | --- | --- |
| `titulos./admin/finanzas/documentos` | instalacion | 🟡 con firma | Etiquetas y títulos podría aplicarse solo, pero el carril verde todavía no está habilitado para este tipo. Arranca todo con firma a propósito. |
| `nombre` | instalacion | 🟡 con firma | Etiquetas y títulos podría aplicarse solo, pero el carril verde todavía no está habilitado para este tipo. Arranca todo con firma a propósito. |
| `ocultas./admin/finanzas/documentos/lote` | instalacion | 🟡 con firma | Visibilidad y orden de pantallas podría aplicarse solo, pero el carril verde todavía no está habilitado para este tipo. Arranca todo con firma a propósito. |
| `configurable.umbral_confianza_auto` | instalacion | 🟡 con firma | Umbrales configurables: cambia cómo funciona algo, no cómo se llama. Espera decisión humana. |
| `dimensiones.rubro` | instalacion | 🟡 con firma | Valores de una dimensión: cambia cómo funciona algo, no cómo se llama. Espera decisión humana. |
| `agentes.lector_de_papeles.extraer_documento.participacion` | instalacion | 🔴 prohibido | "extraer_documento" está protegido por el límite confirmacion_humana. Lo que el modelo leyó no entra a las cuentas sin que una persona lo mire. Un importe mal leído que se contabiliza solo no se descubre hasta el cierre. |
| `agentes.lector_de_papeles.extraer_documento.participacion` | instalacion | 🔴 prohibido | "extraer_documento" está protegido por el límite confirmacion_humana. Lo que el modelo leyó no entra a las cuentas sin que una persona lo mire. Un importe mal leído que se contabiliza solo no se descubre hasta el cierre. |
| `entidades` | instalacion | 🔴 prohibido | Es un campo de la pieza compartida. Cambiarlo desde un proyecto lo cambiaría para todos los que la instalaron. |
| `constitucional` | pool | 🔴 prohibido | Los elementos constitucionales no se modifican por configuración. Es el motivo entero por el que existen. |
| `agentes.analista_comercial.fijar_precio_venta.participacion` | instalacion | 🔴 prohibido | "fijar_precio_venta" está protegido por el límite autoridad_precio. La autoridad sobre el precio de venta es del sistema de facturación. La fábrica propone; el precio lo escribe otro. No es configurable en ningún proyecto. |

---

## Estado hoy

| Tipo de campo | ¿Puede llegar a verde? | ¿Habilitado? |
| --- | --- | --- |
| Etiquetas y títulos | sí | **no** |
| Visibilidad y orden | sí | **no** |
| Umbrales configurables | sólo si el parámetro pesa `inocuo` | **no** |
| Valores de una dimensión | no | — |
| Nivel de participación | no | — |
| Estructura de la pieza | no | — |
| Elementos constitucionales | nunca | — |

Todo pide firma. Es a propósito.

---

## Por qué en v0.68 NO se habilitó el primer verde

La sesión v0.68 tenía como bloque final habilitar el carril verde para los
parámetros `inocuo`, **si había historia suficiente**. Se midió y no la hay. Las
tres condiciones fallan, y cada una alcanzaría sola.

### 1 · Cero cambios aprobados que hayan quedado aplicados

De 9 propuestas en la historia del proyecto:

| Estado | Cuántas |
| --- | --- |
| aplicadas y que **siguen** aplicadas | **0** |
| aplicadas y después revertidas | 6 |
| rechazadas | 3 |

Las 6 aplicadas las revirtió su propio script de prueba minutos después. No hay
historia de uso: hay historia de pruebas. Habilitar la aplicación automática
apoyándose en eso sería confundir "lo probamos" con "lo usamos".

### 2 · Los 4 parámetros `inocuo` viven en pools apagados

| Parámetro | Lector del pool |
| --- | --- |
| `inteligencia.resumen_diario_activo` | apagado |
| `tareas.puntaje_activo` | apagado |
| `clientes.puntos_activos` | apagado |
| `compras.radar_demanda` | apagado |

Un cambio en verde sobre cualquiera de ellos se aplicaría solo y **no se vería
en ninguna parte**. Eso choca de frente con la regla del propio carril verde: un
cambio que se aplica solo y nadie ve es un cambio que nadie puede revertir.

Los dos pools prendidos no tienen ningún `inocuo`: los 3 parámetros de
documentos son los 3 sensibles, y los 3 de stock son operativos.

### 3 · El verde no está implementado como automatización

Hoy el carril verde es una **clasificación**, no una automatización: una
propuesta que cae en verde se inserta igual como `pendiente` y espera firma.
Nada la aplica sola.

Eso significa que "habilitar el verde" hoy cambiaría la etiqueta y nada más — y
una etiqueta que promete que algo se aplica solo, sobre un mecanismo que no lo
aplica, es exactamente la clase de promesa que la fábrica no hace.

### Qué haría falta, en orden

1. Que algún pool prendido declare un parámetro `inocuo`, o que se prenda un pool
   que ya tenga uno.
2. Una historia real de cambios aprobados que se hayan quedado: usados, no
   probados.
3. Implementar la aplicación automática con su aviso y su deshacer de un toque —
   el aviso no es opcional, es lo que hace que el verde sea reversible.
