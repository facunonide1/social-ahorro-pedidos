-- OS-5b · Compliance: el escudo de la habilitación. CP-01: NORA registra solo
-- quién/cuándo/SKU/turno — JAMÁS médico/paciente/receta (el libro recetario es el
-- registro legal). Acceso server-side con service_role (RLS sin policy).

-- B · Productos controlados + bloqueo por recall.
alter table public.productos_catalogo add column if not exists es_controlado boolean not null default false;
alter table public.productos_catalogo add column if not exists lista_controlado text;      -- II | III | IV
alter table public.productos_catalogo add column if not exists bloqueado_recall boolean not null default false;

-- C · Registro de despacho (mínimo por diseño).
create table if not exists public.compliance_despachos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  sucursal_id uuid references public.sucursales(id) on delete set null,
  turno text,                       -- manana | tarde | noche (derivado de la hora)
  registrado_por uuid references auth.users(id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists compliance_despachos_suc_idx on public.compliance_despachos(sucursal_id, created_at desc);
create index if not exists compliance_despachos_prod_idx on public.compliance_despachos(producto_id);

-- D · Config de trazabilidad por sucursal.
create table if not exists public.compliance_config (
  sucursal_id uuid primary key references public.sucursales(id) on delete cascade,
  trazabilidad_activa boolean not null default true,
  hora_sugerida int not null default 20,
  updated_at timestamptz not null default now()
);

-- E · Papeles de sucursal (documentos con vencimiento).
create table if not exists public.compliance_documentos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references public.sucursales(id) on delete cascade,
  tipo text not null,               -- matafuegos | seguro | habilitacion | libreta_sanitaria_local | otro
  descripcion text,
  archivo_url text,
  vence_at date,
  es_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists compliance_documentos_suc_idx on public.compliance_documentos(sucursal_id);
create index if not exists compliance_documentos_vence_idx on public.compliance_documentos(vence_at) where vence_at is not null;

-- F · Recalls.
create table if not exists public.compliance_recalls (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos_catalogo(id) on delete set null,
  motivo text,
  referencia_anmat text,
  estado text not null default 'activo',   -- activo | cerrado
  creado_por uuid references auth.users(id) on delete set null,
  cerrado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cerrado_at timestamptz
);
create index if not exists compliance_recalls_estado_idx on public.compliance_recalls(estado);

-- G · SOPs (procedimientos operativos).
create table if not exists public.compliance_sops (
  id uuid primary key default gen_random_uuid(),
  codigo text,                      -- SOP-001
  titulo text,
  contenido text,                   -- markdown
  version int not null default 1,
  estado text not null default 'borrador',  -- borrador | vigente
  firmado_por uuid references auth.users(id) on delete set null,
  firmado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.compliance_despachos enable row level security;
alter table public.compliance_config enable row level security;
alter table public.compliance_documentos enable row level security;
alter table public.compliance_recalls enable row level security;
alter table public.compliance_sops enable row level security;

insert into storage.buckets (id, name, public) values ('compliance','compliance',false) on conflict (id) do nothing;

-- SOP-001 en BORRADOR (el DT lo completa; super_admin lo marca vigente = firma).
insert into public.compliance_sops (codigo, titulo, contenido, estado)
select 'SOP-001', 'Despacho de medicamentos controlados',
  E'# SOP-001 · Despacho de medicamentos controlados\n\n> BORRADOR — a completar por el Director Técnico. Al marcarlo *vigente*, un super_admin registra la firma.\n\n## 1. Alcance\nDespacho de especialidades de las listas II/III/IV en el mostrador.\n\n## 2. Regla de oro\n**Sin farmacéutico presente no se despacha** (ver cobertura en Personas).\n\n## 3. Checklist de validación (mostrador)\n- [ ] Verificar presencia del farmacéutico en la franja.\n- [ ] Verificar receta y rúbrica en el libro recetario (registro LEGAL).\n- [ ] Registrar el despacho en NORA (un tap): producto + turno.\n- [ ] Cargar la trazabilidad ANMAT del día (screenshot).\n\n## 4. Registro\nNORA guarda SOLO quién/cuándo/SKU/turno. Los datos de médico, paciente y receta viven exclusivamente en el libro recetario rubricado.',
  'borrador'
where not exists (select 1 from public.compliance_sops where codigo='SOP-001');

-- D · Tipo de tarea + recurrencias diarias de trazabilidad (motor v0.38).
insert into public.tipos_tareas (codigo, nombre, categoria, prioridad_default, requiere_aprobacion, niveles_workflow, evidencia_requerida, campos_custom, es_auto_generable, permite_recurrencia, notificar_creacion, notificar_vencimiento, dias_alerta_previa, puntos_completar, activo, verificacion_ia, alcance, verificacion_humana)
select 'CARGAR_TRAZABILIDAD', 'Cargar trazabilidad ANMAT', 'regulatorio', 'alta', false, 1, '["foto"]'::jsonb, '[]'::jsonb, true, true, true, true, 0, 0, true, false, 'por_sucursal', true
where not exists (select 1 from public.tipos_tareas where codigo='CARGAR_TRAZABILIDAD');

insert into public.tareas_recurrencias (tipo_tarea_id, titulo_plantilla, descripcion_plantilla, patron, dias_semana, hora_limite, sucursal_id, asignacion_tipo, activa)
select tt.id, 'Cargar trazabilidad ANMAT', 'Cargá la trazabilidad de controlados en ANMAT y subí el screenshot de confirmación.', 'diaria', array[1,2,3,4,5,6], '20:00', s.id, 'pool_sucursal', true
from public.tipos_tareas tt cross join public.sucursales s
where tt.codigo='CARGAR_TRAZABILIDAD' and s.activa
  and not exists (select 1 from public.tareas_recurrencias r where r.tipo_tarea_id=tt.id and r.sucursal_id=s.id);