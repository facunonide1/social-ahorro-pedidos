-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0240 · SIN PLATA NO SUBE, AUNQUE QUEDE LUGAR                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El publicador ordenaba con `nulls last` y cortaba por tope. Eso pone los
-- hallazgos sin plata al final, pero **igual los publica** cuando su detector
-- no tiene cinco con plata para llenar su tope.
--
-- Medido: `barras_con_dos_precios` tiene 21 hallazgos y ninguno costeable
-- —los dos registros duplicados no registran ventas en 3 meses, asi que la
-- diferencia de precio no se multiplica por nada—, y se publicaban 5.
--
-- D.1 dice otra cosa, y es mas fuerte que un orden: **si no se puede estimar,
-- que no aparezca arriba.** Un hallazgo sin plata no se puede comparar con los
-- de al lado, y la lista de arriba es una comparacion: el que no se puede
-- comparar no puede ocupar un lugar.
--
-- ── LA CONSECUENCIA, DICHA ──────────────────────────────────────────────────
--
-- `barras_con_dos_precios` no publica nada hoy. Los 21 casos —incluido uno de
-- 135 veces de diferencia— quedan en la lista larga, que esta a un clic.
--
-- No es que el hallazgo no importe: es que el sistema no puede decir cuanto
-- importa, y un lugar arriba es una afirmacion de importancia. El dia que
-- alguno de esos dos registros registre una venta, el detector lo va a poder
-- costear y va a subir solo.
--
-- (El filtro quedo incorporado al cuerpo final de `deteccion_correr`, en
--  0241. Aca va lo que ya se habia publicado de mas, devuelto a la lista
--  larga.)

update anomalias set publicado_at = null
 where publicado_at is not null and plata_en_juego is null
   and detector in (select clave from detectores where funcion is not null);

update nora_avisos set estado = 'resuelto', resuelto_at = now()
 where estado = 'pendiente' and clave_dedup like 'deteccion:%'
   and not exists (select 1 from anomalias an
                    where 'deteccion:' || an.clave = nora_avisos.clave_dedup
                      and an.publicado_at is not null);
