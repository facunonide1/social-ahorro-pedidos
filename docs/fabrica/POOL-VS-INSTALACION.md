# Qué es del pool y qué es de la instalación

Hasta v0.63 todo el manifiesto vivía en `fab_pool_versiones`, que es **la pieza
compartida**. Con un solo proyecto no se nota. Con dos, cambiar un título en uno
se lo cambia al otro.

Es el bloqueo real para el segundo proyecto, y va antes del Taller: poner
carriles de riesgo sobre un campo que se pisa entre instalaciones es construir
sobre algo que hay que reestructurar igual.

---

## La pregunta que resuelve cada caso

> **Si dos negocios instalan esta misma pieza, ¿querrían este campo distinto
> SIN que deje de ser la misma pieza?**
>
> Sí → instalación. No → pool.

**El pool siempre lleva el valor por defecto.** "De la instalación" quiere decir
que se puede sobrescribir por proyecto, no que el pool no lo declare. Un
proyecto que no dice nada usa el default de la pieza.

La clasificación vive en `lib/fabrica/clasificacion.ts`, como **código**, porque
el escritor la consulta para rechazar un cambio de pool hecho desde el contexto
de un proyecto. Un documento no rechaza nada.

---

## Del pool — compartido entre todos los proyectos

24 campos.

| Campo | Por qué |
| --- | --- |
| `formato` | La versión del esquema es del formato, no del negocio. |
| `pool` | La clave identifica la pieza en el catálogo. |
| `categoria` | Que sea núcleo o genérico es una propiedad de la pieza. |
| `desinstalable` | Si medio sistema le cuelga entidades, sacarlo no es una opción que el proyecto pueda tomar. |
| `alcance` | Que sea por punto o global es estructura, no preferencia. |
| `entidades` | Las tablas, quién es dueño y quién escribe son LA pieza. Cambiarlas es cambiar de pieza. |
| `pantallas[].ruta` | La ruta la define el código de la pieza. Un proyecto no la mueve. |
| `pantallas[].molde` | Tentaba ponerlo en instalación —"acá la queremos como tablero"— pero el molde define cómo se construye la pantalla. Cambiarlo no es configurar: es pedir otra pantalla. |
| `pantallas[].permiso` | Quién puede ver qué toca la constitución. Si cada proyecto pudiera reasignar permisos por configuración, el límite de umbrales_y_permisos deja de existir. |
| `pantallas[].titulo_dinamico` | Que el título salga de los datos es un hecho del código de la pantalla, igual en todos lados. |
| `acciones` | Qué sabe hacer el asistente es la pieza. Un proyecto no inventa herramientas nuevas por configuración. |
| `permisos` | Qué permisos exige la pieza para funcionar. Aflojarlo por proyecto es aflojar un control. |
| `depende_de` | De qué otras piezas depende es estructura del catálogo. |
| `usado_por` | La relación inversa de la anterior. |
| `usado_por_todos` | Ídem. |
| `subapp` | Si la pieza es navegable o vive dentro de otra, lo define su código. |
| `constitucional` | Un límite que cada proyecto pudiera aflojar no es un límite. Es la razón entera por la que el campo existe. |
| `configurable[].clave / etiqueta / tipo` | Qué se puede configurar lo define la pieza. |
| `dimensiones[].clave / columnas` | Que el sector se parta por una dimensión es estructura. |
| `agentes[].clave / nombre / trabajo / capacidades` | Qué agente aporta la pieza y qué sabe hacer. |
| `agentes[].necesita` | Qué datos precisa para funcionar es del agente, no del negocio que lo contrata. |
| `agentes[].acciones[].motivo / reversible / toca_dinero / compromete_tercero` | Son propiedades de la acción, iguales en todos lados. Si un mail no se des-envía acá, tampoco allá. |
| `agentes[].permisos` | El techo de permisos del agente sale de la constitución de la pieza. |
| `deprecadas` | Duda razonable: una tabla puede estar deprecada acá y viva allá. Pero deprecar es una decisión sobre la PIEZA —dejó de usarse y se va a borrar— y si cada proyecto decidiera por su cuenta, la pieza no tendría una historia sino diecisiete. |

## De la instalación — propio de cada proyecto

8 campos.

