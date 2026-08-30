-- 0124 · La vista de períodos corre con los permisos de quien la consulta
--
-- El linter de cierre marcó un ERROR nuevo, de esta misma sesión: una vista
-- creada sin `security_invoker` corre con los permisos de su dueño, así que
-- puede devolver filas que quien consulta no tendría derecho a ver. Es una
-- vista de agregados sobre ventas, no es grave hoy, pero es exactamente la
-- clase de cosa que se descubre dentro de tres meses y por el peor motivo.
--
-- Salió en la corrida de cierre, no en una auditoría futura.

alter view public.producto_ventas_periodos set (security_invoker = true);
