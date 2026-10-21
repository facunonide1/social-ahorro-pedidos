# El maestro de agosto era Guzmán

Lo encontró la comparación entre las dos importaciones, que es lo primero que se
pudo hacer cuando hubo dos. Se buscaba explicar una diferencia de plata y
apareció otra cosa.

## La pregunta

El archivo del 14 de octubre da **$457.666.703** al costo. El de agosto daba
**$266.374.988**. Un 72% más en seis semanas.

Hay tres explicaciones posibles y son muy distintas entre sí: más productos,
costos que subieron, o que el archivo de agosto viniera incompleto. Elegir una
sin medir sería inventar.

## La descomposición

Producto por producto, de los $191,3 M de diferencia:

| | |
|---|---:|
| Productos nuevos (2.195) | $3,9 M |
| Productos que ya no vienen (101) | −$0,5 M |
| **Cambio de cantidad de stock** (a costos de agosto) | **$178,9 M** |
| Cambio de costos (sobre el stock nuevo) | $9,1 M |

El 93% es **cantidad**, no precio. Los costos subieron 9,8% promedio en los
4.866 productos que cambiaron, lo cual es razonable para seis semanas y explica
$9 M, no $179 M.

Una farmacia no multiplica su stock por 1,7 en seis semanas. Así que la cantidad
no cambió: cambió lo que estábamos midiendo.

## Las tres pruebas

**Uno.** Los productos que en octubre tienen stock **sólo fuera de Guzmán**:

- 2.041 productos, 9.740 unidades
- **79% tenía cero en agosto**

**Dos.** Los que tienen stock **sólo en Guzmán**:

- 2.815 productos, 70.261 unidades
- sólo el **13%** tenía cero en agosto
- 69.662 unidades en agosto contra 70.261 en octubre: **99,1%**

**Tres.** Los 5.080 productos con stock en más de un local, donde Guzmán y el
total difieren y por lo tanto la pregunta se puede contestar:

| agosto coincide con… | productos |
|---|---:|
| Guzmán | 2.254 |
| el total de las cuatro | 295 |
| algo en el medio | 1.092 |
| más que el total | 390 |

Y en unidades: agosto 61.000, Guzmán 55.945, total 106.125.

## Qué significa

El maestro `pla_3d_24` traía el stock de **una sucursal**. No venía incompleto:
venía de un local. La columna se llamaba `stock` y se leyó como el stock de la
cadena, que es exactamente el error que no se nota — un número plausible en el
lugar donde va un número.

Todo lo que se calculó entre v0.88 y v0.95 comparaba el stock de Guzmán contra
las ventas de las cuatro sucursales:

- los **$266 M** de stock eran Guzmán
- la cobertura de **1,29 meses** era Guzmán ÷ consumo de la cadena
- los **3.392 ítems urgentes por $100,8 M** estaban calculados sobre menos stock
  del que la cadena tiene, así que **exageraban la urgencia de comprar**

La frase que el plan de compra viene mostrando —«el problema no es que falte
mercadería: está mal repartida»— resulta ser más cierta de lo que se podía
probar. Guzmán tiene el 68% de las unidades y el 57% del valor.

## Qué NO significa

No significa que los cálculos estuvieran mal escritos. Estaban bien: cobertura
es stock sobre consumo, y así se calculaba. Lo que estaba mal era el nombre de
una columna, y eso no lo arregla una fórmula.

Tampoco significa que el archivo de agosto fuera inútil: los precios, los
costos, los códigos de barras, los laboratorios y los doce meses de ventas de
ese archivo eran de la cadena y siguen siendo buenos. Era el **stock** el que
era de un local.

## Lo que queda abierto

Nadie pidió «el stock de Guzmán»: se pidió una exportación del maestro y vino
así. Vale la pena saber por qué, porque el próximo export puede volver a venir
filtrado sin avisar — igual que `NOM_GRU` con un solo valor, que sigue siendo un
aviso en cada importación.

La verificación del importador ahora compara el valor total contra la
importación anterior y avisa cuando salta más de 15%. En este archivo avisó:
+71,8%. No lo bloqueó, porque un salto puede ser un hallazgo y no un defecto —
y en este caso fue un hallazgo.
