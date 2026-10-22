-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0274 · EL AGENTE CANAL LEE BARATO                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Como `convenios_resumen` en la v1.1: el agente **no lee el snapshot
-- diario**. Un producto con receta publicado no aparece a las 5 de la mañana
-- —aparece cuando alguien lo publica— y un agente que lo dice con un numero
-- de ayer no sirve para lo unico que ese aviso tiene que lograr.
--
-- Y es barato: cuenta sobre `canal_publicaciones` (7.737) y `anomalias`, no
-- sobre las 598.117 ventas.
--
-- ── F.1 · NACE CON EL MARCADOR VACIO ────────────────────────────────────────
--
-- No se le carga ninguna fila en `agente_config`: sin configuracion, el nivel
-- por defecto del sistema es `sugiere`. Y `agente_bitacora` no tiene ni una
-- propuesta suya, asi que el marcador dice «todavia no se puede juzgar» —
-- igual que los dieciocho detectores de la v1.3 el dia que nacieron.

CREATE OR REPLACE FUNCTION public.canales_resumen(p_sucursal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'canales', (select count(*) from canales_venta where activo),
    'con_catalogo', (select count(*) from canales_venta where activo and catalogo_cargado),
    'sin_catalogo', (select count(*) from canales_venta where activo and not catalogo_cargado),
    'sin_responsable', (select count(*) from canales_venta
                         where activo and responsable_user_id is null),

    -- Lo legal, que es lo unico que el agente pone arriba de todo.
    'legales_publicados', (select count(*) from anomalias an
                            where an.detector = 'canal_legal_publicado'
                              and an.estado in ('abierta', 'reaparecio')),

    -- Los canales donde el recargo no alcanza. Se calcula con dos numeros
    -- declarados, asi que no depende de que haya ventas.
    'canales_con_recargo_corto', (select count(*) from canales_venta
                                   where activo and tipo <> 'mostrador'
                                     and margen_extra_pct < comision_pct),
    'peor_brecha_pts', (select max(comision_pct - margen_extra_pct)
                          from canales_venta
                         where activo and tipo <> 'mostrador'
                           and margen_extra_pct < comision_pct),

    'errores_abiertos', (select count(*) from anomalias an
                          join detectores d on d.clave = an.detector
                         where d.familia = 'canal'
                           and an.estado in ('abierta', 'reaparecio')),
    'plata_en_errores', (select coalesce(sum(an.plata_en_juego), 0) from anomalias an
                          join detectores d on d.clave = an.detector
                         where d.familia = 'canal'
                           and an.estado in ('abierta', 'reaparecio')),

    -- Lo de operacion, por sucursal cuando se pide una.
    'pedidos_90d', (select count(*) from orders o
                     where o.created_at >= now() - interval '90 days'
                       and (p_sucursal is null or o.sucursal_id = p_sucursal)),
    'pedidos_medibles', (select count(*) from orders o
                          where o.ready_at is not null and o.confirmed_at is not null
                            and (p_sucursal is null or o.sucursal_id = p_sucursal)),
    'comisiones_sin_confirmar', (select count(*) from canales_venta
                                  where activo and not comision_confirmada));
$function$
;
comment on function public.canales_resumen(uuid) is
  'F · Lo que lee el agente Canal. Barato y al momento, como convenios_resumen '
  'en la v1.1: un producto con receta publicado no aparece a las 5 de la '
  'mañana, y decirlo con un numero de ayer no sirve.';

revoke all on function public.canales_resumen(uuid) from public, anon, authenticated;
grant execute on function public.canales_resumen(uuid) to service_role;
