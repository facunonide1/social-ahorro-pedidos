-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0211 · LOS DOS CHEQUEOS QUE NO DEPENDEN DE LA MEMORIA                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── 1 · QUE NO HAYA DATOS DE PERSONAS ───────────────────────────────────────
--
-- Regla de oro 9: NORA no registra al paciente, ni al médico, ni el contenido
-- de la receta. Decir «me acordé de no poner esas columnas» no es una
-- verificación: se le pregunta al catálogo de Postgres.
--
-- Esto corre en el build. Si alguien agrega `nombre_paciente` a cualquier
-- tabla del sector, el build se rompe — que es exactamente lo que tiene que
-- pasar, porque es la constitución del sistema y no una preferencia.
--
-- ── POR QUÉ LA LISTA DE PALABRAS ES ASÍ ─────────────────────────────────────
--
-- `afiliad` está en la lista aunque «afiliado dado de baja» sea un motivo
-- válido: el motivo es un VALOR de una fila del catálogo, no una columna. La
-- regla mira nombres de columna, así que el motivo pasa y una columna
-- `nro_afiliado` no.
--
-- `nombre` suelto NO está: `convenios.nombre` es el nombre de la obra social.
-- La regla tiene que distinguir lo que identifica a una persona de lo que
-- identifica a una institución, o se vuelve ruido y alguien la apaga.

create or replace function public.convenios_columnas_prohibidas()
returns table (tabla text, columna text, por_que text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.table_name::text, c.column_name::text,
    'identifica a una persona o al contenido clinico de una receta: regla de oro 9'::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and (c.table_name like 'convenio%')
    and (
      c.column_name ~* '(paciente|afiliad|beneficiari|titular_plan)'
      or c.column_name ~* '(medic|prescriptor|matricula_med|profesional_salud)'
      or c.column_name ~* '(diagnost|patolog|tratamiento|cie10|droga_prescripta)'
      or c.column_name ~* '(^dni|_dni|documento_identidad|^cuil|apellido)'
      or c.column_name ~* '(nombre_paciente|nombre_afiliado|nombre_medico)'
    );
$$;

comment on function public.convenios_columnas_prohibidas() is
  'Regla de oro 9, verificada contra el catalogo de Postgres y no contra la memoria de nadie. Tiene que devolver cero filas. Lo corre el build.';

-- ── 2 · QUE UN DÉBITO NO SE PUEDA BORRAR ────────────────────────────────────
--
-- Un débito es lo que la obra social te sacó. Borrarlo es taparlo, y tapar
-- débitos es exactamente lo que este sector viene a impedir: la plata que se
-- pierde es la que nadie cuenta.
--
-- Se cierran como `perdido`, con el motivo. Sin política de delete, nadie que
-- pase por PostgREST puede borrar uno.

create or replace function public.convenios_politicas_de_borrado()
returns table (tabla text, politica text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select tablename::text, policyname::text
  from pg_policies
  where schemaname = 'public'
    and tablename in ('convenio_debitos', 'convenio_historico')
    and cmd in ('DELETE', 'ALL');
$$;

comment on function public.convenios_politicas_de_borrado() is
  'Tiene que devolver cero filas: un debito no se borra y el historico de un convenio tampoco. Se cierran, no se tapan.';

-- Sólo el service_role: los corre el build. Dejarlos abiertos a `authenticated`
-- suma un aviso de seguridad por nada.
revoke all on function public.convenios_columnas_prohibidas() from public, anon, authenticated;
revoke all on function public.convenios_politicas_de_borrado() from public, anon, authenticated;
grant execute on function public.convenios_columnas_prohibidas() to service_role;
grant execute on function public.convenios_politicas_de_borrado() to service_role;
