# El manifiesto — formato 1.0.0

Un **pool** es una pieza de software declarada como dato. El manifiesto es esa
declaración: lo que la fábrica sabe de una pieza sin abrir su código.

**Esquema de referencia:** `lib/fabrica/tipos.ts`
**Validador:** `lib/fabrica/validador.ts`
**Correrlo:** `npx tsx scripts/fabrica-verificar.ts`

El esquema es TypeScript y no JSON Schema por una razón concreta: el tipo
**se ejecuta** — falla el build si un manifiesto no encaja — y el validador
agrega las reglas que un esquema estructural no puede expresar (un núcleo no
puede ser desinstalable, dos pools no pueden ser dueños de la misma tabla, un
agente no puede pedir más permisos que su pool). Un JSON Schema al lado sería
una segunda fuente de verdad que nadie ejecuta, y que empieza a mentir en el
primer cambio.

---

## Cómo llegó a esta forma

El formato no se diseñó: se descubrió declarando cuatro sectores distintos.
Cada uno rompió algo.

| Pool | Qué obligó a agregar |
| --- | --- |
| **Ofertas** (v0.58) | `navegable`, `pertenencia` |
| **Tareas** | `categoria`, `desinstalable`, `usado_por`, `escriben_otros`, `referencia_abierta`, `dueno`, permisos con acciones |
| **Clientes** | `campos_sensibles` + su verificación contra el esquema |
| **Stock** | `alcance` global/por punto, `excluir` en el comparador |
| **Los cuatro** | `agentes`, `participacion`, `reversible` |

---

## El manifiesto

### Identidad

| Campo | Tipo | Qué es |
| --- | --- | --- |
| `formato` | `"1.0.0"` | Versión del **formato**, no del pool |
| `pool` | slug | Clave única en el catálogo |
| `nombre` | texto | Cómo se llama para una persona |
| `descripcion` | texto | Qué hace, en dos líneas |
| `categoria` | `nucleo` · `generico` · `vertical` | |
| `desinstalable` | booleano | `false` en núcleo. **El validador lo exige**: un núcleo desinstalable no es un núcleo, y un vertical que no se puede sacar ata el proyecto a un rubro para siempre |
| `alcance` | `global` · `por_sucursal` · `mixto` | |

### Entidades

Una tabla y qué papel juega.

| Campo | Qué es |
| --- | --- |
| `tabla`, `rol` | El nombre y para qué sirve, en una línea |
| `acceso` | `propia` = este pool es el **dueño**. `leida` = la consulta y no la escribe |
| `dueno` | Sobre una leída: qué pool la posee. **Es el campo que evita que dos pools se crean con el mismo derecho sobre la misma tabla** |
| `escriben_otros` | Sobre una propia: otros pools también insertan acá. Importa porque al desinstalar, esas escrituras quedan huérfanas |
| `campos_sensibles` | Las **columnas** con dato personal. Se nombran una por una: quien exporta necesita saber qué tapar, y "la tabla es sensible" no le sirve. **El comparador verifica que existan** |
| `alcance` | Cuando difiere del pool. `stock_items` es global; `stock_sucursal` es por punto |
| `referencia_abierta` | La entidad apunta a cualquier fila de cualquier pool, sin FK |

**Sobre `referencia_abierta`:** es lo que permite que Tareas sea núcleo. Una
tarea cuelga de cualquier cosa vía `(entidad_relacionada, entidad_id,
entidad_url)`. Sin este campo, el manifiesto del núcleo tendría que enumerar sus
destinos, y cada pool nuevo obligaría a editarlo. Un núcleo que depende de sus
consumidores deja de ser núcleo.

### Pantallas

| Campo | Qué es |
| --- | --- |
| `ruta`, `titulo`, `molde` | |
| `permiso` | Qué permiso la habilita |
| `pertenencia` | `propia` (default) o `prestada`: el menú del pool la lleva pero es de otro. Sin esto, un pool absorbe pantallas ajenas y al instalarse en otro proyecto arrastra lo que no le toca |
| `navegable` | `false` cuando existe y el menú no la alcanza. **El hallazgo se registra, no se borra** |

