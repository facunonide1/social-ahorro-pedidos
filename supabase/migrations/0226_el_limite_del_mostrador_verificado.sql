-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0226 · LA LÍNEA QUE NO SE CRUZA, VERIFICADA EN EL BUILD                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- «El sistema ayuda con el producto. No ayuda con el tratamiento.»
--
-- Y nunca se guarda: nombre de paciente, diagnóstico, síntoma, ni el motivo
-- por el que alguien compra algo.
--
-- ── POR QUÉ SE PREGUNTA AL CATÁLOGO Y NO A LA MEMORIA ───────────────────────
--
-- Porque es la clase de regla que se rompe sin querer y con buena intención.
-- La frase que la rompe está escrita en el propio prompt: «para mejorar la
-- sugerencia». La próxima persona que trabaje en el mostrador va a querer
-- guardar para qué lo pedían, y va a parecer razonable.
--
-- Entonces no alcanza con haberlo escrito en un comentario: el build se lo
-- pregunta a Postgres y se rompe si aparece.
--
-- ── LAS PALABRAS, Y POR QUÉ ESAS ────────────────────────────────────────────
--
-- `motivo` suelto NO está en la lista, y es a propósito: `motivo_cierre`,
-- `motivo_exclusion` y `motivo_debito` son motivos administrativos y existen
-- en media base. Lo que se busca es `motivo_compra`, `motivo_consulta` y
-- parientes — el motivo de UNA PERSONA.
--
-- `texto_pedido` tampoco: es lo que el empleado escribió para buscar un
-- producto. La diferencia entre «ibuprofeno 600» y «me duele la garganta» no
-- la puede hacer una regla sobre nombres de columna; la hace la pantalla, que
-- cuando detecta una pregunta clínica no busca y no registra nada.

create or replace function public.mostrador_columnas_prohibidas()
returns table (tabla text, columna text, por_que text)
language sql stable security definer set search_path to 'public'
as $$
  select c.table_name::text, c.column_name::text,
    'identifica a una persona o describe un acto medico: §1 del mostrador y regla de oro 9'::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and (c.table_name like 'mostrador%' or c.table_name like 'demanda%')
    and (
      c.column_name ~* '(paciente|afiliad|beneficiari)'
      or c.column_name ~* '(sintoma|dolencia|malestar|diagnost|patolog|tratamiento|cie10)'
      or c.column_name ~* '(medic|prescriptor|matricula_med|profesional_salud)'
      or c.column_name ~* '(motivo_compra|motivo_consulta|motivo_pedido|para_que|para_quien)'
      or c.column_name ~* '(nombre_paciente|apellido_paciente|edad_paciente|embarazo|lactancia)'
    );
$$;

comment on function public.mostrador_columnas_prohibidas() is
  '§1 · La linea que no se cruza, preguntada al catalogo de Postgres y no a la memoria de nadie. Tiene que devolver cero filas. Lo corre el build.';

revoke all on function public.mostrador_columnas_prohibidas() from public, anon, authenticated;
grant execute on function public.mostrador_columnas_prohibidas() to service_role;
