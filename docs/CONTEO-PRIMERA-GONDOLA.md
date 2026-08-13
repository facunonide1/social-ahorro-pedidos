# Contar la primera góndola — qué falta del lado humano

Actualizado: 12-ago-2026 · v0.78

El motor está. Lo que sigue no lo puede decidir el sistema, y hasta que no esté
decidido el conteo no arranca. La lista salió del reporte de v0.77 con siete
puntos; acá queda con lo que cerró v0.78 y lo que sigue abierto.

---

## Cerrado por el sistema

| | Qué era | Cómo quedó |
|---|---|---|
| ✅ | **Contra qué se compara** — góndola, depósito o total | El importador lo pregunta y **no tiene default**. Sin elegirlo no se puede guardar la lista. Se ve en la tarjeta, al contar, al cerrar y en cada fila del Excel |
| ✅ | **Que quien cuenta tenga punto** | Una lista sin punto ya no se puede crear, y la pantalla avisa al entrar si tu usuario no tiene punto asignado o si tu rol no puede importar |
| ✅ | **Cuán grande conviene una zona** | La pantalla lo dice donde se decide: **15 a 40 items**, lo que entra en veinte minutos. Una góndola de 120 se abandona por la mitad |
| ✅ | **Que el orden es el del recorrido** | Subió a un bloque antes de cargar la lista, con la consecuencia: veinte minutos contra ir y volver por cada item |

## Sigue abierto — y lo decide una persona

**1 · Qué zona, con nombre y alcance.**
Un tramo concreto: *"Perfumería, góndola del pasillo 2, estantes 1 a 4"*. Chica la
primera vez. El sistema recomienda 15 a 40 items; cuál es esa zona no lo sabe.

**2 · La lista, en el orden del recorrido.**
Alguien tiene que caminar la góndola y anotar los SKU en el orden en que
aparecen. Es el único trabajo previo que no se puede saltear. Se puede pegar
desde el teléfono: una línea por item, `SKU, descripción`.

**3 · Quién cuenta.**
Y que ese usuario esté activo en NORA. No necesita punto asignado —las listas
nuevas siempre tienen el suyo— pero si no lo tiene, al importar va a tener que
elegirlo a mano.

**4 · Quién corrige en SIFACO y quién verifica.**
Las dos tareas se crean solas con rol responsable y verificador por defecto
(`administrativo` corrige, `gerente` verifica). Conviene que esas personas lo
sepan antes de que les aparezca una tarea.

**5 · Si el umbral tiene sentido para esa góndola.**
Hoy: **$5.000 o 5%**, lo que se cumpla primero. Es un número puesto por el
sistema que nadie confirmó. Se cambia en `cnt_config`.

**6 · La frecuencia, después de la primera vez.**
Antes no. La programación está construida y **apagada** a propósito: si se
prendiera sin haber contado nunca, generaría tareas que nadie va a hacer.

---

## El camino, del principio al fin

1. **Operaciones → Contar una zona** (o la pestaña «Conteos por zona»).
2. **Importar una lista**: nombre de la zona, punto, contra qué se compara, y la
   lista pegada.
3. **Ver qué va a pasar** → muestra cuántos matchean el catálogo y cuáles no.
4. **Guardar la lista**. Queda para siempre: se reutiliza cada vez que se cuente.
5. **Contar** desde el teléfono. Un item por pantalla. Enter guarda y avanza.
6. **Cerrar la zona** → recién ahí aparecen las diferencias, y se crean la
   irregularidad, la tarea de recuento y la tarea de corrección en SIFACO.

Lo que el sistema **no** hace, y hay que saberlo: no ajusta stock. La corrección
se hace en SIFACO, la hace una persona, y que esté hecha lo confirma esa persona
cerrando la tarea.
