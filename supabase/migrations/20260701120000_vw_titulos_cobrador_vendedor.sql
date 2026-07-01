-- =====================================================================
-- vw_titulos_completos: expõe cobrador_id / vendedor_id do cliente.
-- =====================================================================
-- Necessário para filtrar títulos por cobrador/vendedor na UI (página
-- Títulos). A view já faz LEFT JOIN em clientes c; acrescentamos apenas as
-- duas colunas. Todo o restante do SELECT/WHERE é idêntico à última definição
-- (20260610110000_vendedores.sql) para não alterar comportamento nem a RLS de
-- carteira embutida no WHERE.
--
-- IMPORTANTE: CREATE OR REPLACE VIEW não permite inserir/renomear colunas no
-- meio da lista — só acrescentar ao FINAL. Por isso cobrador_id/vendedor_id
-- entram como as duas últimas colunas.

CREATE OR REPLACE VIEW public.vw_titulos_completos AS
SELECT
  t.id, t.company_id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  t.numero_documento, t.descricao, t.valor_original, t.vencimento_original, t.metadata, t.status AS titulo_status,
  t.created_by, t.created_at, t.updated_at,
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
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = t.id AND a.status = 'ativo') THEN 'renegociado'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo,
  -- Colunas novas ao final (exigência do CREATE OR REPLACE VIEW).
  c.cobrador_id, c.vendedor_id
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT titulo_id,
    COUNT(*) AS quantidade_parcelas,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'a_vencer') AS parcelas_pendentes,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    SUM(total_pago) AS total_pago, SUM(juros) AS total_juros, SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos, SUM(saldo_atual) AS saldo_devedor,
    MIN(vencimento) FILTER (WHERE status != 'pago') AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas GROUP BY titulo_id
) p ON p.titulo_id = t.id
WHERE t.deleted_at IS NULL
  AND (public.is_super_admin()
       OR (t.company_id = public.current_company_id()
           AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
                OR public.cobrador_ve_cliente(t.cliente_id))));
