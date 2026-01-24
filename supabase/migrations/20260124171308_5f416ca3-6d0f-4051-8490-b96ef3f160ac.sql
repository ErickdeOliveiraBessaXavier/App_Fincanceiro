-- Atualizar títulos existentes que não têm numero_documento usando CTE
WITH titulos_para_atualizar AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.titulos
  WHERE numero_documento IS NULL OR numero_documento = ''
)
UPDATE public.titulos t
SET numero_documento = 'TIT-' || LPAD(tpa.rn::TEXT, 5, '0')
FROM titulos_para_atualizar tpa
WHERE t.id = tpa.id;

-- Ajustar a sequência para o próximo valor disponível
SELECT setval('public.titulo_codigo_seq', GREATEST(
  COALESCE((SELECT MAX(CAST(SUBSTRING(numero_documento FROM 5) AS INTEGER)) 
   FROM public.titulos 
   WHERE numero_documento ~ '^TIT-[0-9]+$'), 0) + 1,
  1));

-- Refresh da view materializada
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;