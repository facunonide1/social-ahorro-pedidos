# Unificar el CRM viejo con el sector Pedidos

Escrito el 14 de octubre de 2026. **No se ejecutó nada de esto**: es el plan.

---

## Qué está duplicado

Hay **dos puertas a la misma tabla `orders`**, construidas en momentos
distintos, con dos padrones de usuarios.

| | CRM viejo | Sector Pedidos (v0.91) |
|---|---|---|
| Rutas | `/pedidos`, `/pedidos/[id]`, `/pedidos/nuevo`, `/clientes`, `/repartidor` | `/admin/pedidos/*` |
| Padrón de usuarios | `users_pedidos` · **8 filas** | `users_admin` · **4 filas** |
| Rol | `admin`, `operador`, `repartidor` | los 13 de `admin_role` |
| Clientes | `customers` · 9 filas | `clientes` · 150 (todas demo) |
| Tabla de pedidos | `orders` | **la misma `orders`** |
| Alta de pedido | `create_manual_order()` RPC | `/api/pedidos/crear` |
| Pedidos reales | **los 21 viven acá** | 0 propios |

El riesgo de unificar no es técnico: es que **los 21 pedidos reales y los 8
usuarios que saben usar esa pantalla están del lado viejo**.

---

## Qué se migra, qué se borra, en qué orden

### Paso 1 · Los usuarios (sin tocar código)
Las 8 filas de `users_pedidos` pasan a `users_admin` con el rol equivalente:

| `users_pedidos.role` | `users_admin.rol` |
|---|---|
| `admin` | `gerente` |
| `operador` | `cajero` |
| `repartidor` | `repartidor` |

**Lo que hay que verificar primero**: si el mismo `auth.users.id` ya está en
`users_admin`, el rol del hub manda y no se pisa.

Es reversible: `users_pedidos` no se borra en este paso.

### Paso 2 · Los clientes
`customers` (9 filas) → `clientes`, con el dedup por DNI / teléfono / mail que
ya existe en `lib/pedidos/cliente.ts`. Y `orders.customer_id` queda apuntando a
`clientes` vía `cliente_id`, que ya es una columna de v0.91.

**Las 150 filas de `clientes` son de demostración**: conviene borrarlas antes,
o el dedup va a cruzar contra clientes inventados.

### Paso 3 · Las políticas de RLS
`orders`, `order_status_history`, `order_incidents`, `whatsapp_messages` y
`zonas_reparto` tienen hoy políticas para los dos padrones. Cuando nadie use
`users_pedidos`, se van las de `current_pedidos_role()`.

**Este es el paso que no se puede apurar**: si se saca antes de migrar los
usuarios, los 8 pierden el acceso de golpe.

### Paso 4 · Las pantallas
Las de `/pedidos` redirigen a `/admin/pedidos/tablero`, como ya se hizo con
`/admin/operaciones/inventarios`: un link que muere sin explicación es peor que
uno que redirige. Alguien las tiene en el historial del navegador.

`/repartidor` **no se toca todavía**: es la pantalla del celular del repartidor
y no tiene equivalente en el sector nuevo. Construirlo es otra sesión.

### Paso 5 · Lo que se borra, al final
`users_pedidos`, `customers`, `current_pedidos_role()` y las políticas que la
usan. Después de que el paso 1 esté verificado y nadie entre por la puerta
vieja durante al menos una semana.

---

## Lo que NO conviene hacer

**Unificar `zonas_reparto` con `zonas`.** Son dos cosas distintas con nombres
parecidos: `zonas` son las zonas de góndola de un local (8 filas, todas de
demostración) y `zonas_reparto` son las de reparto a domicilio (0 filas). El
nombre engaña; el contenido no.

**Migrar `orders` a una tabla nueva.** No hace falta: ya es la misma tabla. Lo
único duplicado es la puerta.

---

## Por qué no se hizo en v0.95

Porque el objetivo de esa sesión era que alguien pudiera entrar el lunes sin ver
algo falso, y esto no bloquea eso. El CRM viejo funciona: los 21 pedidos están
ahí y la pantalla anda.

Lo que sí se arregló fue el **sector nuevo**, que no podía crear un pedido —le
faltaba asignar `manual_order_number`—. Con eso, las dos puertas funcionan, y la
unificación pasa a ser una limpieza en vez de un arreglo.
