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

---

## Motor de lectura (v0.55)

El motor pasó de esquema a funcionar. El recorrido completo:

```
foto/PDF ─▶ subida (hash, anti-duplicado) ─▶ modelo de visión ─▶
identificación por CUIT ─▶ matching de renglones ─▶ REVISIÓN HUMANA ─▶
confirmación transaccional ─▶ cuenta por pagar + histórico de precios
```

### Puertas de entrada

Las tres llaman al mismo servicio (`lib/documentos/subida.ts`):

| Puerta | Estado |
| ------ | ------ |
| Finanzas → "Nuevo documento" → *Sacarle una foto* | funcionando |
| Asistente → clip de adjuntar | funcionando |
| Compras → recepción de remito | preparada, no construida |

### Anti-duplicado

El SHA-256 se calcula **antes** de subir. Si ese archivo ya se cargó, no se
vuelve a guardar ni a leer: se abre el documento que salió de esa foto. Ahorra
plata de modelo y evita que la misma factura entre dos veces.

### Extracción

Modelo configurable (`DOC_MODELO`, default `claude-opus-5`). No es el más chico
a propósito: el papel real es térmico, matriz de punto y fotos torcidas.

**Regla crítica:** si un campo no se lee con certeza, el modelo devuelve `null` y
baja la confianza. Nunca estima. Un número inventado en un precio no se nota y
queda para siempre torciendo las comparaciones.

La respuesta cruda se guarda entera, salga bien o mal — es lo que permite
reprocesar cuando el prompt mejore sin volver a pedir las fotos.

### Matching — cinco niveles

| # | Criterio | Resultado |
| - | -------- | --------- |
| 1 | código exacto del proveedor | automático (1.0) |
| 2 | descripción normalizada exacta | automático si el alias tiene 3+ usos |
| 3 | similitud trigram sobre alias del proveedor | automático solo si ≥0.90 **y** 3+ usos |
| 4 | similitud contra el catálogo | siempre sugerido |
| 5 | sin candidatos | sin match |

La normalización **siempre** sale de `doc_normalizar_texto` por RPC.

**Umbral conservador a propósito** (`DOC_UMBRAL_AUTO` 0.90, `DOC_USOS_MIN_AUTO` 3):
un alias mal aprendido no se equivoca una vez, se propaga a todas las facturas
siguientes de ese proveedor.

### Confirmación

En una sola transacción (`doc_confirmar_documento`, migración 0086): documento +
líneas + eventos de precio + cuenta por pagar. Los alias aprendidos se escriben
aparte: si fallaran, el motor aprende un poco menos pero la deuda queda bien.

No se puede confirmar con renglones pendientes: cada uno tiene que estar
matcheado o explícitamente ignorado.

### Relación con cuentas por pagar

`doc_documentos` es **la captura**; `facturas_proveedor` es **la deuda**. La
captura genera la factura, nunca al revés. Si ya existía una cargada a mano con
el mismo proveedor, punto de venta y número, se vincula sin duplicar.

### Costo real medido

Con una factura de 4 renglones: 25,8 s, 2.607 tokens de entrada y 1.569 de
salida ≈ **US$0,05 por documento** (~US$52 cada mil facturas).

---

## Costos y comparador (v0.56)

### Carga en lote

Sin esto el histórico no arranca: la serie necesita facturas viejas y de a una
nadie las carga.

Se arrastran varios archivos, se procesan de a `DOC_CONCURRENCIA_LOTE` (2) y la
cola muestra el estado de cada uno. Un archivo que falla no frena a los demás.
Al confirmar, salta sola a la siguiente pendiente del lote, con el progreso a la
vista.

**La fecha del evento de precio es la de EMISIÓN, no la de carga** — verificado
cargando desordenado (agosto → junio → julio) y comprobando que la serie queda
ordenada por emisión.

### Los dos comparadores

| Pantalla | Qué compara | Para qué |
| --- | --- | --- |
| `/admin/compras/comparador` | listas de precios vigentes | decidir a quién comprarle; arma órdenes con smart split |
| `/admin/compras/costos` | facturas cargadas | saber qué pagaste de verdad y si coincide con lo pactado |

Se extendió el módulo en vez de reemplazarlo: tirar el de listas habría matado
el smart split y el alta de órdenes, que funcionan y no tienen reemplazo. Los
dos quedan enlazados entre sí.

### Todo por precio NETO

El IVA es crédito fiscal, no costo. Además, en facturas de IVA mixto el precio
con IVA por renglón es aproximado (alícuota efectiva promedio), así que
compararlo sería comparar estimaciones.

### Dato fresco

Un precio de más de `DOC_DIAS_DATO_FRESCO` (60) días se marca con su antigüedad
y **no se usa para elegir el "mejor"**: no es una alternativa real, es un
recuerdo. Si un proveedor nunca vendió un SKU, la celda va vacía — cero sería
mentira.

### Ahorro potencial

`(último pagado − mejor disponible fresco) × unidades compradas en 90 días`,
ordenado de mayor a menor. Es la lista de dónde se está dejando plata. No
contempla plazos de pago ni mínimos de compra, y se dice en pantalla.

