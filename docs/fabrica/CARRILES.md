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
| Umbrales configurables | no | — |
| Valores de una dimensión | no | — |
| Nivel de participación | no | — |
| Estructura de la pieza | no | — |
| Elementos constitucionales | nunca | — |

Todo pide firma. Es a propósito.
