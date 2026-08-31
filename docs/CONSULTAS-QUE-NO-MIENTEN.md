# Consultas que no mienten

Cómo pedirle filas a la base sin que el resultado salga cortado.

---

## El problema, en una línea

**PostgREST devuelve como máximo 1000 filas por respuesta, y no avisa.**

No hay error. No hay warning. La consulta parece haber salido bien y el
resultado está cortado. Un número más chico que el verdadero, plausible, sin
ninguna señal de que falte algo.

Ya mintió cuatro veces acá:

| dónde | qué dijo | qué era |
|---|---|---|
| Carga de proveedores (v0.83) | «4.836 productos no cruzan» | cruzaban 5.108 de 5.111 |
| Pantalla del maestro (v0.83) | «2 meses de ventas cargados» | 13, sobre 598.117 filas |
| Controlados (v0.83) | mostraba 1.000 | había 3.649 |
| Stock (v0.84) | «1000 de 1000 productos» | había 46.009 |

---

## Los tres patrones peligrosos

**1 · Sin `limit` ni `range`.** Techo silencioso de 1000.

```ts
const { data } = await sb.from('productos_catalogo').select('id, sku')
// 46.129 filas en la base → data tiene 1000
```

**2 · `limit(N)` con N mayor a 1000. No sube el techo.**

```ts
.limit(50000)   // devuelve 1000
.limit(100000)  // devuelve 1000
```

Este es el peor de los tres, porque *parece* que alguien pensó en el volumen.
Había un `limit(100000)` en el sistema que traía mil filas.

**3 · `limit(1000)` justo en el borde.** Un corte no se distingue de un
resultado completo: mil puede ser «hay mil» o «hay más y te di mil».

---

## Qué usar en cada caso

### CONTAR — sólo necesitás un número

Nunca traigas filas para contarlas. `datos.length` sobre una consulta sin
paginar es una mentira esperando a que la tabla crezca.

```ts
const { count } = await sb
  .from('productos_catalogo')
  .select('id', { count: 'exact', head: true })
  .eq('activo', true)
```

Si el número es una suma o un promedio, va a la base: una vista o una función.
Ver `catalogo_valor_de_stock()` y la vista `catalogo_rubros`.

### PAGINAR — necesitás todas las filas para procesar

Crons, importadores, cálculos. Nunca una pantalla.

```ts
import { paginar } from '@/lib/supabase/paginar'

const { filas, truncado } = await paginar(
  sb.from('ventas_diarias').select('sku, monto').gte('fecha', desde).order('sku')
)
```

**La consulta tiene que ir ordenada.** Sin `order`, PostgREST no garantiza el
mismo orden entre páginas y se pierden o se repiten filas — el mismo error
silencioso con otra cara. `paginar` lo exige.

Si lo que necesitás es el catálogo, ya está resuelto:

```ts
import { catalogoCompleto, indiceCatalogo } from '@/lib/catalogo/indice'

const productos = await catalogoCompleto(adm)          // paginado
const { porSku, porBarras } = await indiceCatalogo(adm) // indexado
```

### ACOTAR — es una pantalla que muestra una lista

No necesita todo: necesita los primeros N, con orden explícito, buscador, y
**el aviso de cuántos hay en total**.

```ts
const { count: total } = await sb.from('t').select('id', { count: 'exact', head: true })
const { filas, truncado } = await paginar(sb.from('t').select('*').order('nombre'), { maximo: 5000 })
```

Y en pantalla:

> «Trae los primeros 5.000 de 46.009 — usá el buscador.»

Eso no es un detalle de interfaz. Es la diferencia entre informar y mentir.

### REPENSAR — la pantalla está mal planteada

Si necesita 46.000 filas en el navegador, el problema no es el paginado: es que
eso no es una tabla, es una descarga. Se reporta, no se arregla a la fuerza.

---

## El auditor

`scripts/auditar-cortes.mjs` recorre el código y marca cada consulta sobre una
tabla que puede crecer. **Corre antes de cada build** (`npm run build`) y falla
si aparece una consulta nueva sin resolver.

```
npm run auditar:cortes
```

Distingue dos clases:

- **barrido** — trae toda una tabla grande. Es el que rompe.
- **acotado-por-lista** — `.in('id', lista)`. Sólo rompe si la lista pasa de mil.

Lo que ya se miró y se decidió dejar así va en `scripts/cortes-aceptados.json`
**con el motivo escrito**. Una excepción sin motivo es una excepción que nadie
va a poder revisar después.

## La contraprueba

`scripts/probar-paginado.ts` verifica el paginado contra tablas reales de más de
mil filas, y comprueba que el total coincide con el que dice la base.

**Una prueba que pasa con la tabla vacía no prueba nada:** `paginar` sobre cero
filas devuelve cero, y una consulta rota también.
