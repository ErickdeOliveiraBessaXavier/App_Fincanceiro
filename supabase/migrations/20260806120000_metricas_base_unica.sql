-- =====================================================================
-- Base única para as métricas do Dashboard e de Relatórios.
-- =====================================================================
-- Fecha o P7 que 20260803130000 deixou explicitamente para migration própria
-- ("MV filtrar deleted_at ... exige reconstruir a materialized view e as views
-- dependentes, risco maior, melhor isolado").
--
-- Três correções, todas na mesma reconstrução porque compartilham o CASCADE:
--
--  1. mv_parcelas_consolidadas passa a filtrar `parcelas.deleted_at IS NULL`.
--     cancelar_titulo (20260724120000:32) marca as parcelas como excluídas, mas
--     NADA lia esse campo — a MV varria `public.parcelas` inteira. Consequência
--     no app: o Dashboard lê vw_parcelas_consolidadas direto para montar o
--     Aging ("Tempo de Atraso" / "Total Vencido") e por isso contava parcelas
--     vencidas de títulos JÁ CANCELADOS. O card "Situação de Risco" ficava
--     internamente contraditório: a % vinha de vw_titulos_completos (que filtra
--     deleted_at) e o valor em R$ do Aging (que não filtrava).
--
--  2. vw_titulos_completos passa a filtrar `clientes.deleted_at IS NULL`.
--     excluir_cliente (20260724160000) esconde o cliente via RLS, mas a view
--     roda como OWNER — não herda RLS — e fazia LEFT JOIN em clientes sem
--     filtro. Os títulos de um cliente excluído seguiam contando em "Total de
--     Títulos"/"Valor Total" e saíam nas exportações com o nome dele, enquanto
--     /clientes já não o mostrava.
--     O dinheiro recebido desses títulos NÃO se perde: vw_recebimentos lê
--     eventos_parcela/parcelas_acordo direto e não passa por aqui.
--
--  3. vw_titulos_completos ganha a coluna `acordo_status`.
--     A novação liquida as parcelas originais com evento 'renegociacao'
--     (efeito -1), então o saldo zera SEM que `total_pago` suba. Enquanto o
--     acordo é 'ativo' a view devolve 'renegociado' e tudo bem; quando ele vira
--     'cumprido' ou 'quebrado' o CASE caía em `saldo <= 0 -> 'pago'`. Ou seja:
--     um acordo QUEBRADO (dívida real, não paga) aparecia como título "Pago",
--     inflando a contagem de pagos e a fatia "Pago" da pizza de Relatórios,
--     contribuindo R$ 0 para o valor recuperado.
--
--     Optamos por expor o estado do acordo numa COLUNA em vez de criar valores
--     novos em `status`: acrescentar 'acordo_quebrado' ao domínio de status
--     quebraria filtros espalhados (filterFunctions.ts, Titulos, CampanhaForm,
--     useTitulosAgrupados, derivarStatusCliente). A composição
--     "status financeiro + estado do acordo" já é o padrão do app —
--     TitulosCliente.tsx:68 faz exatamente isso com getStatusMeta('titulo_acordo').
--
-- Nada aqui altera regra de negócio de cobrança: só deixa de contar o que já
-- estava marcado como excluído e passa a expor um fato que já existia.

-- ============== 1. Reconstrução da MV ==============
-- CREATE OR REPLACE não existe para materialized view, e o WHERE novo muda o
-- conjunto de linhas. O CASCADE derruba vw_parcelas_consolidadas e
-- vw_titulos_completos (ambas recriadas abaixo, na mesma transação).
-- vw_recebimentos/vw_recebimentos_tenant NÃO dependem da MV e ficam intactas.
DROP MATERIALIZED VIEW IF EXISTS public.mv_parcelas_consolidadas CASCADE;

CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT
  p.id, p.company_id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'juros_aplicado' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS juros,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'multa_aplicada' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS multa,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'desconto_concedido' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS descontos,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo IN ('pagamento_total','pagamento_parcial') AND (e.estornado IS NULL OR e.estornado = false)), 0) AS total_pago,
  p.valor_nominal + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) AS saldo_atual,
  CASE
    WHEN p.valor_nominal + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) <= 0 THEN 'pago'
    WHEN p.vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  MAX(e.created_at) FILTER (WHERE e.tipo IN ('pagamento_total','pagamento_parcial') AND (e.estornado IS NULL OR e.estornado = false)) AS data_ultimo_pagamento,
  COUNT(e.id) FILTER (WHERE e.estornado IS NULL OR e.estornado = false) AS total_eventos
