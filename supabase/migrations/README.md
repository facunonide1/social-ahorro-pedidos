# Migraciones pendientes de aplicar

Las migraciones se aplican manualmente porque el `SUPABASE_SERVICE_ROLE_KEY` que está en `.env.local` solo habilita el Data API (PostgREST), no DDL crudo.

## Pendientes al momento del último commit

| Archivo | Fase | Estado |
|---------|------|--------|
| `0028_tickets_validacion_bucket.sql` | F4.7 OCR | Pendiente |
| `0029_clientes_crm.sql` | F5.1 CRM B2B | Pendiente |
| `0030_tareas_enterprise_empleados.sql` | F6.1 Tareas + empleados | Pendiente |
| `0031_seed_tipos_tareas.sql` | F6.3 Seed 16 tipos | Pendiente |

Las migraciones anteriores (`0020` a `0027`) ya están aplicadas según el último checkpoint del usuario.

## Cómo aplicarlas

Cualquiera de estas opciones funciona. Elegí la más cómoda.

### Opción A — SQL editor de Supabase (más simple)

1. Entrar a https://app.supabase.com → tu proyecto → SQL Editor.
2. Abrir cada archivo `.sql` en orden numérico.
3. Pegar el contenido y "Run".
4. Verificar que no hay errores.

**Pre-requisito para `0030`**: la extensión `pg_trgm` debe estar habilitada (ya lo está por las migraciones 0024+). El `do $$ ... duplicate_object` envuelve los `create type` para que se pueda re-correr sin error.

### Opción B — Supabase CLI

```bash
# Auth (una vez)
supabase login
supabase link --project-ref <tu-ref>

# Aplicar
supabase db push
```

### Opción C — psql directo (si tenés DATABASE_URL)

```bash
psql "$DATABASE_URL" < supabase/migrations/0028_tickets_validacion_bucket.sql
psql "$DATABASE_URL" < supabase/migrations/0029_clientes_crm.sql
psql "$DATABASE_URL" < supabase/migrations/0030_tareas_enterprise_empleados.sql
psql "$DATABASE_URL" < supabase/migrations/0031_seed_tipos_tareas.sql
```

## Qué desbloquea cada migración

- **0028** — bucket de storage `tickets-validacion` para el OCR de F4.7. Sin esto, subir una foto de ticket falla con "bucket not found".
- **0029** — tabla `clientes_crm` para el CRM B2B interno (F5.1). Sin esto, `/hub/clientes` muestra un error de tabla inexistente.
- **0030** — schema completo del sistema de tareas + extensión de empleados + objetivos + badges (F6.1). Sin esto, todo `/admin/tareas`, `/admin/mi-panel`, `/admin/mi-equipo`, `/admin/ranking`, `/admin/objetivos` no funciona.
- **0031** — seed de 16 tipos de tareas pre-configurados para farmacia (F6.3). Es upsert: re-runnable.

## Después de aplicar

1. Verificar tablas con `select * from public.tipos_tareas limit 1;` — tiene que devolver al menos un row.
2. Linkear empleados con sus users del sistema: `update empleados set user_id = '<auth.users.id>' where dni = '...';`
3. (Opcional) Crear objetivos iniciales para los empleados con un insert manual o pediéndoselo a NORA con `crear_tarea` adaptado.
4. Configurar Vercel cron secret (`CRON_SECRET` en variables de entorno) para que los 4 crons de F6.15 + el resumen IA se autentiquen correctamente. Sin esto los crons se quedan en 401.
