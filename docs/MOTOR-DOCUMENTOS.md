# Motor de Documentos — esquema (v0.53)

Migración: `supabase/migrations/0082_motor_documentos.sql`
Tipos: `lib/types/documentos.ts`
Estado: **solo esquema**. No hay parser, ni UI, ni llamadas a modelos, ni subida de archivos.

---

## Qué es

Un motor genérico que —más adelante— va a recibir la foto de un documento
comercial, identificar al tercero por su CUIT, extraer las líneas, matchearlas
contra el catálogo propio, presentarlas para revisión humana, alimentar un
histórico de precios de compra y conciliar orden ↔ remito ↔ factura.

Esta migración construye únicamente la base de datos que sostiene todo eso.

**Valor**: hoy no existe histórico de costos. Sin él, el comparador
multidroguería no tiene con qué comparar, no se detecta un aumento hasta que
llega la factura, y no se sabe si cobraron distinto de lo pactado.

---

## Vocabulario neutro

El motor se va a reutilizar en otros rubros (gastronomía, obra, servicios). Por
eso sus tablas no tienen vocabulario de farmacia adentro:

| Motor              | En Social Ahorro      |
| ------------------ | --------------------- |
| tercero            | `proveedores`         |
| item               | `productos_catalogo`  |
| unidad de negocio  | `sucursales`          |
| documento comercial| factura / remito / NC |

**Línea de corte** — el motor no sabe qué es un psicotrópico, una ventana de
devolución, un lote con vencimiento ni una receta. Todo eso se conecta *encima*,
vía las FK opcionales, en una sesión posterior.

---

## Tablas

| Tabla                   | Qué guarda |
| ----------------------- | ---------- |
| `doc_documentos`        | El documento comercial: cabecera, totales, estado, tercero leído |
| `doc_lineas`            | Cada renglón, con los dos precios (neto y con IVA) y su estado de match |
| `doc_extracciones`      | La salida cruda del modelo. Una fila por intento |
| `doc_terceros_alias`    | Cómo se escribe el mismo tercero en distintos papeles |
| `doc_items_alias`       | Cómo cada tercero nombra un item → item del catálogo propio |
| `doc_precios_historial` | El histórico de precios de compra como serie de eventos |
| `doc_conciliaciones`    | El cruce orden ↔ remito ↔ factura y sus diferencias |

Vista: `doc_v_ultimo_precio`.
Bucket: `documentos-comerciales` (privado).

---

## Reglas que el esquema hace cumplir

**El tercero se identifica por CUIT, nunca por nombre.** El nombre cambia y se
escribe distinto en cada papel; el CUIT no. Si no hay CUIT legible o no matchea,
se pregunta — no se crea un tercero duplicado. Por eso `doc_terceros_alias`
tiene único `(tenant_id, ident_fiscal, nombre_variante)`.

**Se guardan los dos precios.** `precio_neto` (sin IVA) y `precio_con_iva`. No se
puede reconstruir después —la alícuota puede faltar o venir mal leída— y todavía
no está definido cuál se usa para comparar. El esquema no toma esa decisión por
el negocio.

**El histórico es una serie de eventos, no un campo pisado.** No se guarda
"último precio" sobrescribiendo el anterior: cada compra entra como fila en
`doc_precios_historial`. "Último precio de compra" es una consulta
(`doc_v_ultimo_precio`), no una columna. Al revés se pierde la serie — y la serie
es todo lo que se quiere: variación, quién aumentó, cuándo y cuánto.

**La factura es la autoridad del precio.** El remito puede adelantarlo, pero si
la factura dice otra cosa manda la factura y la diferencia queda registrada en
`doc_conciliaciones`.

**SIFACO sigue siendo la autoridad del precio de VENTA.** Este motor registra
precios de COMPRA (costo) y nunca escribe precio de venta.

**La unidad de negocio compradora es explícita.** Tiene impacto fiscal.

---

## `doc_items_alias` es el activo

El OCR es la parte fácil. Saber que `MUZZ. LA SERENISIMA 1KG` es el SKU 4471 no
lo es, y cada tercero lo escribe distinto.

La primera vez se matchea a mano. A partir de la tercera factura del mismo
tercero, el motor reconoce casi todo solo. Esta tabla es lo que hace que mejore
con el uso, y es lo que no se puede comprar hecho.

Tiene tres caminos de búsqueda:

1. `codigo_tercero` — único por `(tenant, tercero, código)`. Match exacto.
2. `descripcion_norm` — índice btree para lookup directo.
3. `descripcion_norm` con índice **GIN trigram** (`pg_trgm`) — búsqueda por
   similitud cuando no hay código y la descripción viene distinta.

