-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0253 · LOS DOS CAMPOS LEGALES SE CONTRADICEN                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Al medir §1.b aparecio esto, y hay que decirlo antes de cualquier numero
-- del bloque B.
--
-- `productos_catalogo` tiene DOS campos que dicen si un producto necesita
-- receta, y **no coinciden**:
--
--   · `requiere_receta` (boolean) · 3.649 productos
--   · `condicion_venta` (texto)   · 12.386 con «requiere_receta» o
--                                    «receta_archivada»
--
-- Se contradicen en **12.746 productos**. Solo 1.230 coinciden.
--
-- ── POR QUE IMPORTA MAS QUE EL NUMERO ───────────────────────────────────────
--
-- Porque **cual de los dos se mire cambia la respuesta de la regla de oro 9.**
-- Mirando el booleano, en la tienda hay 1 publicado que no deberia estar.
-- Mirando `condicion_venta`, hay 19. Y contando los controlados y los
-- psicotropicos, 20.
--
-- En terreno legal no se elige el campo que da el numero mas bajo. El criterio
-- es el conservador: **si CUALQUIERA de los dos dice receta, el producto no va
-- a un canal abierto.** Eso es lo que `canal_estado` ya hace, y por eso
-- reporta 20.
--
-- Lo que esta funcion agrega es poder DECIR la contradiccion. Un sistema que
-- usa el criterio conservador y no avisa que los datos no cierran deja a
-- alguien creyendo que el dato esta bien.
--
-- ── LO QUE NO HACE ──────────────────────────────────────────────────────────
--
-- No arregla ninguno de los 12.746. Cual de los dos campos tiene razon no se
-- puede saber desde el sistema: `condicion_venta` lo trajo el maestro en la
-- v1.2 y el booleano es anterior. Arreglarlo es decidir sobre terreno legal
-- con un dato que no esta, y eso lo decide una persona con el vademecum
-- adelante.

create or replace function public.canal_campos_legales_en_conflicto()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with b as (
    select
      count(*) filter (where p.condicion_venta in ('requiere_receta','receta_archivada')
                         and not p.requiere_receta) as condicion_si_bool_no,
      count(*) filter (where p.requiere_receta
                         and p.condicion_venta not in ('requiere_receta','receta_archivada')) as bool_si_condicion_no,
      count(*) filter (where p.condicion_venta in ('requiere_receta','receta_archivada')
                         and p.requiere_receta) as coinciden,
      count(*) filter (where p.condicion_venta = 'sin_declarar') as sin_declarar
    from productos_catalogo p
    where p.activo and not p.es_demo
  ),
  pub as (
    select
      count(*) filter (where pc.requiere_receta) as publicados_por_bool,
      count(*) filter (where pc.condicion_venta in ('requiere_receta','receta_archivada',
                                                    'estupefaciente_psico_ii')) as publicados_por_condicion,
      count(*) filter (where pc.requiere_receta or pc.es_controlado or pc.es_psicotropico
                         or pc.condicion_venta in ('requiere_receta','receta_archivada',
                                                   'estupefaciente_psico_ii')) as publicados_criterio_conservador
    from canal_publicaciones cp
    join productos_catalogo pc on pc.id = cp.producto_id
    join canales_venta cv on cv.id = cp.canal_id
    where cp.estado = 'publish' and cv.tipo <> 'mostrador'
  )
  select jsonb_build_object(
    'en_conflicto', b.condicion_si_bool_no + b.bool_si_condicion_no,
    'condicion_dice_receta_y_el_booleano_no', b.condicion_si_bool_no,
    'el_booleano_dice_receta_y_la_condicion_no', b.bool_si_condicion_no,
    'coinciden', b.coinciden,
    'sin_declarar', b.sin_declarar,
    'publicados_si_se_mira_el_booleano', p.publicados_por_bool,
    'publicados_si_se_mira_la_condicion', p.publicados_por_condicion,
    'publicados_con_el_criterio_conservador', p.publicados_criterio_conservador,
    'que_criterio_se_usa',
      'el conservador: si cualquiera de los dos campos dice receta, controlado o '
      'psicotropico, el producto no va a un canal abierto. En terreno legal no se '
      'elige el campo que da el numero mas bajo.',
    'por_que_no_se_arregla',
      'cual de los dos campos tiene razon no se puede saber desde el sistema: '
      'condicion_venta lo trajo el maestro de SIFACO en la v1.2 y el booleano es '
      'anterior. Decidirlo es terreno legal y lo hace una persona con el vademecum.')
  from b, pub p;
$$;

comment on function public.canal_campos_legales_en_conflicto() is
  'Los dos campos que dicen si un producto necesita receta no coinciden en '
  '12.746 productos, y cual se mire cambia la respuesta de la regla de oro 9: '
  '1 publicado contra 20. Se usa el criterio conservador y se dice que los '
  'datos no cierran — usarlo sin avisar deja a alguien creyendo que el dato '
  'esta bien.';

revoke all on function public.canal_campos_legales_en_conflicto() from public, anon, authenticated;
grant execute on function public.canal_campos_legales_en_conflicto() to service_role;
