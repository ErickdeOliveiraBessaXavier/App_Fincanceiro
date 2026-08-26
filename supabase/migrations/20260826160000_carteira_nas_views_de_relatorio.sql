-- ============================================================================
-- Cobrador só vê a própria carteira — também nos relatórios
--
-- `vw_titulos_completos` já respeitava a carteira (chama `cobrador_ve_cliente`).
-- As demais views não: filtravam empresa, mas não dono do cliente. E como são
-- views SECURITY DEFINER, a RLS de `parcelas` — que TEM a regra de carteira —
-- era contornada ao ler por elas.
--
-- Resultado: dentro da mesma empresa, um cobrador que abrisse parcelas ou os
-- relatórios de recebimento/desconto enxergava linhas de clientes que não são
-- dele. Decisão da operação em 2026-08-26: não deve.
--
-- Duas views-base não carregavam `cliente_id`, então não havia por onde
-- filtrar. Esta migration acrescenta a coluna (no fim, para não quebrar quem
-- consome por posição) e aplica o filtro nos invólucros `_tenant`.
--
-- `cobrador_ve_cliente` já tem a semântica certa e não precisa de exceção
-- para gestão: devolve TRUE quando o usuário não é cobrador nem vendedor —
-- ou seja, admin e financeiro seguem vendo a empresa inteira.
--
-- Por que filtro explícito e não `security_invoker=true`: `vw_parcelas_consolidadas`
-- lê de uma MATERIALIZED VIEW, e materialized view não suporta RLS. Invoker
-- não resolveria justamente a mais usada, e deixaria o projeto com dois padrões
-- de proteção. Aqui todas seguem o mesmo que `vw_titulos_completos` já usa.
-- ============================================================================

-- ============== 1. Parcelas de título ==============
-- A MV guarda `titulo_id`; o dono do cliente vem do título.
CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
SELECT mv.id,
       mv.company_id,
       mv.titulo_id,
       mv.numero_parcela,
       mv.valor_nominal,
       mv.vencimento,
       mv.juros,
       mv.multa,
       mv.descontos,
       mv.total_pago,
       mv.saldo_atual,
       mv.status,
       mv.data_ultimo_pagamento,
       mv.total_eventos
  FROM public.mv_parcelas_consolidadas mv
  LEFT JOIN public.titulos t ON t.id = mv.titulo_id
 WHERE (public.is_super_admin() OR mv.company_id = public.current_company_id())
   AND public.cobrador_ve_cliente(t.cliente_id);

-- ============== 2. Recebimentos ==============
-- Pagamento de título chega pelo título; de acordo, pelo acordo.
CREATE OR REPLACE VIEW public.vw_recebimentos AS
SELECT m.id AS recebimento_id,
       CASE WHEN m.parcela_titulo_id IS NOT NULL THEN 'titulo'::text ELSE 'acordo'::text END AS origem,
       m.company_id,
       COALESCE(pt.titulo_id, a.titulo_id) AS titulo_id,
       pa.acordo_id,
       m.valor::numeric AS valor,
       m.data_evento AS data_recebimento,
       m.meio_pagamento,
       COALESCE(t.cliente_id, a.cliente_id) AS cliente_id
  FROM public.movimentos_financeiros m
  LEFT JOIN public.parcelas pt ON pt.id = m.parcela_titulo_id
  LEFT JOIN public.parcelas_acordo pa ON pa.id = m.parcela_acordo_id
  LEFT JOIN public.acordos a ON a.id = pa.acordo_id
  LEFT JOIN public.titulos t ON t.id = pt.titulo_id
 WHERE (m.tipo = ANY (ARRAY['pagamento_total'::text, 'pagamento_parcial'::text]))
   AND NOT COALESCE(m.estornado, false)
   AND (m.parcela_titulo_id IS NOT NULL OR pa.deleted_at IS NULL AND a.status <> 'cancelado'::text);

CREATE OR REPLACE VIEW public.vw_recebimentos_tenant AS
SELECT recebimento_id, origem, company_id, titulo_id, acordo_id,
       valor, data_recebimento, meio_pagamento, cliente_id
  FROM public.vw_recebimentos
 WHERE (public.is_super_admin() OR company_id = public.current_company_id())
   AND public.cobrador_ve_cliente(cliente_id);

-- ============== 3. Parcelas de acordo ==============
CREATE OR REPLACE VIEW public.vw_parcelas_acordo_consolidadas AS
SELECT pa.id,
       pa.company_id,
       pa.acordo_id,
       pa.numero_parcela,
       pa.valor,
       pa.valor_juros,
       pa.valor_total,
       pa.data_vencimento,
       pa.data_pagamento,
       COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = ANY (ARRAY['pagamento_total'::text, 'pagamento_parcial'::text])) AND NOT m.estornado), 0::numeric) AS total_pago,
       COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = ANY (ARRAY['juros_aplicado'::text, 'multa_aplicada'::text])) AND NOT m.estornado), 0::numeric) AS encargos,
       COALESCE(sum(m.valor) FILTER (WHERE m.tipo = 'desconto_concedido'::text AND NOT m.estornado), 0::numeric) AS descontos,
       pa.valor_total + COALESCE(sum(m.valor * m.efeito::numeric) FILTER (WHERE NOT m.estornado), 0::numeric) AS saldo_atual,
       CASE
         WHEN (pa.valor_total + COALESCE(sum(m.valor * m.efeito::numeric) FILTER (WHERE NOT m.estornado), 0::numeric)) <= 0::numeric THEN 'paga'::text
         WHEN pa.data_vencimento < CURRENT_DATE THEN 'vencida'::text
         ELSE 'pendente'::text
       END AS status,
       ac.cliente_id
  FROM public.parcelas_acordo pa
  LEFT JOIN public.movimentos_financeiros m ON m.parcela_acordo_id = pa.id
  LEFT JOIN public.acordos ac ON ac.id = pa.acordo_id
 WHERE pa.deleted_at IS NULL
 GROUP BY pa.id, pa.company_id, pa.acordo_id, pa.numero_parcela, pa.valor,
          pa.valor_juros, pa.valor_total, pa.data_vencimento, pa.data_pagamento,
          ac.cliente_id;

CREATE OR REPLACE VIEW public.vw_parcelas_acordo_tenant AS
SELECT id, company_id, acordo_id, numero_parcela, valor, valor_juros, valor_total,
       data_vencimento, data_pagamento, total_pago, encargos, descontos,
       saldo_atual, status, cliente_id
  FROM public.vw_parcelas_acordo_consolidadas
 WHERE (public.is_super_admin() OR company_id = public.current_company_id())
   AND public.cobrador_ve_cliente(cliente_id);

-- ============== 4. Descontos ==============
-- Esta já trazia `cliente_id`; faltava só usar.
CREATE OR REPLACE VIEW public.vw_descontos_concedidos_tenant AS
SELECT id, company_id, data_evento, valor, descricao, estornado, origem,
       excedeu_teto, teto_percentual, teto_valor, valor_parcela, numero_parcela,
       acordo_id, cliente_id, cliente_nome, concedido_por
  FROM public.vw_descontos_concedidos
 WHERE (public.is_super_admin() OR company_id = public.current_company_id())
   AND public.cobrador_ve_cliente(cliente_id);

-- `CREATE OR REPLACE VIEW` preserva privilégios, mas as bases foram fechadas na
-- 20260826150000 e precisam continuar fechadas — reafirmado aqui de propósito.
REVOKE SELECT ON public.vw_recebimentos FROM anon, authenticated;
REVOKE SELECT ON public.vw_parcelas_acordo_consolidadas FROM anon, authenticated;
