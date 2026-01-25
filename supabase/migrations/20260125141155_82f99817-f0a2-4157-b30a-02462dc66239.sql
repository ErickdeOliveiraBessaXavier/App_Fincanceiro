-- Recriar a Materialized View com novos status
DROP MATERIALIZED VIEW IF EXISTS public.mv_parcelas_consolidadas CASCADE;

CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT 
  p.id,
  p.titulo_id,
  p.numero_parcela,
  p.valor_nominal,
  p.vencimento,
  COALESCE(SUM(CASE WHEN e.tipo IN ('pagamento_total', 'pagamento_parcial') AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0) AS total_pago,
  COALESCE(SUM(CASE WHEN e.tipo = 'juros_aplicado' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0) AS juros,
  COALESCE(SUM(CASE WHEN e.tipo = 'multa_aplicada' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0) AS multa,
  COALESCE(SUM(CASE WHEN e.tipo = 'desconto_concedido' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0) AS descontos,
  p.valor_nominal 
    + COALESCE(SUM(CASE WHEN e.tipo = 'juros_aplicado' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN e.tipo = 'multa_aplicada' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.tipo = 'desconto_concedido' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.tipo IN ('pagamento_total', 'pagamento_parcial') AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
  AS saldo_atual,
  CASE
    WHEN (p.valor_nominal 
      + COALESCE(SUM(CASE WHEN e.tipo = 'juros_aplicado' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN e.tipo = 'multa_aplicada' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN e.tipo = 'desconto_concedido' AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN e.tipo IN ('pagamento_total', 'pagamento_parcial') AND NOT COALESCE(e.estornado, false) THEN e.valor ELSE 0 END), 0)
    ) <= 0 THEN 'pago'
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = p.titulo_id AND a.status = 'ativo') THEN 'renegociado'
    WHEN p.vencimento < CURRENT_DATE THEN 'vencido'
    WHEN p.vencimento <= CURRENT_DATE + INTERVAL '7 days' THEN 'a_vencer'
    ELSE 'pendente'
  END AS status,
  MAX(CASE WHEN e.tipo IN ('pagamento_total', 'pagamento_parcial') AND NOT COALESCE(e.estornado, false) THEN e.created_at END) AS data_ultimo_pagamento,
  COUNT(e.id) AS total_eventos
FROM public.parcelas p
LEFT JOIN public.eventos_parcela e ON e.parcela_id = p.id
GROUP BY p.id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento;

-- Criar índice único para refresh concorrente
CREATE UNIQUE INDEX idx_mv_parcelas_consolidadas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_titulo ON public.mv_parcelas_consolidadas(titulo_id);
CREATE INDEX idx_mv_parcelas_status ON public.mv_parcelas_consolidadas(status);

-- Recriar a View de Títulos com novos status
DROP VIEW IF EXISTS public.vw_titulos_completos;

CREATE VIEW public.vw_titulos_completos AS
SELECT 
  t.id,
  t.cliente_id,
  t.numero_documento,
  t.valor_original,
  t.vencimento_original,
  t.descricao,
  t.metadata,
  t.created_by,
  t.created_at,
  t.updated_at,
  c.nome AS cliente_nome,
  c.cpf_cnpj AS cliente_cpf_cnpj,
  c.telefone AS cliente_telefone,
  c.email AS cliente_email,
  COALESCE(pc.quantidade_parcelas, 0) AS quantidade_parcelas,
  CASE 
    WHEN COALESCE(pc.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo,
  COALESCE(pc.saldo_devedor, t.valor_original) AS saldo_devedor,
  COALESCE(pc.total_pago, 0) AS total_pago,
  COALESCE(pc.total_juros, 0) AS total_juros,
  COALESCE(pc.total_multa, 0) AS total_multa,
  COALESCE(pc.total_descontos, 0) AS total_descontos,
  COALESCE(pc.parcelas_pagas, 0) AS parcelas_pagas,
  COALESCE(pc.parcelas_vencidas, 0) AS parcelas_vencidas,
  COALESCE(pc.parcelas_pendentes, 0) AS parcelas_pendentes,
  CASE
    WHEN COALESCE(pc.saldo_devedor, t.valor_original) <= 0 THEN 'pago'
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = t.id AND a.status = 'ativo') THEN 'renegociado'
    WHEN COALESCE(pc.parcelas_vencidas, 0) > 0 THEN 'vencido'
    WHEN pc.proximo_vencimento IS NOT NULL AND pc.proximo_vencimento <= CURRENT_DATE + INTERVAL '7 days' THEN 'a_vencer'
    ELSE 'pendente'
  END AS status,
  pc.proximo_vencimento
FROM public.titulos t
JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT 
    titulo_id,
    COUNT(*) AS quantidade_parcelas,
    SUM(saldo_atual) AS saldo_devedor,
    SUM(total_pago) AS total_pago,
    SUM(juros) AS total_juros,
    SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    COUNT(*) FILTER (WHERE status IN ('pendente', 'a_vencer')) AS parcelas_pendentes,
    MIN(vencimento) FILTER (WHERE status IN ('pendente', 'a_vencer', 'vencido')) AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas
  GROUP BY titulo_id
) pc ON pc.titulo_id = t.id;