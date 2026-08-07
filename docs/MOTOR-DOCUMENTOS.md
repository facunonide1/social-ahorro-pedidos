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

## Solapamiento con tablas existentes — RESUELTO (v0.54)

Tres estructuras preexistentes cubrían territorio del motor con formas más
pobres. Estaban todas vacías, así que sacarlas salió gratis. Migración `0083`:

| Tabla | Estado | Por qué |
| ----- | ------ | ------- |
| `precios_historico` | → `zz_deprecated_precios_historico` | No distinguía neto de con IVA ni registraba el documento de origen |
| `matcheos_aprendidos_compras` | → `zz_deprecated_matcheos_aprendidos_compras` | Alias sin tercero: cada droguería escribe distinto, así que aprendía mal |
| `factura_items` | → `zz_deprecated_factura_items` | 0 filas, 0 referencias en código |
| `facturas_proveedor` | **intacta** | 35+ referencias vivas en Finanzas, BI, NORA y crons |

Se renombraron en vez de borrarse: el `DROP` queda escrito y comentado en la
migración para el **2026-11-05** (90 días). Un rename se deshace en un minuto;
un DROP no.

`facturas_proveedor` no se toca ni se reapunta: es el registro de cuentas por
pagar de Finanzas, no la captura por foto. Son cosas distintas y conviven.

Código reapuntado en el mismo commit, sin cambio visible para el usuario:
el importador de listas de precios escribe en `doc_precios_historial` y lee sus
alias de `doc_items_alias` acotados al proveedor; el comparador lee el histórico
del motor.

---

## Normalización — una sola implementación (v0.54)

`doc_items_alias.descripcion_norm` existe para buscar por similitud con el
índice trigram. Si la normalización viviera en dos lugares y difirieran en un
detalle —un acento, un guión, un espacio— el índice dejaría de matchear y **el
fallo sería silencioso**: no hay error, simplemente no encuentra nada.

Por eso hay una sola implementación y vive en Postgres (migración `0084`):

| Función | Qué hace |
| ------- | -------- |
| `doc_normalizar_texto(text)` | `IMMUTABLE`. Minúsculas → `unaccent` → no-alfanumérico a espacio → colapsar espacios → trim |
| `doc_items_alias_normalizar()` | Trigger que llena `descripcion_norm` **siempre**, pisando lo que mande el cliente |
| `doc_buscar_alias(...)` | Búsqueda por similitud: pasa el término por la **misma** función |
| `doc_normalizar_lote(text[])` | N textos en un round-trip — para que no exista la excusa de performance para reimplementarla |

`lib/documentos/normalizar.ts` son wrappers de RPC y nada más.

**Verificado:**

| Entrada | Normalizado |
| ------- | ----------- |
| `MUZZ. LA SERENÍSIMA 1KG` | `muzz la serenisima 1kg` |
| `Muzz La Serenísima, 1Kg.` | `muzz la serenisima 1kg` |
| `MUZZARELLA  LA SERENISIMA   1KG` | `muzzarella la serenisima 1kg` |
| `muzzarella la serenisima 1 kg` | `muzzarella la serenisima 1 kg` |

Buscar `"muzzarella la serenisima 1 kg"` encuentra `MUZZ. LA SERENÍSIMA 1KG`
con 0.625 de similitud — que es exactamente el caso real de dos droguerías
escribiendo el mismo producto distinto.

---

## Versionado del prompt (v0.54)

`lib/documentos/prompt-extraccion.ts` es la fuente única: versión semántica
(arranca en `1.0.0`), historial de cambios, el texto del prompt y el tipo de su
salida. Todavía **no** se llama a ningún modelo.

**La regla:** todo cambio en el texto sube la versión. Si se edita sin subirla,
dos documentos quedan marcados como leídos igual habiéndose leído distinto, y el
reproceso deja de ser confiable — sin forma de detectarlo después.

`reprocesarExtraccion(extraccionId, nuevaPromptVersion)` queda con firma y
contrato documentados, sin implementar: inserta fila nueva en `doc_extracciones`
(nunca pisa la anterior) y no toca `doc_documentos`, porque aplicar el resultado
es decisión humana.

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
