-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0269 · LA SALUD DE CADA CANAL                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── LO QUE SE PUEDE MEDIR HOY, MEDIDO ANTES DE CONSTRUIR ────────────────────
--
--   D.1 cancelaciones          · 3 de 21 pedidos. Se puede contar, pero no se
--                                puede decir de quien fue: no hay motivo.
--   D.2 tiempo de preparacion  · **0 pedidos** tienen `confirmed_at` Y
--                                `ready_at`. No es que sea lento: nadie marca
--                                los dos momentos.
--   D.3 rechazos por stock     · no se distingue de las otras cancelaciones.
--   D.4 rating                 · ningun canal lo informa.
--   D.5 horarios               · no hay horarios declarados.
--
-- Cuatro de cinco no se pueden medir. **La respuesta no es no construirlos**:
-- es construirlos y que digan que les falta, como hizo la v1.3 con los cinco
-- detectores que no podian correr. Un tablero de salud sin el tiempo de
-- preparacion, que no dice que le falta, hace creer que el canal esta sano.
--
-- Lo que si se construye completo es lo que es configuracion y no medicion:
-- el responsable (D.6) y el cierre temporal (D.7).
--
-- (Dos correcciones de esquema en el camino: `users_admin` no tiene nombre ni
--  email —vive en `empleados`— y la columna es `nombre_completo`. Las dos
--  aparecieron al aplicar, no al escribir. El cuerpo final de `canal_salud`
--  queda en 0270.)

do $$ begin
  create type cancelacion_motivo as enum (
    'sin_stock', 'el_cliente_se_arrepintio', 'no_se_pudo_entregar',
    'precio_mal_publicado', 'producto_no_publicable', 'otro', 'sin_declarar');
exception when duplicate_object then null; end $$;

alter table public.orders
  add column if not exists cancelacion_motivo cancelacion_motivo,
  add column if not exists cancelacion_nota text,
  add column if not exists cancelado_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelado_at timestamptz;

comment on column public.orders.cancelacion_motivo is
  'D.1 y D.3 · Sin esto las dos cosas son el mismo numero. «Se cancelo» y «se '
  'cancelo porque no habia stock» son distintas: la segunda es la que baja la '
  'reputacion y la unica sobre la que se puede hacer algo.';

-- Los 3 cancelados que ya estan quedan en `sin_declarar` y NO en «otro»: no
-- se sabe por que se cancelaron, y «otro» afirmaria que alguien lo decidio.
update public.orders set cancelacion_motivo = 'sin_declarar'
 where status = 'cancelado' and cancelacion_motivo is null;

alter table public.canales_venta
  add column if not exists promete_minutos integer,
  add column if not exists horarios jsonb,
  add column if not exists rating_informado numeric,
  add column if not exists rating_leido_at timestamptz,
  add column if not exists cerrado_hasta timestamptz,
  add column if not exists cerrado_motivo text,
  add column if not exists cerrado_por uuid references auth.users(id) on delete set null,
  add column if not exists cerrado_at timestamptz;

comment on column public.canales_venta.promete_minutos is
  'D.2 · Lo que el canal le promete al cliente. Sin esto, el tiempo de '
  'preparacion se puede medir y no se puede juzgar: 18 minutos es rapido o '
  'tarde segun contra que.';
comment on column public.canales_venta.horarios is
  'D.5 · Horario por dia. Null es «no esta declarado», no «cerrado siempre».';
comment on column public.canales_venta.cerrado_hasta is
  'D.7 · Cerrado temporalmente hasta cuando. El motivo y la hora quedan, '
  'porque cerrar un canal es una decision que despues alguien va a preguntar.';

CREATE OR REPLACE FUNCTION public.canal_cerrar(p_canal text, p_hasta timestamp with time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rol text; v_canal record;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null then
    return jsonb_build_object('ok', false, 'por_que', 'no hay una sesión activa con permiso');
  end if;
  if v_rol not in ('super_admin', 'gerente', 'encargado_sucursal') then
    return jsonb_build_object('ok', false,
      'por_que', format('el rol «%s» no cierra canales: dejar de recibir pedidos es una decisión del que responde por el local o por la cadena', v_rol));
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false,
      'por_que', 'falta el motivo. Cerrar un canal es una decisión que alguien va a preguntar la semana que viene');
  end if;
  if p_hasta is null or p_hasta <= now() then
    return jsonb_build_object('ok', false,
      'por_que', 'falta hasta cuándo. Un cierre sin hora de reapertura es un canal apagado, y eso se decide distinto');
  end if;

  select * into v_canal from canales_venta where id = p_canal;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'ese canal no existe');
  end if;

  update canales_venta
     set cerrado_hasta = p_hasta, cerrado_motivo = btrim(p_motivo),
         cerrado_por = auth.uid(), cerrado_at = now()
   where id = p_canal;

  return jsonb_build_object(
    'ok', true, 'canal', v_canal.nombre, 'hasta', p_hasta,
    'que_pasa_ahora',
      format('%s queda cerrado hasta el %s. El canal sigue activo: esto no es apagarlo, es dejar de recibir pedidos por un rato. Queda registrado quién lo cerró y por qué.',
             v_canal.nombre, to_char(p_hasta, 'DD/MM HH24:MI')));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.canal_reabrir(p_canal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rol text; v_canal record;
begin
  select u.rol into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is null or v_rol not in ('super_admin', 'gerente', 'encargado_sucursal') then
    return jsonb_build_object('ok', false, 'por_que', 'sin permiso para reabrir canales');
  end if;

  select * into v_canal from canales_venta where id = p_canal;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'ese canal no existe');
  end if;
  if v_canal.cerrado_hasta is null or v_canal.cerrado_hasta <= now() then
    return jsonb_build_object('ok', false, 'por_que', 'ese canal no está cerrado');
  end if;

  -- El motivo del cierre anterior NO se borra: queda para que la proxima vez
  -- alguien pueda ver cuantas veces se cerro y por que.
  update canales_venta set cerrado_hasta = now() where id = p_canal;

  return jsonb_build_object('ok', true, 'canal', v_canal.nombre,
    'que_pasa_ahora', format('%s vuelve a recibir pedidos. El motivo del cierre queda registrado: «%s».',
                             v_canal.nombre, coalesce(v_canal.cerrado_motivo, 'sin motivo')));
end;
$function$
;
comment on function public.canal_cerrar(text, timestamptz, text) is
  'D.7 · Cierra un canal hasta una hora, con el motivo. NO lo apaga: apagarlo '
  'es dejar de venderlo y se decide distinto.';

revoke all on function public.canal_cerrar(text, timestamptz, text) from public, anon;
revoke all on function public.canal_reabrir(text) from public, anon;
grant execute on function public.canal_cerrar(text, timestamptz, text) to authenticated, service_role;
grant execute on function public.canal_reabrir(text) to authenticated, service_role;