FROM public.parcelas p
LEFT JOIN public.eventos_parcela e ON e.parcela_id = p.id
WHERE p.deleted_at IS NULL   -- <== a correção (P7)
GROUP BY p.id, p.company_id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento;

-- O índice ÚNICO é requisito do REFRESH ... CONCURRENTLY usado pelas RPCs.
CREATE UNIQUE INDEX idx_mv_parcelas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_company ON public.mv_parcelas_consolidadas(company_id, titulo_id);

-- MV não suporta RLS: acesso direto é revogado; tenants consomem a VIEW abaixo.
REVOKE ALL ON public.mv_parcelas_consolidadas FROM authenticated;
GRANT ALL ON public.mv_parcelas_consolidadas TO service_role;

-- ============== 2. vw_parcelas_consolidadas (idêntica à anterior) ==============
-- View "definer" (owner) que lê a MV (a qual authenticated NÃO acessa direto) e
-- isola por tenant no WHERE.
--
-- ATENÇÃO ao consumir esta view em métrica: ela isola por EMPRESA, mas não pela
-- carteira do cobrador/vendedor (vw_titulos_completos faz isso via
-- cobrador_ve_cliente). Quem precisa do recorte de carteira deve cruzar pelo
-- titulo_id com vw_titulos_completos — é o que o módulo src/domain/metricas faz.
CREATE VIEW public.vw_parcelas_consolidadas AS
SELECT * FROM public.mv_parcelas_consolidadas
WHERE public.is_super_admin() OR company_id = public.current_company_id();

GRANT SELECT ON public.vw_parcelas_consolidadas TO authenticated;
GRANT ALL ON public.vw_parcelas_consolidadas TO service_role;

-- ============== 3. vw_titulos_completos ==============
CREATE VIEW public.vw_titulos_completos AS
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
  -- `status` mantém EXATAMENTE a semântica anterior (nenhum valor novo), para
  -- não quebrar os filtros que já consomem esta coluna.
  CASE
    WHEN ac.status = 'ativo' THEN 'renegociado'
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo,
  c.cobrador_id, c.vendedor_id,
  -- Coluna nova ao final. NULL quando o título nunca teve acordo (ou só teve
  -- acordos cancelados — o cancelamento estorna a liquidação e o título volta a
  -- valer pelo próprio saldo, conforme statusConfig.titulo_acordo).
  ac.status AS acordo_status
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
-- Acordo NÃO cancelado mais recente ligado ao título (via acordo_titulos, que
-- cobre o acordo multi-título de 20260724150000 — acordos.titulo_id só aponta o
-- principal). Só pode haver um 'ativo' por título (20260623130000), então o
-- LATERAL resolve a ordem apenas entre históricos cumprido/quebrado.
LEFT JOIN LATERAL (
  SELECT a.status
  FROM public.acordo_titulos at
  JOIN public.acordos a ON a.id = at.acordo_id
  WHERE at.titulo_id = t.id
    AND a.status <> 'cancelado'
  ORDER BY (a.status = 'ativo') DESC, a.created_at DESC
  LIMIT 1
) ac ON true
WHERE t.deleted_at IS NULL
  -- Cliente excluído (soft) leva os títulos dele junto. LEFT JOIN sem match
  -- deixa c.deleted_at NULL, então título sem cliente continua aparecendo.
  AND c.deleted_at IS NULL
  AND (public.is_super_admin()
       OR (t.company_id = public.current_company_id()
           AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
                OR public.cobrador_ve_cliente(t.cliente_id))));

GRANT SELECT ON public.vw_titulos_completos TO authenticated;
GRANT ALL ON public.vw_titulos_completos TO service_role;

-- CREATE MATERIALIZED VIEW já popula (não usamos WITH NO DATA), então a MV sai
-- daqui pronta e com o filtro novo aplicado — nenhum REFRESH extra é preciso.

NOTIFY pgrst, 'reload schema';
