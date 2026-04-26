-- =====================================================================
-- 0019 · Seed de sucursales iniciales (placeholder)
--
-- Inserta las 4 sucursales de Social Ahorro con datos básicos. El resto
-- de los campos (dirección, teléfono, email, lat/lng, responsable) se
-- completan después desde la UI.
--
-- IDEMPOTENTE: ON CONFLICT por código no hace nada si ya existe.
-- Esta migración es un seed minimalista — el refactor más grande de
-- roles/departamentos vendrá en una migración futura.
-- =====================================================================

insert into public.sucursales (nombre, codigo, activa) values
  ('Sucursal Central', 'SA-01', true),
  ('Sucursal Norte',   'SA-02', true),
  ('Sucursal Sur',     'SA-03', true),
  ('Sucursal Este',    'SA-04', true)
on conflict (codigo) do nothing;