| Campo | Por qué |
| --- | --- |
| `nombre` | El catálogo necesita un nombre y el pool lo trae, pero un negocio puede llamarle "Depósito" a lo que otro llama "Stock" sin que deje de ser la misma pieza. El pool pone el default, el proyecto lo pisa. |
| `descripcion` | Mismo caso que el nombre: describe cómo lo usa este negocio. |
| `pantallas[].titulo` | EL CAMPO QUE ORIGINÓ ESTA SESIÓN. "Transferencias entre sucursales" es el texto de ESTE proyecto; otro querría el suyo. Vivía en la pieza compartida y cambiarlo en un proyecto se lo cambiaba al otro. |
| `pantallas[].navegable` | Qué aparece en el menú de este negocio. No cambia lo que la pieza sabe hacer. |
| `configurable → valores` | Para qué otra cosa existiría un parámetro configurable. |
| `dimensiones → valores` | Los rubros concretos son de este negocio: una farmacia tiene farmacia/perfumería/supermercado y una ferretería tendría otros. Que la dimensión EXISTA es del pool; cuáles son sus valores, del proyecto. |
| `agentes[].acciones[].participacion` | Un negocio puede tener al agente en `sugiere` y otro en `prepara`, según su confianza y su evidencia. PERO sólo hacia abajo: la instalación puede ser más conservadora que el pool, nunca más audaz, y un `nunca` no se mueve. |
| `agentes[].acciones[].brecha` | Es un hecho sobre un sistema real —"este cron manda sin confirmación"— no sobre la pieza. Otro proyecto puede tener la misma pieza sin la brecha. |

## Los que costó decidir

6 campos.

| Campo | Quedó en | El criterio que lo resolvió |
| --- | --- | --- |
| `nombre` | **instalacion** | El catálogo necesita un nombre y el pool lo trae, pero un negocio puede llamarle "Depósito" a lo que otro llama "Stock" sin que deje de ser la misma pieza. El pool pone el default, el proyecto lo pisa. |
| `descripcion` | **instalacion** | Mismo caso que el nombre: describe cómo lo usa este negocio. |
| `pantallas[].molde` | **pool** | Tentaba ponerlo en instalación —"acá la queremos como tablero"— pero el molde define cómo se construye la pantalla. Cambiarlo no es configurar: es pedir otra pantalla. |
| `pantallas[].permiso` | **pool** | Quién puede ver qué toca la constitución. Si cada proyecto pudiera reasignar permisos por configuración, el límite de umbrales_y_permisos deja de existir. |
| `dimensiones → valores` | **instalacion** | Los rubros concretos son de este negocio: una farmacia tiene farmacia/perfumería/supermercado y una ferretería tendría otros. Que la dimensión EXISTA es del pool; cuáles son sus valores, del proyecto. |
| `deprecadas` | **pool** | Duda razonable: una tabla puede estar deprecada acá y viva allá. Pero deprecar es una decisión sobre la PIEZA —dejó de usarse y se va a borrar— y si cada proyecto decidiera por su cuenta, la pieza no tendría una historia sino diecisiete. |

---

## La regla del nivel de participación

`participacion` es de la instalación, pero **sólo hacia abajo**.

| El pool declara | La instalación puede poner | No puede |
| --- | --- | --- |
| `hace_y_avisa` | cualquier nivel | — |
| `prepara` | `prepara`, `sugiere`, `nunca` | `informa`, `hace_y_avisa` |
| `sugiere` | `sugiere`, `nunca` | todo lo demás |
| `nunca` | **nada** | cambiarlo, punto |

Un negocio con menos evidencia puede ser más conservador que la pieza. Ninguno
puede ser más audaz que ella. Y un `nunca` no se mueve por configuración: es
constitucional, y ése es el motivo entero por el que existe el campo.

---

## Cómo se resuelve un valor

```
1 · el default que trae el pool
2 · si la instalación declara un override, gana el override
3 · si no dice nada, vale el default
```

Para cualquier campo se puede consultar **de dónde vino** el valor. En el portal
aparece al lado, y se puede volver al default del pool de un clic.

---

## Lo que esto habilita

Dos negocios instalando la misma pieza y cada uno con sus etiquetas, sus
umbrales y su nivel de confianza en el agente — sin bifurcar la pieza. Antes de
esta separación, el segundo proyecto obligaba a copiar el pool, y un catálogo
con copias no es un catálogo.
