-- 0077 · Finanzas OS-4b (arqueo ciego real + caja chica + desvío)
-- Aditiva. Sobre arqueos_caja (modelo activo) + caja_general_movimientos.

-- ── enums (standalone; solo ADD VALUE) ──
alter type public.arqueo_estado add value if not exists 'en_contraste';
alter type public.caja_general_mov_tipo add value if not exists 'gasto_caja_chica';

-- ── A: arqueo ciego en 2 pasos + marcas de secuencia ──
alter table public.arqueos_caja
  add column if not exists conteo_confirmado_at timestamptz,
  add column if not exists hora_cierre_sifaco text,
  add column if not exists secuencia_alterada boolean not null default false,
  add column if not exists carga_posterior boolean not null default false;

-- ── D: caja chica sobre caja_general_movimientos ──
alter table public.caja_general_movimientos
  add column if not exists categoria text,
  add column if not exists comprobante_url text;

-- ── E: desvío en gastos fijos ──
alter table public.gastos_fijos_instancias
  add column if not exists monto_real numeric;

create index if not exists arqueos_caja_estado_idx on public.arqueos_caja(estado);
create index if not exists cgm_categoria_idx on public.caja_general_movimientos(categoria) where categoria is not null;
