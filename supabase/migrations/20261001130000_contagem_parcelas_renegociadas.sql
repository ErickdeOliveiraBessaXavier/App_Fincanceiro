-- ============================================================================
-- Título: "parcelas pagas" deixa de contar parcela liquidada por acordo
--
-- `vw_titulos_completos.parcelas_pagas` contava `status = 'pago'`, e a parcela
-- que o acordo zerou (novação) tem status 'pago'. A tela de Títulos mostrava
-- "3/3 parcelas pagas" num título de acordo QUEBRADO — o selo da parcela já
-- dizia "Renegociada" (20261001120000) e a linha do título contradizia.
--
-- 1. A regra "é renegociada" passa a morar num lugar só: `_vw_parcelas_status`
--    (interna, só service_role). `vw_parcelas_consolidadas` lê de lá em vez de
--    repetir o EXISTS. `status` NÃO muda: a api-v1 (ERP) lê essa view por
--    colunas explícitas e continua recebendo o mesmo contrato.
-- 2. `vw_titulos_completos`: `parcelas_pagas` = pagas de verdade; nova coluna
--    `parcelas_renegociadas`. Ninguém além do front lê `parcelas_pagas`
--    (conferido: nenhuma função, view ou Edge Function).
--
-- Colunas novas entram sempre no FIM (CREATE OR REPLACE VIEW só permite
-- acrescentar). Definições partem do pg_get_viewdef de produção em 2026-10-01.
-- ============================================================================

-- ─── 1. Regra única ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public._vw_parcelas_status AS
SELECT mv.id, mv.company_id, mv.titulo_id, mv.numero_parcela, mv.valor_nominal, mv.vencimento,
       mv.juros, mv.multa, mv.descontos, mv.total_pago, mv.saldo_atual,
       CASE
         WHEN mv.saldo_atual <= 0 THEN 'pago'
         WHEN public.proximo_dia_util(mv.vencimento, mv.company_id) < public.hoje_br() THEN 'vencido'
         ELSE 'a_vencer'
       END AS status,
       mv.data_ultimo_pagamento, mv.total_eventos,
       -- Liquidada por acordo: 'renegociacao' não estornada (cancelar_acordo estorna).
       EXISTS (
         SELECT 1 FROM public.movimentos_financeiros m
          WHERE m.company_id = mv.company_id
            AND m.parcela_titulo_id = mv.id
            AND m.tipo = 'renegociacao'
            AND NOT COALESCE(m.estornado, false)
       ) AS renegociada
  FROM public.mv_parcelas_consolidadas mv;

CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
 SELECT mv.id, mv.company_id, mv.titulo_id, mv.numero_parcela, mv.valor_nominal, mv.vencimento,
        mv.juros, mv.multa, mv.descontos, mv.total_pago, mv.saldo_atual, mv.status,
        mv.data_ultimo_pagamento, mv.total_eventos, mv.renegociada
   FROM public._vw_parcelas_status mv
   LEFT JOIN public.titulos t ON t.id = mv.titulo_id
  WHERE (public.is_super_admin() OR mv.company_id = public.current_company_id())
    AND public.cobrador_ve_cliente(t.cliente_id);

