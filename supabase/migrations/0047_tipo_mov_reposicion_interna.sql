-- 0047 · nuevo tipo de movimiento: reposición interna (depósito → góndola)
alter type public.tipo_movimiento_stock add value if not exists 'reposicion_interna';
