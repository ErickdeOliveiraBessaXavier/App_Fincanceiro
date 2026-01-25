-- Primeiro dropar a view que depende da MV
DROP VIEW IF EXISTS public.vw_titulos_completos;

-- Depois dropar a MV
DROP MATERIALIZED VIEW IF EXISTS public.mv_parcelas_consolidadas;

-- Recriar a Materialized View com status simplificado (sem "pendente", só "a_vencer")
CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT
  p.id,
  p.titulo_id,
  p.numero_parcela,
  p.valor_nominal,
  p.vencimento,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'juros' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS juros,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'multa' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS multa,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'desconto' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS descontos,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'pagamento' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS total_pago,
  p.valor_nominal
    + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) AS saldo_atual,
  CASE
    WHEN p.valor_nominal + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) <= 0 THEN 'pago'
    WHEN p.vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  MAX(e.created_at) FILTER (WHERE e.tipo = 'pagamento' AND (e.estornado IS NULL OR e.estornado = false)) AS data_ultimo_pagamento,
  COUNT(e.id) FILTER (WHERE e.estornado IS NULL OR e.estornado = false) AS total_eventos
FROM public.parcelas p
LEFT JOIN public.eventos_parcela e ON e.parcela_id = p.id
GROUP BY p.id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento;

CREATE UNIQUE INDEX idx_mv_parcelas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_titulo ON public.mv_parcelas_consolidadas(titulo_id);
CREATE INDEX idx_mv_parcelas_status ON public.mv_parcelas_consolidadas(status);

-- Recriar a View de Títulos Completos com status simplificado
CREATE VIEW public.vw_titulos_completos AS
SELECT
  t.id,
  t.cliente_id,
  c.nome AS cliente_nome,
  c.cpf_cnpj AS cliente_cpf_cnpj,
  c.telefone AS cliente_telefone,
  c.email AS cliente_email,
  t.numero_documento,
  t.descricao,
  t.valor_original,
  t.vencimento_original,
  t.metadata,
  t.created_by,
  t.created_at,
  t.updated_at,
  COALESCE(p.quantidade_parcelas, 0) AS quantidade_parcelas,
  COALESCE(p.parcelas_pagas, 0) AS parcelas_pagas,
  COALESCE(p.parcelas_pendentes, 0) AS parcelas_pendentes,
  COALESCE(p.parcelas_vencidas, 0) AS parcelas_vencidas,
  COALESCE(p.total_pago, 0) AS total_pago,
  COALESCE(p.total_juros, 0) AS total_juros,
  COALESCE(p.total_multa, 0) AS total_multa,
  COALESCE(p.total_descontos, 0) AS total_descontos,
  COALESCE(p.saldo_devedor, 0) AS saldo_devedor,
  p.proximo_vencimento,
  CASE
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN EXISTS (
      SELECT 1 FROM public.acordos a 
      WHERE a.titulo_id = t.id AND a.status = 'ativo'
    ) THEN 'renegociado'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT
    titulo_id,
    COUNT(*) AS quantidade_parcelas,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'a_vencer') AS parcelas_pendentes,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    SUM(total_pago) AS total_pago,
    SUM(juros) AS total_juros,
    SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos,
    SUM(saldo_atual) AS saldo_devedor,
    MIN(vencimento) FILTER (WHERE status != 'pago') AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas
  GROUP BY titulo_id
) p ON p.titulo_id = t.id;

-- Refresh da view
SELECT refresh_mv_parcelas();