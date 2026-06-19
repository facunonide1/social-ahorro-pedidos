-- 0049 · nuevo tipo de alerta: reponer góndola (hay en depósito, góndola baja)
alter type public.tipo_alerta_stock add value if not exists 'reponer_gondola';