-- ─── 2. Contagem no título ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_titulos_completos AS
 SELECT t.id,
    t.company_id,
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
    t.status AS titulo_status,
    t.created_by,
    t.created_at,
    t.updated_at,
    COALESCE(p.quantidade_parcelas, (0)::bigint) AS quantidade_parcelas,
    COALESCE(p.parcelas_pagas, (0)::bigint) AS parcelas_pagas,
    COALESCE(p.parcelas_pendentes, (0)::bigint) AS parcelas_pendentes,
    COALESCE(p.parcelas_vencidas, (0)::bigint) AS parcelas_vencidas,
    COALESCE(p.total_pago, (0)::numeric) AS total_pago,
    COALESCE(p.total_juros, (0)::numeric) AS total_juros,
    COALESCE(p.total_multa, (0)::numeric) AS total_multa,
    COALESCE(p.total_descontos, (0)::numeric) AS total_descontos,
    COALESCE(p.saldo_devedor, (0)::numeric) AS saldo_devedor,
    p.proximo_vencimento,
        CASE
            WHEN (ac.status = ANY (ARRAY['ativo'::text, 'quebrado'::text])) THEN 'renegociado'::text
            WHEN (COALESCE(p.saldo_devedor, (0)::numeric) <= (0)::numeric) THEN 'pago'::text
            WHEN (COALESCE(p.parcelas_vencidas, (0)::bigint) > 0) THEN 'vencido'::text
            ELSE 'a_vencer'::text
        END AS status,
        CASE
            WHEN ((t.metadata ->> 'tipo'::text) IS NOT NULL) THEN (t.metadata ->> 'tipo'::text)
            WHEN (COALESCE(p.quantidade_parcelas, (0)::bigint) > 1) THEN 'parcelado'::text
            ELSE 'avista'::text
        END AS tipo,
    c.cobrador_id,
    c.vendedor_id,
    ac.status AS acordo_status,
    COALESCE(p.parcelas_renegociadas, (0)::bigint) AS parcelas_renegociadas
   FROM (((titulos t
     LEFT JOIN clientes c ON ((c.id = t.cliente_id)))
     LEFT JOIN ( SELECT mv_parcelas_consolidadas.titulo_id,
            count(*) AS quantidade_parcelas,
            -- Paga de verdade: saldo zero que NÃO veio da novação.
            count(*) FILTER (WHERE ((mv_parcelas_consolidadas.status = 'pago'::text) AND (NOT mv_parcelas_consolidadas.renegociada))) AS parcelas_pagas,
            count(*) FILTER (WHERE (mv_parcelas_consolidadas.status = 'a_vencer'::text)) AS parcelas_pendentes,
            count(*) FILTER (WHERE (mv_parcelas_consolidadas.status = 'vencido'::text)) AS parcelas_vencidas,
            sum(mv_parcelas_consolidadas.total_pago) AS total_pago,
            sum(mv_parcelas_consolidadas.juros) AS total_juros,
            sum(mv_parcelas_consolidadas.multa) AS total_multa,
            sum(mv_parcelas_consolidadas.descontos) AS total_descontos,
            sum(mv_parcelas_consolidadas.saldo_atual) AS saldo_devedor,
            min(mv_parcelas_consolidadas.vencimento) FILTER (WHERE (mv_parcelas_consolidadas.status <> 'pago'::text)) AS proximo_vencimento,
            count(*) FILTER (WHERE mv_parcelas_consolidadas.renegociada) AS parcelas_renegociadas
           FROM _vw_parcelas_status mv_parcelas_consolidadas
          GROUP BY mv_parcelas_consolidadas.titulo_id) p ON ((p.titulo_id = t.id)))
     LEFT JOIN LATERAL ( SELECT a.status
           FROM (acordo_titulos at
             JOIN acordos a ON ((a.id = at.acordo_id)))
          WHERE ((at.titulo_id = t.id) AND (a.status <> 'cancelado'::text))
          ORDER BY (a.status = ANY (ARRAY['ativo'::text, 'quebrado'::text])) DESC, a.created_at DESC
         LIMIT 1) ac ON (true))
  WHERE ((t.deleted_at IS NULL) AND (c.deleted_at IS NULL) AND (is_super_admin() OR ((t.company_id = current_company_id()) AND (((current_cobrador_id() IS NULL) AND (current_vendedor_id() IS NULL)) OR cobrador_ve_cliente(t.cliente_id)))));

COMMENT ON COLUMN public.vw_titulos_completos.parcelas_renegociadas IS
  'Parcelas liquidadas por acordo (novação). Não entram em parcelas_pagas.';

-- ─── Conferência: grants mantidos, interna continua fechada ───────────────
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public._vw_parcelas_status', 'SELECT')
     OR has_table_privilege('anon', 'public._vw_parcelas_status', 'SELECT') THEN
    RAISE EXCEPTION '_vw_parcelas_status não pode ser lida pelo app (não filtra empresa)';
  END IF;
  IF NOT has_table_privilege('service_role', 'public._vw_parcelas_status', 'SELECT') THEN
    RAISE EXCEPTION 'api-v1 (service role) precisa ler _vw_parcelas_status';
  END IF;
  IF has_table_privilege('anon', 'public.vw_titulos_completos', 'SELECT')
     OR has_table_privilege('anon', 'public.vw_parcelas_consolidadas', 'SELECT') THEN
    RAISE EXCEPTION 'views de título/parcela não podem ser lidas por anon';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.vw_titulos_completos', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.vw_parcelas_consolidadas', 'SELECT') THEN
    RAISE EXCEPTION 'views de título/parcela precisam continuar legíveis pelo app';
  END IF;
END $$;