---

## Anti-duplicados

`doc_documentos_unico_confirmado_idx` impide que la misma factura entre dos veces:

```sql
unique (tenant_id, coalesce(tercero_ident_fiscal,''), tipo,
        coalesce(punto_venta,''), coalesce(numero,''))
where estado = 'confirmado'
```

Dos detalles deliberados:

- **`coalesce()`**: un UNIQUE común no bloquea duplicados cuando hay NULLs, y
  `punto_venta`/`numero` pueden venir vacíos de una lectura pobre. Sin el
  coalesce el índice no serviría justo en el caso que más importa.
- **Parcial (`where estado = 'confirmado'`)**: se puede tener varios borradores
  del mismo documento mientras se revisa. Sólo la confirmación es única.

---

## Multitenancy

Todas las tablas tienen `tenant_id` con default del tenant 1
(`00000000-0000-0000-0000-000000000001`). Hoy hay un solo cliente y no hace falta
multitenancy funcional — pero **hace falta la columna**: agregarla después sobre
tablas con RLS ya escrita es inviable.

`public.doc_tenant_actual()` es el único punto a cambiar para volverse
multitenant de verdad. Hoy devuelve una constante; cuando exista tabla de
tenants se resuelve ahí desde el JWT y **ninguna política necesita tocarse**.

Toda política filtra por `tenant_id` siempre, aunque hoy haya uno solo: ésta es
la política que en multitenant separa un cliente de otro.

---

## RLS

Las 7 tablas con RLS habilitada, 4 políticas cada una. Patrón tomado de
`ordenes_compra` / `precios_historico` (sub-app Compras), extendido con
`administrativo` y `tesoreria` porque Finanzas también carga facturas.

| Operación | Quién |
| --------- | ----- |
| SELECT | cualquier `users_admin` activo del tenant |
| INSERT / UPDATE | `super_admin`, `gerente`, `comprador`, `administrativo`, `tesoreria` |
| DELETE | sólo `super_admin` — se prefiere anulación lógica (`estado='anulado'`) |

UPDATE lleva `using` **y** `with check`: el tenant no se puede mover de fila.

El bucket `documentos-comerciales` es privado y tiene políticas equivalentes.
El borrado está restringido a `super_admin` porque **la imagen original es la
prueba ante el tercero**.

La vista se creó con `security_invoker = on`: respeta la RLS de quien consulta,
no la del dueño. Sin eso el linter la marcaría como `security_definer_view`
(nivel ERROR).

---

## Solapamiento con tablas existentes — pendiente de decisión

El sistema **ya tiene** tablas que cubren parte de este territorio, hoy todas
vacías (0 filas):

- `precios_historico` — item + proveedor + precio + fecha, sin distinguir neto
  de con IVA, sin origen ni documento de respaldo.
- `matcheos_aprendidos_compras` — `texto_origen → producto_id`, sin tercero.
- `facturas_proveedor` / `factura_items` — carga manual de facturas.

**No se tocaron** (fuera de alcance). Quedan como decisión abierta: migrar sus
datos al motor y deprecarlas, o dejarlas para la carga manual y que el motor
sirva sólo el flujo por foto. Conviene resolverlo antes de que alguna acumule
datos reales, porque después la migración cuesta.

---

## Verificación hecha

- Las 7 tablas existen, RLS habilitada, 4 políticas cada una.
- Índice único anti-duplicados: rechaza el segundo confirmado, permite borradores repetidos.
- `pg_trgm` instalada, índice GIN `doc_items_alias_norm_trgm_idx` creado.
- `doc_v_ultimo_precio` devuelve el evento más reciente por item con su variación
  (probado: 900 → 1000 = +11,11%).
- Bucket `documentos-comerciales` creado y privado.
- Datos de prueba borrados; las 7 tablas quedaron en 0 filas.
- Linter de seguridad: **0 advisors ERROR, 0 advisors nuevos** respecto del baseline.

---

## Qué necesita la próxima sesión (motor de lectura)

1. Decidir el modelo de extracción y versionar el prompt en
   `doc_extracciones.prompt_version` desde el primer día.
2. Definir la normalización de `descripcion_norm` (mayúsculas, sin acentos, sin
   puntuación, unidades unificadas) **una sola vez** y usarla tanto al escribir
   el alias como al buscar — si difieren, el índice trigram no sirve.
3. Definir el umbral de `match_confianza` a partir del cual se auto-matchea sin
   revisión humana.
4. Resolver el solapamiento con `precios_historico` y `matcheos_aprendidos_compras`.
5. Pantalla de revisión humana: nada se confirma sin que una persona lo mire.
