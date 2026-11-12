-- POLÍTICAS RLS QUE RECALCULAN auth.*() POR CADA FILA · SÓLO LECTURA.
--
-- El advisor «auth_rls_initplan» marca 430. Una política que dice
-- `auth.uid() = user_id` llama a auth.uid() una vez POR FILA. Escrita como
-- `(select auth.uid()) = user_id`, Postgres la evalúa una sola vez por consulta
-- (un initPlan). Mismo resultado, mucho menos trabajo en tablas grandes.
--
-- Esta consulta NO cambia nada. Por cada política de `public` que llama a
-- auth.uid(), auth.jwt() o auth.role() sin envolver en (select …), devuelve:
--   · la definición actual (using / with check)
--   · el `alter policy` con las llamadas envueltas
--   · el `alter policy` de rollback con la definición original
--
-- Lo aplica una persona, con firma, de a una tabla, revisando cada sentencia:
-- es un cambio de RLS. El reemplazo es textual (regexp) y no toca llamadas ya
-- envueltas; igual hay que leerlo antes de correrlo.

with pol as (
  select schemaname, tablename, policyname, qual, with_check
  from pg_policies
  where schemaname = 'public'
),
envolver as (
  select p.*,
    -- envuelve auth.uid() / auth.jwt() / auth.role() que no estén ya
    -- precedidos por "select " (case-insensitive)
    regexp_replace(p.qual,
      '(?<!select )(auth\.(uid|jwt|role)\(\))', '(select \1)', 'gi') as qual_nueva,
    regexp_replace(p.with_check,
      '(?<!select )(auth\.(uid|jwt|role)\(\))', '(select \1)', 'gi') as check_nuevo
  from pol p
  where p.qual ~* '(?<!select )auth\.(uid|jwt|role)\(\)'
     or p.with_check ~* '(?<!select )auth\.(uid|jwt|role)\(\)'
)
select
  e.tablename as tabla,
  e.policyname as politica,
  e.qual as using_actual,
  e.with_check as check_actual,
  format('alter policy %I on %I.%I%s%s;',
         e.policyname, e.schemaname, e.tablename,
         case when e.qual is not null then format(' using (%s)', e.qual_nueva) else '' end,
         case when e.with_check is not null then format(' with check (%s)', e.check_nuevo) else '' end) as cambiar,
  format('alter policy %I on %I.%I%s%s;',
         e.policyname, e.schemaname, e.tablename,
         case when e.qual is not null then format(' using (%s)', e.qual) else '' end,
         case when e.with_check is not null then format(' with check (%s)', e.with_check) else '' end) as rollback
from envolver e
order by e.tablename, e.policyname;