Moldes válidos: los cinco previstos (`lista_maestra`, `ficha`, `tablero`,
`bandeja`, `wizard`) más los cuatro que salieron del censo (`chat`, `formulario`,
`feed`, `calendario`) y `otro`.

### Acciones y permisos

`acciones` son las herramientas del asistente: `clave`, `titulo`, `descripcion`
(obligatoria — es lo que lee una persona antes de confirmar),
`requiere_confirmacion`.

`permisos` es `{ modulo, acciones[] }` con acciones en
`ver · crear · editar · aprobar · eliminar`. Pasó de ser un `string[]` con el
módulo solo cuando apareció un sector con datos de personas: ahí "ve o no ve" no
es la pregunta — la pregunta es quién exporta y quién borra.

> El registry de navegación sólo guarda el módulo. Las acciones finas **se
> declaran y no se verifican**, y eso está dicho en la pantalla en vez de
> fingir que sí.

### Dependencias

`depende_de` son los pools que este necesita. `usado_por` es la relación
inversa: quién lo necesita a él.

`usado_por` está **duplicada a propósito y verificada por eso mismo**. Un pool
de núcleo tiene que poder decir quién lo usa sin cargar el catálogo entero; el
validador la contrasta contra el `depende_de` de los demás manifiestos y falla
si no coinciden. Los pools que todavía no se declararon quedan como aviso, no
como verdad.

---

## Agentes

La unidad que ve el cliente es el **agente**, no el módulo. Por dentro hay
pools; por fuera, empleados.

> **El agente posee decisiones y automatizaciones, no pantallas ni entidades.**
> Ésas son compartidas. Si cada agente poseyera las suyas, tres agentes de stock
> producirían tres listados de stock casi iguales — que es exactamente el
> sistema que la fábrica existe para no construir.

| Campo | Qué es |
| --- | --- |
| `trabajo` | Qué hace, en lenguaje de negocio. Lo lee quien lo contrata |
| `necesita` | Qué datos le faltan para funcionar. **Si falta alguno, el agente aparece apagado con el motivo. Nunca inventa para parecer que funciona** |
| `se_activa_con` | Qué hay que completar para encenderlo |
| `acciones` | Cada una con su nivel de participación |
| `capacidades` | `cargar` · `recomendar` · `detectar` · `ejecutar` · `responder` · `explicar` · `priorizar` |
| `permisos` | El techo. **El validador falla si el agente pide más de lo que el pool declara** |

### Niveles de participación

| Nivel | Qué significa |
| --- | --- |
| `sugiere` | Propone; la persona decide |
| `prepara` | Deja todo hecho; falta confirmar |
| `hace_y_avisa` | Actúa solo. **Sólo si es reversible y no toca plata** |
| `nunca` | Lo que protege la constitución, por más permisos que tenga |

`hace_y_avisa` exige `motivo`: hay que poder leer por qué se le dejó actuar
solo. Y admite `reversible` / `toca_dinero`, que el validador contrasta contra
la regla.

**Esa verificación ya encontró algo.** El agente de Clientes dispara la
comunicación configurada sin confirmación, y un mensaje enviado no se deshace.
Está declarado como está —en espejo el manifiesto describe el sistema real— y el
validador lo marca como aviso. Bajarlo a `prepara` para que el validador dé
verde sería declarar un sistema que no existe.

---

## Qué NO está en el formato, y por qué

- **Datos de instalación** (valores de configuración, estado). Van en
  `fab_instalaciones`: el manifiesto describe la pieza, no la copia instalada.
- **Cómo se ve una pantalla.** El manifiesto dice el molde; el molde se
  construye una vez.
- **Los pools que consumen una entidad ajena.** Se deriva de `dueno`.