### Alertas

Corren al confirmar y usan el feed que ya existe (`nora_avisos`, tipos propios
desde 0089).

La de aumento tiene **dos** condiciones, no una: la suba supera el mínimo (15%)
**y** se despega al menos 8 puntos del promedio de lo que ese proveedor movió en
el período. Con inflación, un umbral fijo solo se dispara en todo y se aprende a
ignorar; lo que importa es lo que sube *más que el resto*.

Todas hablan con hechos y montos, nunca con adjetivos.

### Umbrales

Todos en `lib/documentos/config.ts`, por variable de entorno:

| Variable | Default | Qué controla |
| --- | --- | --- |
| `DOC_CONCURRENCIA_LOTE` | 2 | documentos leídos a la vez |
| `DOC_MAX_ARCHIVOS_LOTE` | 40 | tope por tanda |
| `DOC_DIAS_DATO_FRESCO` | 60 | cuándo un costo deja de ser comparable |
| `DOC_DIAS_VOLUMEN` | 90 | ventana para medir cuánto se compró |
| `DOC_ALERTA_SUBA_PCT` | 15 | suba mínima para mirar |
| `DOC_ALERTA_EXCESO_PCT` | 8 | cuánto tiene que despegarse del promedio |
| `DOC_ALERTA_MONTO_MINIMO` | 10000 | plata mínima para molestar a alguien |

### Límite con SIFACO

El módulo informa costos y nada más. No sugiere ni escribe precio de venta. En
la ficha de producto se muestra el margen que resulta del costo real **solo si
el precio ya está cargado**, y aclarando que el precio se define en SIFACO.

---

## Conciliación de tres puntas (v0.57)

Tres documentos describen la misma compra y casi nunca coinciden:

```
ORDEN   → lo que se pidió y a qué precio se pactó
REMITO  → lo que efectivamente entregaron
FACTURA → lo que pretenden cobrar
```

### El modelo: muchos a muchos

`doc_conciliaciones` nació con `orden_id`, `remito_id` y `factura_id` — una
columna por documento, o sea uno a uno. La realidad no es esa: una orden se
entrega en varios remitos, una factura cubre varios remitos, y hay factura sin
remito. Como la tabla estaba vacía, se corrigió (migración 0090):

| Antes | Ahora |
| --- | --- |
| `orden_id` | tabla `doc_conciliacion_ordenes` |
| `remito_id`, `factura_id` | tabla `doc_conciliacion_documentos` (con `rol`) |

### Vinculación

Sugiere órdenes candidatas con su **porcentaje de coincidencia** (SKU
compartidos, penalizado por distancia de fecha), pero **nunca vincula sola**.
Se puede elegir más de una orden, y *"fue una compra directa"* siempre está
disponible — en perfumería y supermercado se le compra al viajante sin orden.

### Unidades

`doc_factores_unidad` guarda cuántas unidades trae una caja **de este producto
en este proveedor**. Se carga a mano. Si falta el factor y la unidad del papel
es desconocida, la línea se marca **no comparable** en vez de asumir: comparar
cajas contra unidades hace que todo dé diferencia y el módulo se vuelva ruido.

### Las tres diferencias

| Diferencia | Cálculo | Valorizada a |
| --- | --- | --- |
| cantidad faltante | pedido − recibido | precio pactado |
| facturado de más | facturado − recibido | precio facturado |
| precio distinto | neto facturado − neto pactado en la **orden** | × unidades facturadas |

La comparación contra *lista vigente* ya existía (v0.56); ésta es contra la
**orden**, que es lo pactado para esa compra puntual.

### Acciones — reusan el módulo de reclamos existente

| Diferencia | Acción |
| --- | --- |
| faltante | reclamo en `devoluciones_proveedor` con su detalle |
| facturado de más | reclamo `enviada` + recordatorio cada 7 días hasta la NC |
| precio distinto | **decisión humana** con motivo obligatorio: reclamar o aceptar |
| cualquiera | cierre manual con motivo obligatorio |

Aceptar un aumento sin dejar escrito por qué es cómo se pierde el rastro del
costo: seis meses después nadie recuerda si fue negociado o se dejó pasar.

### Umbrales

| Variable | Default | Qué controla |
| --- | --- | --- |
| `DOC_CONC_VENTANA_DIAS` | 60 | cuántos días atrás se buscan órdenes |
| `DOC_CONC_TOL_CANTIDAD` | 0 | las unidades son enteras |
| `DOC_CONC_TOL_PRECIO_PCT` | 1 | redondeos, no diferencias |
| `DOC_CONC_TOL_PRECIO_ARS` | 5 | se aplica la mayor de las dos |
| `DOC_CONC_MONTO_MINIMO` | 2000 | debajo de esto cierra sola |
| `DOC_CONC_DIAS_TAREA` | 7 | días antes de la tarea de control |

Perseguir $80 cuesta más que los $80, y una bandeja llena de casos de $80 hace
que no se miren los de $80.000.
