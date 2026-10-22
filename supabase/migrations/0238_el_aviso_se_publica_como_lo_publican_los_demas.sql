-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0238 · EL AVISO SE PUBLICA COMO LO PUBLICAN LOS DEMAS                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La primera corrida fallo al publicar:
--
--   ERROR: there is no unique or exclusion constraint matching the ON
--          CONFLICT specification
--
-- `nora_avisos_dedup_idx` es un indice unico **parcial**:
--
--   unique (clave_dedup) where estado = 'pendiente' and clave_dedup is not null
--
-- Dos cosas se seguian de eso y ninguna se veia desde el nombre del indice:
--
--   1 · el estado de un aviso vivo es `pendiente`, no `abierto`. Los 454
--       avisos cargados estan todos en `pendiente`.
--   2 · para que PostgreSQL use un indice parcial en un `on conflict` hay
--       que repetirle el predicado del indice. Sin eso no lo encuentra.
--
-- Y el motivo de fondo del indice parcial es bueno: la deduplicacion solo
-- tiene que valer entre los avisos vivos. Un aviso resuelto en marzo no debe
-- impedir que el mismo hallazgo se avise de nuevo en octubre, porque volvio a
-- pasar — que es justamente lo que D.6 quiere poder ver.
--
-- El `on conflict` con el predicado quedo incorporado en el cuerpo de
-- `deteccion_correr` desde 0237. Lo que falta aca es la otra mitad: la puerta
-- de descarte tiene que cerrar el aviso con el estado que la tabla usa.

create or replace function public.deteccion_descartar(
  p_anomalia uuid,
  p_motivo text,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_an record;
  v_motivo record;
  v_veces int;
begin
  select * into v_an from anomalias where id = p_anomalia;
  if not found then
    return jsonb_build_object('ok', false, 'por_que', 'ese hallazgo no existe');
  end if;

  select * into v_motivo from deteccion_motivos where clave = p_motivo;
  if not found then
    return jsonb_build_object('ok', false,
      'por_que', format('«%s» no es un motivo del catalogo. Un motivo libre no ensena nada: el detector no puede aprender de un texto distinto cada vez.', p_motivo));
  end if;

  insert into deteccion_descartes (
    anomalia_id, detector, clave, motivo, nota, sucursal_id, hecho, plata, descartado_por)
  values (
    v_an.id, v_an.detector, v_an.clave, p_motivo, p_nota, v_an.sucursal_id,
    coalesce(v_an.hecho, v_an.clave), v_an.plata_en_juego, auth.uid());

  update anomalias
     set estado = 'descartada', cerrada_at = now(), cerrada_por = auth.uid(),
         motivo = coalesce(p_nota, v_motivo.nombre)
   where id = p_anomalia;

  update nora_avisos set estado = 'resuelto', resuelto_at = now()
   where clave_dedup = 'deteccion:' || v_an.clave and estado = 'pendiente';

  select count(*) into v_veces from deteccion_descartes dd
    where dd.detector = v_an.detector and dd.motivo = p_motivo and dd.volvio_at is null;

  return jsonb_build_object(
    'ok', true,
    'detector', v_an.detector,
    'motivo', v_motivo.nombre,
    'veces_con_este_motivo', v_veces,
    'silencia', v_motivo.silencia,
    'que_pasa_ahora', case
      when not v_motivo.silencia then
        format('Queda registrado. Este motivo no calla al detector: %s', v_motivo.ayuda)
      when v_veces >= 3 then
        format('Van %s descartes de %s con el motivo «%s». El detector deja de reportar lo que se descarta por ese motivo.',
               v_veces, v_an.detector, v_motivo.nombre)
      else
        format('Van %s de 3. A los 3 descartes con el motivo «%s», el detector deja de reportar eso.',
               v_veces, v_motivo.nombre)
    end);
end;
$$;

comment on function public.deteccion_descartar(uuid, text, text) is
  'D.5 · La puerta para descartar. El motivo tiene que estar en el catalogo: '
  'un texto libre distinto cada vez no le ensena nada al detector. Cierra la '
  'anomalia y su aviso en el mismo movimiento.';

revoke all on function public.deteccion_descartar(uuid, text, text) from public, anon;
grant execute on function public.deteccion_descartar(uuid, text, text) to authenticated, service_role;
