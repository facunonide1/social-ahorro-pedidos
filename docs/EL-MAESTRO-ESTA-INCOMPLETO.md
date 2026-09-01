# El maestro está incompleto (y no es por el grupo)

Medido el 2026-09-01 sobre `data/sifaco/pla_3d_24.csv` (46.035 filas, 46.022
códigos únicos) y los otros tres exports de SIFACO que hay en `data/sifaco/`.

## Lo que se comprobó

**1. El cruce por SKU está bien.** Woo manda el signo. Los 137 que no cruzan
tienen SKU `-302932`, `-304416`, `-305344`… con el `-` puesto. El catálogo los
guarda igual (`codigoSifaco` → `numeroSifaco` → `String(n)`, que conserva el
signo) y hay 5.675 códigos negativos importados sin problema. La comparación es
texto contra texto y no falla.

**2. Sacar el signo empeoraría las cosas.** De los 137, uno solo cruzaría al
quitarlo — y cruzaría mal: Woo `-301874` es *Algabo Barro Vegetal* y el maestro
tiene `301874` = *REVLON SUPER LUSTROUS HEATWAVE*. Son dos productos distintos.
El signo es parte del código, no un adorno.

**3. El cruce por código de barras no puede correr.** Las 7.737 publicaciones de
Woo tienen `barras = null`. No es que el `update` esté mal: Woo no manda el dato.
Las únicas claves de `meta_data` que devuelve la API son `_last_change_time`,
`cepi_sifaco_impuesto`, `woodmart_history_of_visits`, `_elementor_page_assets` y
`_cepi_sifaco_regla_especial`. No hay campo de barras en la tienda.

**4. El export NO salió filtrado por grupo.** `nom_grupo` tiene un solo valor
porque `num_grupo` vale `0` en las 46.035 filas. Y `tabla3e.csv` —un export
distinto, de otro corte del catálogo— también trae `GRUPO = 0 / NOM_GRU =
'Farmacia Normal'` en sus 296 filas. En esta instalación de SIFACO el campo grupo
no se usa: todo es grupo 0. Un solo valor acá no es señal de filtro.
`nom_depto` sí varía (6 valores), y eso confirma que el export no está cortado
por departamento.

**5. Pero el maestro igual está incompleto.** Probado con códigos que aparecen en
otros exports de SIFACO y no están en el maestro:

| Export | Filas | Códigos ausentes del maestro |
|---|---:|---:|
| `ofertas_24-8.csv` | 16.383 | 26 |
| `compra_venta.csv` | 5.111 | 2 |
| `tabla3e.csv` | 296 | 2 |
| Woo (SKU publicados) | 7.736 | 136 |

Dos de los códigos de Woo aparecen además en otro export de SIFACO —`266005`
FLUOROGEL ORIGINAL MENTA y `9960689` TAFIROL PLUS—, así que no hay duda de que
son códigos reales que el maestro no trajo.

## La huella del corte

En el bloque de barbijos falta un tramo **contiguo**: `-302931` a `-302950`, veinte
códigos seguidos. Los códigos de SIFACO se asignan por orden alfabético dentro
del rubro: el maestro tiene `-302930 A BARBIJO ION POSITIVO NEGRO` y `-302951 A
BARBIJO NANODAK`. Entre «ION» y «NANODAK» va «KN95» — que es exactamente lo que
Woo publica con los códigos `-302932`, `-302934`, `-302937`, `-302942`, `-302948`.
El hueco cae justo donde alfabéticamente tienen que estar.

Perfil de los ausentes, medido sobre `ofertas_24-8.csv`, que es el único archivo
donde se pueden comparar las dos poblaciones:

| | Presentes en el maestro | Ausentes |
|---|---:|---:|
| filas | 16.357 | 26 |
| sin última venta | 60,5 % | 96,2 % |
| sin última compra | 59,2 % | 92,3 % |
| stock 0 | 73,5 % | 100 % |

Los que faltan están volcados a «sin stock y sin movimiento nunca». Pero el corte
**no es** «sin movimiento»: el maestro tiene 34.764 filas sin una sola venta en 13
meses y con stock 0, y las trajo igual. Hay algo más fino.

Una pista: `tabla3e.csv` tiene una columna `STATUS`, y de sus dos códigos
ausentes uno es `STATUS = 'B'` (baja). El maestro no trae la columna `STATUS`, así
que desde acá no se puede confirmar que el corte sea ese.

## Lo que no se puede saber desde acá

**Cuántos productos faltan en total.** Las tasas medidas van de 0,04 % a 1,76 %
según el archivo, y los tres exports de SIFACO pueden compartir el mismo corte
—entonces lo que miden es un piso, no el número—. Lo único firme es el piso:
**164 códigos** que existen y el maestro no tiene.

Para saberlo hace falta una cosa sola: **el conteo total de productos que declara
SIFACO**. Si dice 46.035, el archivo está completo y el problema es otro. Si dice
más, la diferencia es el agujero.
