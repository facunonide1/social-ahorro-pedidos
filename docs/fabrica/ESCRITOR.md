# El escritor

Lo que faltaba para que la fábrica se pueda **arreglar en caliente**.

Hasta v0.62 gobernaba pero no se corregía: el manifiesto vivía en código y un
título mal declarado exigía un deploy. El flag apagaba, pero no arreglaba — la
peor combinación posible.

Desde v0.63 la fuente de verdad es la base. El código conserva una copia como
**semilla**: sirve para arrancar un proyecto en frío, y para nada más.

---

## Contrato

```ts
escribirVersion({ clave, manifiesto, motivo, autorId, gobernando }) → versión nueva
revertirA({ clave, versionId, motivo, autorId, gobernando })        → versión nueva
```

### Tres reglas innegociables

1. **Nunca se edita una versión en lugar.** Cada escritura crea una nueva y
   mueve `es_actual`.
2. **La anterior queda intacta y consultable.**
3. **Motivo obligatorio** — en la función de base, no sólo en la interfaz. La
   interfaz no es el único camino, y un cambio sin motivo no se entiende seis
   meses después, que es exactamente cuando hace falta entenderlo.

Un índice único parcial sobre `(pool_id) where es_actual` hace de la invariante
una regla del motor: dos versiones actuales significarían que el lector elige al
azar.

Todo pasa por `fab_escribir_version`, una transacción. Bajar la anterior,
insertar la nueva y apuntar la instalación tienen que ocurrir juntos o no
ocurrir: una caída en el medio dejaría al pool sin versión actual, y el lector
caería al código sin que nadie lo hubiera pedido.

---

## Las cuatro validaciones

Se corren en orden y **si falla cualquiera no se escribe nada**.

| # | Qué comprueba | Por qué en ese orden |
| --- | --- | --- |
| 1 | Valida contra el esquema 1.2.0 | Un manifiesto inválido no puede gobernar |
| 2 | No marca modificable nada constitucional | Se dice con sus palabras: "esto no se toca" ≠ "el campo está mal" |
| 3 | No rompe dependencias de otros pools | Si otro declara que una entidad es de éste, no se la puede sacar sin avisarle |
| 4 | Si el pool **gobierna**, no deja pantallas sin título | Con el pool apagado un título vacío es un dato feo; con el pool prendido es una cabecera en blanco en la cara de alguien |

---

## El diff, en castellano

Quien aprueba tiene que poder leer qué va a pasar sin traducir mentalmente una
estructura de datos:

> El título de `/admin/finanzas/documentos/revision/[id]` pasa de "Revisar
> documento" a "Revisión de factura". Lo ven 4 personas con acceso al sector.
>
> **Deshacerlo:** la devuelve al título anterior en la request siguiente. No se
> pierde nada.

El **costo de deshacer** va al lado de cada línea. Aprobar rápido sólo es seguro
si se sabe qué cuesta deshacer.

La cuenta de personas se calcula **de verdad**, contra los permisos reales de
cada usuario del panel. "Lo ven 4" y "lo ven 40" son decisiones distintas, y
quien aprueba tiene derecho a saber cuál está tomando. Si no se puede contar,
devuelve 0 en vez de inventar un número.

Pedir el diff es una llamada aparte de guardar. Que revisar sea un paso propio y
no un efecto de guardar es la diferencia entre **revisar** y **enterarse**.

---

## Revertir

`revertirA` **crea una versión nueva** con el contenido de la vieja y anota a
cuál volvió (`revierte_a`).

**No borra.** Si revertir borrara la versión mala se pierde el registro de que
existió y de qué rompió — que es justo lo que hay que mirar después.

En el portal hay un botón por versión. La más común —volver a la anterior— es un
toque.

---

## Qué se puede editar hoy

**Sólo títulos de pantalla**, que es lo único que el lector gobierna.

Permitir editar permisos o acciones cuando el lector todavía no los lee sería
guardar cambios que hoy no hacen nada — y que se aplicarían todos juntos el día
que el lector empiece a leerlos, sin que nadie los haya revisado con esa
consecuencia en mente.

Las pantallas con `titulo_dinamico` no se editan: su cabecera sale de los datos
de la fila.

---

## Qué pasa si falla cada paso

| Falla | Qué pasa |
| --- | --- |
| Motivo vacío | No se escribe. Error visible en el editor |
| Alguna de las 4 validaciones | No se escribe. Se listan los rechazos con el número de paso |
| La transacción de base | No se escribe nada. El pool queda como estaba |
| El manifiesto guardado no valida (después) | El **lector** cae al código y registra un fallback con el motivo. La pantalla sigue funcionando |
| El pool está apagado | El cambio se guarda y no se ve en ningún lado hasta prender el lector |

---

## Herramientas de consola

```bash
npx tsx scripts/fabrica-probar-escritor.ts documentos   # los 5 pasos, sobre un pool prendido
npx tsx scripts/fabrica-publicar.ts "motivo" [pool...]  # publica la semilla del repo como versión
npx tsx scripts/fabrica-sombra.ts stock                 # corre sombra sobre las pantallas cableadas
npx tsx scripts/fabrica-verificar.ts                    # valida y compara la que GOBIERNA
```

`fabrica-publicar` no es el sembrador de v0.58: aquel escribía la tabla directo.
Éste pasa por el escritor, o sea que valida, versiona, exige motivo y queda
auditado.

---

## Dos agujeros que cerró esta sesión

**El verificador validaba la copia equivocada.** Validaba la semilla del repo y
no el manifiesto que gobierna. Por ahí, 8 de 10 declaraciones quedaron con
formato `1.1.0` en la base desde v0.61 —inválidas— con el verificador en verde
durante toda una sesión.

**El modo sombra callaba.** Cuando el manifiesto no se podía usar, `compararEnSombra`
salía sin registrar nada. Un manifiesto inválido se veía exactamente igual que
una declaración perfecta: *0 diferencias*. El peor cero posible, porque parece
que está todo bien. Ahora registra un fallback con el motivo.
