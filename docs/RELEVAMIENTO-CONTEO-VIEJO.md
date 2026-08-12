# El motor de conteo viejo — relevamiento antes de tocarlo

Fecha: 12-ago-2026 · v0.77 · **relevamiento, sin cambios**

Se relevó `inventarios_fisicos` + `inventario_items` antes de deprecarlas. Lo
que sigue es lo que se encontró, no lo que se supuso.

---

## 1 · Cuántas filas hay HOY

| Tabla | Filas | Detalle |
|---|---|---|
| `inventarios_fisicos` | **1** | del 10-jun-2026, estado `en_curso` |
| `inventario_items` | **0** | |

Igual que lo reportado en v0.76, así que la deprecación sigue siendo gratis.

Y la única fila dice algo por sí sola: **es un inventario abierto hace dos meses
que nadie terminó**. No es que el motor viejo se use poco — es que se intentó
usar una vez y quedó a mitad de camino.

---

## 2 · Las referencias vivas

### Pantallas (3 archivos, 492 líneas)

| Archivo | Qué es |
|---|---|
| `app/(admin)/admin/operaciones/inventarios/page.tsx` | La lista de inventarios |
| `app/(admin)/admin/operaciones/inventarios/iniciar.tsx` | El botón de arranque |
| `app/(admin)/admin/operaciones/inventarios/[id]/page.tsx` | La ficha de uno |
| `app/(admin)/admin/operaciones/inventarios/[id]/conteo.tsx` | **La tabla de conteo** |

### API (1 ruta)

| Archivo | Qué hace |
|---|---|
| `app/api/inventario/cerrar-inventario/route.ts` | Cierra el inventario **y ajusta stock** |

### Tipos

`lib/types/admin.ts:698` (`InventarioFisico`) y `:711` (`InventarioItem`).

### Navegación — TRES entradas, una de ellas destacada

| Archivo | Qué |
|---|---|
| `lib/os/subapps.ts:161` | Item de menú «Inventarios» dentro de Operaciones |
| `lib/os/subapps.ts:188` | Acción rápida **«Iniciar inventario»**, con `primary: true` |
| `app/(admin)/admin/operaciones/page.tsx:54` | Tarjeta «Inventarios» en el hub |

### Lo que NO las referencia

- **Ningún cron.** No figuran en `vercel.json` ni en ninguna ruta de `/api/cron`.
- **Ninguna herramienta del asistente.** `lib/nora/herramientas/` y
  `lib/ai/tools.ts` no las mencionan.
- **Ninguna FK entrante.** Nada cuelga de ellas.

---

## 3 · Los dos problemas, y el segundo es peor

### No es ciego

`conteo.tsx` renderiza una tabla con las columnas **Producto · Sistema ·
Contado · Diferencia**. El número del sistema está en la fila de al lado
mientras la persona escribe el suyo, y la diferencia se actualiza sola.

Eso no es un conteo: es una confirmación. Si el sistema dice 40, se escribe 40.

### Ajusta stock, y eso rompe la regla de oro 1

El botón dice **«Cerrar y ajustar stock»**, y hace exactamente eso:
`cerrar-inventario/route.ts` inserta en `movimientos_stock` con `tipo: 'conteo'`
y `motivo: 'Ajuste por inventario físico'`, cuyo trigger actualiza
`stock_items`.

> **Regla de oro 1:** SIFACO es la autoridad de stock. NORA mide, comunica y
> controla. **NORA NUNCA AJUSTA STOCK.**

O sea que el camino viejo es: una persona cuenta con el número del sistema a la
vista, y después aprieta un botón que escribe stock en NORA por detrás de
SIFACO. Las dos cosas que el motor nuevo existe para no hacer.

---

## 4 · La fábrica las declara — y no se toca desde acá

`lib/fabrica/manifiestos/stock.ts:39-40`:

```ts
{ tabla: 'inventarios_fisicos', rol: 'El conteo real contra lo que el sistema dice', acceso: 'propia', alcance: 'por_sucursal' },
{ tabla: 'inventario_items', rol: 'Item por item, cuánto había de verdad', acceso: 'propia' },
```

Las declara **propias**, o sea que el pool Stock se hace cargo de ellas.

**Qué pasa al renombrarlas:** el comparador de la fábrica va a marcar dos tablas
declaradas que no existen. Eso es correcto — el manifiesto queda mintiendo desde
el momento del rename, y que se note es justamente para lo que sirve el
comparador.

**Qué hay que hacer, y NO es en esta sesión:** en una sesión de fábrica, sacar
las dos entradas del manifiesto de Stock y publicar la versión. Escribir una
versión nueva es escribir en `fab_pool_versiones`, y desde acá la fábrica se
lee, no se escribe.

Las cinco tablas `cnt_*` tampoco están declaradas todavía. Es el mismo trabajo y
la misma sesión.

---

## 5 · ¿El motor nuevo cubre el caso «por sospecha»?

«Inventario por sospecha» es contar una zona a pedido, sin frecuencia. El motor
nuevo lo hace y no hay que construir nada: una lista sin `frecuencia` y con
`programacion_activa` en `false` se cuenta apretando **Contar** cuando alguien
quiera. La programación es opcional y arranca apagada.

Lo único que el motor nuevo pide y el viejo no pedía es **la lista**: el viejo
armaba el inventario desde el catálogo entero de la sucursal. Es una diferencia
a favor —contar 120 productos de memoria no lo hace nadie— pero significa que
antes de la primera sospecha tiene que existir una lista de esa zona.
