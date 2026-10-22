-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0229 · SACAR LA FORMALIZACIÓN DEL MOSTRADOR                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El mostrador quedó más formal de lo que la operación necesita. Social Ahorro
-- vende mucho medicamento de venta libre y el sistema no tiene que poner
-- fricción donde no corresponde.
--
-- ── LO QUE SE SACA ──────────────────────────────────────────────────────────
--
--   · la matrícula del farmacéutico, en los tres lugares donde estaba
--   · la tabla `farmaceuticos`, que era un legajo paralelo
--   · el tipo de tarea «Firmar los libros»
--   · `tipos_tareas.requiere_farmaceutico`, que era el permiso por tipo
--
-- ── LO QUE SE QUEDA Y NO SE TOCA ────────────────────────────────────────────
--
-- **Los 5.134 controlados siguen fuera de la lista general.** Esa es la
-- definición ancha de la v1.2 —lo que marque `es_controlado` O
-- `condicion_venta`— y queda igual: mostrar uno de menos cuesta una consulta,
-- uno de más cuesta una inspección.
--
-- ── SE PUEDE BORRAR PORQUE NO HAY NADA ──────────────────────────────────────
--
-- Medido antes de tocar: 0 filas en `farmaceuticos`, 0 empleados con
-- matrícula, 0 tareas del tipo «Firmar los libros», 0 documentos de tipo
-- `matricula_farmaceutico`, 0 despachos de controlados. No se migra nada
-- porque no hay nada que migrar.

-- ── A.2 · EL FARMACÉUTICO ES UN TILDE EN EL USUARIO ─────────────────────────
--
-- Y en el usuario, no en el empleado. Hasta ahora la marca vivía en
-- `empleados.es_farmaceutico`, que es el legajo; el mostrador necesita saber
-- **a quién llamar**, y eso es un usuario del sistema con nombre y teléfono.

alter table public.users_admin
  add column if not exists es_farmaceutico boolean not null default false;

comment on column public.users_admin.es_farmaceutico is
  'Un tilde. Sin matricula, sin vencimiento, sin legajo: el mostrador solo necesita saber a quien llamar.';

create index if not exists users_admin_farmaceutico
  on public.users_admin (sucursal_id) where es_farmaceutico and activo;

-- Lo que hubiera, se pasa. Hoy son cero, pero queda escrito para que la
-- migración sea correcta y no sólo conveniente.
update public.users_admin u
   set es_farmaceutico = true
 where exists (select 1 from empleados e
                where e.user_id = u.id and e.activo and e.es_farmaceutico);

-- ── FUERA LA MATRÍCULA ──────────────────────────────────────────────────────

alter table public.empleados drop column if exists matricula;
drop table if exists public.farmaceuticos;

-- `empleados.es_farmaceutico` se queda: lo usa la cobertura por franja de la
-- OS-5a, que es otra cosa —cuántas horas del horario de atención hay alguien—
-- y no pide ningún papel. Lo que se fue es el número de matrícula.

-- ── A.3 · FUERA EL TIPO DE TAREA Y SU PERMISO ───────────────────────────────

delete from public.tipos_tareas where codigo = 'firmar_libros';

-- El permiso por tipo. **Dos tipos más lo usaban** —«Control de
-- psicotrópicos» y «Cargar trazabilidad ANMAT»— y pierden esa restricción:
-- queda anotado en el reporte para que lo decida el dueño, porque son de
-- Compliance y no del mostrador.
alter table public.tipos_tareas drop column if exists requiere_farmaceutico;

-- ── EL FARMACÉUTICO QUE LEE EL MOSTRADOR ────────────────────────────────────
--
-- Antes miraba `empleados` + `empleado_turnos` + la matrícula, y cuando no
-- había nadie cargado decía que no podía saber si había farmacéutico en el
-- local. Eso era el bloqueo que §1 saca.

create or replace function public.mostrador_farmaceuticos(p_sucursal uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with f as (
    select u.id, u.sucursal_id, s.nombre as sucursal,
           (u.sucursal_id = p_sucursal) as es_de_aca,
           e.nombre_completo, e.telefono
      from users_admin u
      left join sucursales s on s.id = u.sucursal_id
      -- El nombre y el teléfono salen del legajo si existe. Si no, el usuario
      -- igual aparece: lo que importa es que haya alguien a quien llamar.
      left join lateral (
        select nombre_completo, telefono from empleados e2
         where e2.user_id = u.id and e2.activo limit 1
      ) e on true
     where u.activo and u.es_farmaceutico
  )
  select jsonb_build_object(
    'hay_alguno', (select count(*) > 0 from f),
    'por_que_no', case when (select count(*) from f) = 0
      then 'no hay ningun usuario marcado como farmaceutico. Se marca con un tilde en Configuracion / Usuarios'
      end,
    'aca', (select coalesce(jsonb_agg(jsonb_build_object(
              'nombre', coalesce(nombre_completo, 'Farmaceutico'),
              'telefono', telefono) order by nombre_completo nulls last), '[]'::jsonb)
            from f where es_de_aca),
    'en_otras', (select coalesce(jsonb_agg(jsonb_build_object(
              'nombre', coalesce(nombre_completo, 'Farmaceutico'),
              'telefono', telefono, 'sucursal', sucursal) order by nombre_completo nulls last), '[]'::jsonb)
            from f where not es_de_aca)
  );
$$;

comment on function public.mostrador_farmaceuticos(uuid) is
  'A.2 · Quien esta marcado como farmaceutico, para saber a quien llamar. Un tilde y el nombre: sin matricula, sin horarios y sin bloqueo.';

revoke all on function public.mostrador_farmaceuticos(uuid) from public, anon;
grant execute on function public.mostrador_farmaceuticos(uuid) to authenticated, service_role;
