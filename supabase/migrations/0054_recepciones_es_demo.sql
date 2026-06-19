-- 0054 · es_demo en recepciones_mercaderia (para demo de compras)
alter table public.recepciones_mercaderia add column if not exists es_demo boolean not null default false;
