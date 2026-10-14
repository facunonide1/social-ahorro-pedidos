# Cómo comprar con NORA

Para la persona que arma los pedidos a las droguerías. No hace falta saber nada
del sistema: son cuatro pantallas y siempre en el mismo orden.

---

## Antes de empezar

Entrás con tu mail y tu contraseña. Si no podés entrar, no es tu culpa: pedile a
Facundo que te dé el acceso con rol de **comprador**.

Lo primero que vas a ver es un número arriba de todo: **de cuándo es el dato de
stock**. Si dice «hace más de 7 días» en amarillo, el archivo de SIFACO está
viejo. Se puede comprar igual, pero conviene avisar para que lo vuelvan a
importar: todo lo que la pantalla calcula sale de ese archivo.

---

## 1 · Qué comprar

**Compras → Plan de compra**

Arriba hay tres números grandes: cuánto stock hay, cuánto se consume por mes y
para cuántos meses alcanza. Hoy alcanza para **1,3 meses**, y la frase que está
abajo es la que importa:

> El problema no es que falte mercadería: está mal repartida.

Después vienen las tres urgencias:

| | Qué significa |
|---|---|
| **YA** | Se agotó o queda menos de una semana |
| **Esta semana** | Queda menos de dos semanas |
| **Esta quincena** | Queda menos de un mes |

Y abajo, cuatro botones. El primero —**Comprar**— es la lista de lo que falta,
con cuánto pedir de cada cosa. Los otros tres son **lo que NO hay que comprar**:
lo que sobra, lo que no se vendió en once meses y lo que es de encargo. Vale la
pena mirarlos: ahí hay $114 millones parados.

**El botón de exportar** te baja un Excel con el SKU y el código de barras de
todo lo que está en la lista, no sólo de lo que se ve en pantalla.

---

## 2 · A quién comprarle

**Compras → A quién comprarle**

Dos cosas:

- **Cuánto le comprás a cada droguería** en los últimos 12 meses. Eso es lo que
  tenés que tener en la mano cuando peleás el precio: si a Americana le compraste
  $661 millones, es un número que sirve decir en voz alta.
- **Quién provee cada producto.** Si un producto se le compra a tres droguerías,
  la pantalla te lo muestra.

**Lo que esta pantalla NO sabe: a qué precio te lo vende cada una.** Ese dato no
existe todavía en ningún archivo. Va a aparecer solo cuando se empiecen a
fotografiar las facturas en la recepción.

---

## 3 · Cómo pagarlo

**Compras → Cómo pagarlo**

Esta es la que más plata mueve y nadie la hace a mano.

Ponés el monto de la compra y las opciones que te ofrece el proveedor —8% al
contado, 5% al contado, 30 días, 60 días— y NORA te dice **cuánto vale cada una
en pesos de hoy**.

Un ejemplo real: sobre $5.000.000 al 3% mensual, el 8% contado te ahorra
$400.000 y los 30 días valen $145.631. Conviene el contado. Pero si la tasa
fuera más alta, el plazo le gana — por eso la cuenta hay que hacerla cada vez.

**La tasa es un número que define Facundo**: es cuánto rinde la plata de la
cadena en un mes. Está en 3%.

Y abajo a la derecha, **la caja disponible**. Un descuento por contado sólo sirve
si hay plata: si la mejor opción es contado y la caja no alcanza, la pantalla te
lo dice.

---

## 4 · Armar el pedido y mandarlo

**Compras → Órdenes de compra → Nueva**

Elegís la droguería, la sucursal que compra —es obligatorio, tiene efecto
fiscal— y cargás los renglones. Después:

- **Exportás el Excel**, o
- **copiás el texto** y lo pegás en el WhatsApp de la droguería. Sale con el SKU
  adelante, que es lo que ellos necesitan para cargarlo sin preguntarte nada.

**NORA no manda el pedido sola.** Lo armás vos y lo mandás vos.

---

## Después, cuando llega

**Stock → Llegó mercadería**

Esto lo puede hacer quien recibe, desde el celular, parado en el depósito. Son
dos fotos: **la factura** y **la pantalla de SIFACO**. Las dos ya se sacan hoy;
lo único que cambia es que van acá en vez de al grupo de WhatsApp.

Esa foto de la factura es la que hace que, en dos o tres meses, la pantalla de
«a quién comprarle» te pueda decir **a qué precio**. Hoy no puede porque no hay
ninguna cargada.

---

## Lo que el sistema todavía no sabe

Para que no te sorprenda:

1. **A qué precio vende cada droguería.** Se arma con las facturas.
2. **Cuánto hay en cada sucursal.** SIFACO exporta el total de las cuatro juntas.
   Falta un archivo que se llama `tabla3e`.
3. **Si otra sucursal lo tiene parado.** Transferir es gratis y comprar cuesta
   plata, pero sin el stock por local no se puede comparar. El cálculo está
   escrito y se prende solo el día que llegue ese archivo.
4. **La mitad del catálogo no tiene costo cargado** (22.588 de 46.009). Esos
   productos quedan afuera de la cuenta y están en una lista aparte, con el
   motivo. No aparecen con cero: aparecen diciendo que no se sabe.
