# Contar una góndola por primera vez

Instrucciones para alguien que nunca usó esto. Diez minutos de lectura, y
después el conteo son veinte.

---

## Antes de ir a la góndola

**1 · Elegí un tramo chico.** Un pedazo de góndola que se recorra de una pasada:
*"Perfumería, pasillo 2, estantes 1 a 4"*. Entre **15 y 40 productos**. Si son
120 se abandona por la mitad, y media zona contada no sirve para nada.

**2 · Anotá los productos en el orden en que están.** Caminá el tramo con el
teléfono y anotá, en el orden en que los ves: el código y el nombre.

```
DEMO-0001, Paracetamol 500 x20
DEMO-0002, Amoxicilina 875 x30
Perfumina a granel
```

El orden importa más de lo que parece: si la lista sigue el recorrido, el conteo
dura veinte minutos; si sigue el orden del catálogo, hay que ir y volver por cada
producto.

Si un producto no tiene código, ponelo igual — se cuenta, pero al final va a
decir «no se pudo comparar», porque sin código no hay con qué medirlo.

**3 · Decidí contra qué se compara.** Acá el stock está separado entre lo que
está en góndola y lo que está en el depósito. Si vas a contar **sólo la
góndola**, elegí góndola: si eligieras «todo el punto», todo lo que está guardado
en el depósito va a aparecer como faltante, y alguien va a salir a buscar
mercadería que nunca se perdió.

---

## En la app: cargar la lista

**Operaciones → Contar una zona → Importar una lista.**

Completá cuatro cosas:

| | |
|---|---|
| **Nombre de la zona** | «Perfumería pasillo 2, estantes 1 a 4» |
| **Punto** | La sucursal donde está esa góndola |
| **Contra qué se compara** | Góndola, depósito o todo el punto |
| **La lista** | Pegala en el recuadro, una línea por producto |

Después **«Ver qué va a pasar»**: te dice cuántos productos encontró en el
catálogo y cuáles no. Nada se guarda hasta que toques **«Guardar la lista»**.

La lista queda guardada para siempre. La próxima vez que cuentes esa zona no hay
que volver a cargarla.

---

## Contar

En la lista de zonas, tocá **«Contar»**.

Aparece **un producto por pantalla**: el nombre, el código, y un casillero
grande. Escribís cuántas hay y tocás **«Listo»** (o Enter). Pasa solo al
siguiente.

**Lo que tenés que saber mientras contás:**

- **No vas a ver lo que el sistema espera, y es a propósito.** Si vieras que dice
  40, ibas a escribir 40. Las diferencias aparecen recién al cerrar.
- **Se guarda producto por producto.** Si se corta la señal o se apaga la
  pantalla, lo contado hasta ahí está.
- **Si no hay ninguna, escribí 0.** No es lo mismo que saltearlo: cero es «lo
  busqué y no había» —un dato— y saltear es «no lo miré» —un hueco.
- **Si no lo encontrás, tocá «Saltear»** y decí por qué. Te lo va a pedir: un
  salteo sin motivo no se distingue de un cero.
- **Para corregir uno anterior**, tocá «Anterior» y escribí el número nuevo: al
  tocar el casillero se selecciona lo que había, así que lo que escribas
  reemplaza. **Tocá «Listo» otra vez** — moverse no guarda.
- **Podés dejarlo por la mitad y seguir después.** Entrás de nuevo por «Contar» y
  sigue donde estabas.

Arriba se ve *«7 de 20 contados»*, y al lado del casillero dice en qué estado
está ese producto: «sin contar», «contado: 12» o «salteado: …».

**Cuánto tarda:** el ensayo de 20 productos, con una corrección y un salteo en el
medio, dio unos **20 minutos** de punta a punta. La parte de tipear son segundos;
lo que lleva tiempo es contar en el estante.

---

## Cerrar

Cuando estén los 20 —contados o salteados con motivo— se habilita **«Cerrar la
zona y ver las diferencias»**.

Recién ahí el sistema mira lo que él tenía anotado y te muestra:

> Contaste 20 items. 17 coinciden. 3 tienen diferencia, por $46.800 en total.
> La más grande es Shampoo Anticaspa x100: contaste 4, el sistema dice 71.

Ordenado por lo que cuesta la diferencia, no por código.

**Una vez cerrado no se puede volver a contar sobre ese conteo.** Si hay que
recontar, se abre uno nuevo sobre la misma lista.

---

## Qué pasa con las diferencias

Al cerrar, el sistema abre tres cosas solo:

1. **Queda registrada** en Irregularidades. Ahí es donde se ve si el mismo
   producto da diferencia todos los meses, que es lo que vale.
2. **Una tarea de recuento** con los productos que no coincidieron, para
   confirmar si la diferencia era real o un error de conteo.
3. **Una tarea para corregir el stock en SIFACO**, con el detalle y el Excel
   listo para bajar.

**NORA no toca el stock.** La corrección la hace una persona en SIFACO, y cuando
está hecha, esa persona cierra la tarea. El sistema no lo puede verificar solo, y
no va a decir que está hecho hasta que alguien lo diga.

Las diferencias chicas no generan tareas: hoy el corte está en **$5.000 o 5%**,
lo que se cumpla primero. Perseguir una diferencia que cuesta menos que el tiempo
de perseguirla es ruido.

---

## Lo que todavía tiene que decidir una persona

El sistema está listo. Estas cinco cosas no las puede decidir él:

**1 · Qué zona, concretamente.** Un tramo con nombre y límites.

**2 · La lista en el orden del recorrido.** Es el único trabajo previo que no se
puede saltear.

**3 · Quién cuenta**, y que ese usuario esté activo en NORA. No necesita tener
sucursal asignada, pero si no la tiene, al importar va a tener que elegir el
punto a mano.

**4 · Quién corrige en SIFACO y quién verifica.** Hoy las tareas salen para
administración (corregir) y gerencia (verificar), por defecto. Conviene que esas
personas lo sepan antes de que les aparezca una tarea.

**5 · Si el corte de $5.000 o 5% sirve para esa góndola.** Es un número que puso
el sistema y que nadie confirmó todavía.

Y la frecuencia —cada cuánto se cuenta esa zona— después de la primera vez. Antes
no: la programación automática está apagada a propósito, porque generar tareas de
conteo que nadie va a hacer llena la bandeja de ruido en dos semanas.
