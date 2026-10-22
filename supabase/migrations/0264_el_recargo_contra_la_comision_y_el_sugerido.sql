-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0264 · EL RECARGO CONTRA LA COMISION, Y EL SUGERIDO                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── C.3 · LA PREGUNTA QUE SE CONTESTA SIN UNA SOLA VENTA ────────────────────
--
-- Si el recargo es menor que la comision, ese canal pierde contra el mostrador
-- en todos los productos. Son dos numeros declarados.
--
-- `canales_estado()` ya lo calculaba pero devolvia NULL cuando la comision no
-- estaba confirmada — y las tres que importan no lo estan. Un null ahi es
-- demasiado prudente: **19 es menor que 24 con los numeros que hay**, y eso se
-- puede decir siempre que se diga de donde salen.
--
-- ── C.6 · Y EL RECARGO QUE HARIA FALTA NO ES LA COMISION ────────────────────
--
-- Sobre el precio de mostrador P, el canal cobra P*(1+r) y se queda con
-- P*(1+r)*(1-c). Para igualar a P hace falta (1+r)*(1-c) = 1, o sea
-- **r = c / (1-c)**.
--
-- Con 24% de comision el recargo tiene que ser **31,6%**, no 24%: cobrar un
-- 24% mas no compensa una comision del 24%, porque la comision se cobra sobre
-- el precio ya recargado.
--
-- El recargo de PedidosYa es 19%. La brecha no es de 5 puntos: **es de 12,6.**

CREATE OR REPLACE FUNCTION public.canal_recargo_vs_comision()
 RETURNS TABLE(canal_id text, canal text, recargo_pct numeric, comision_pct numeric, diferencia_pts numeric, cubre boolean, comision_confirmada boolean, recargo_que_haria_falta numeric, hecho text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cv.id, cv.nombre, cv.margen_extra_pct, cv.comision_pct,
         round(cv.margen_extra_pct - cv.comision_pct, 1),
         cv.margen_extra_pct >= cv.comision_pct,
         cv.comision_confirmada,
         -- C.6 · el recargo que dejaria lo mismo que el mostrador.
         --
         -- Sobre el precio de mostrador P, el canal cobra P*(1+r) y se queda
         -- con P*(1+r)*(1-c). Para que eso iguale a P hace falta
         -- (1+r)*(1-c) = 1, o sea r = c / (1-c). Con 24% de comision, el
         -- recargo tiene que ser 31,6% y no 24%: cobrar un 24% mas no
         -- compensa una comision del 24%, porque la comision se cobra sobre
         -- el precio ya recargado.
         case when cv.comision_pct < 100
              then round(100.0 * (cv.comision_pct / 100.0) / (1 - cv.comision_pct / 100.0), 1) end,
         case
           when cv.tipo = 'mostrador' then
             'Es el patrón de comparación: sin comisión y sin recargo.'
           when cv.comision_pct = 0 then
             format('%s no cobra comisión, así que el recargo del %s%% queda entero.',
                    cv.nombre, cv.margen_extra_pct)
           when cv.margen_extra_pct >= cv.comision_pct then
             format('El recargo del %s%% cubre la comisión del %s%%%s.',
                    cv.margen_extra_pct, cv.comision_pct,
                    case when not cv.comision_confirmada
                         then ', con un número de comisión sin confirmar' else '' end)
           else
             format('El recargo del %s%% NO cubre la comisión del %s%%: quedan %s puntos abajo, así que cada venta por %s deja menos que la misma venta en el mostrador. Para igualar al mostrador el recargo tendría que ser %s%% — no %s%%, porque la comisión se cobra sobre el precio ya recargado.%s',
                    cv.margen_extra_pct, cv.comision_pct,
                    round(cv.comision_pct - cv.margen_extra_pct, 1), cv.nombre,
                    round(100.0 * (cv.comision_pct / 100.0) / (1 - cv.comision_pct / 100.0), 1),
                    cv.comision_pct,
                    case when not cv.comision_confirmada
                         then format(' El %s%% de comisión no está confirmado: %s.',
                                     cv.comision_pct, coalesce(cv.comision_de_donde, 'sin origen declarado'))
                         else '' end)
         end
    from canales_venta cv
   where cv.activo
   order by (cv.margen_extra_pct - cv.comision_pct), cv.nombre;
$function$
;
revoke all on function public.canal_recargo_vs_comision() from public, anon, authenticated;
grant execute on function public.canal_recargo_vs_comision() to service_role;
