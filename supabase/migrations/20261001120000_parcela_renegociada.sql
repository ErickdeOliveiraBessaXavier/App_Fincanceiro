-- ============================================================================
-- Parcela de título liquidada por acordo: coluna `renegociada`
--
-- O acordo é novação: `criar_acordo` lança um movimento 'renegociacao' que
-- zera o saldo das parcelas do título. A view lê saldo zero como 'pago', então
-- o título marcado "Acordo Quebrado" listava as parcelas como "Paga" — a
-- dívida não foi paga, mudou para o acordo.
--
-- Não dá para resolver só na tela: parcela paga em dinheiro ANTES do acordo
-- também tem saldo zero. O que distingue é o fato no razão: existe
-- 'renegociacao' não estornada para a parcela (`cancelar_acordo` marca o
-- movimento como estornado, e a parcela volta a valer pelo próprio saldo).
--
-- Por que coluna nova e não um valor novo em `status`: `_vw_parcelas_status`
-- alimenta a `vw_titulos_completos` (contagens e status do título) e a API do
-- ERP (`api-v1`, situação da parcela e do título). Mudar `status` mudaria o
-- contrato com o ERP sem aviso. A coluna entra só na view que o app lê.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
 SELECT mv.id, mv.company_id, mv.titulo_id, mv.numero_parcela, mv.valor_nominal, mv.vencimento,
        mv.juros, mv.multa, mv.descontos, mv.total_pago, mv.saldo_atual, mv.status,
        mv.data_ultimo_pagamento, mv.total_eventos,
        EXISTS (
          SELECT 1 FROM public.movimentos_financeiros m
           WHERE m.company_id = mv.company_id
             AND m.parcela_titulo_id = mv.id
             AND m.tipo = 'renegociacao'
             AND NOT COALESCE(m.estornado, false)
        ) AS renegociada
   FROM public._vw_parcelas_status mv
   LEFT JOIN public.titulos t ON t.id = mv.titulo_id
  WHERE (public.is_super_admin() OR mv.company_id = public.current_company_id())
    AND public.cobrador_ve_cliente(t.cliente_id);

COMMENT ON COLUMN public.vw_parcelas_consolidadas.renegociada IS
  'Parcela liquidada por acordo (movimento renegociacao não estornado). Com saldo zero, a dívida está no acordo — não foi paga.';

-- Conferência: o CREATE OR REPLACE mantém os grants, mas não presumimos.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.vw_parcelas_consolidadas', 'SELECT') THEN
    RAISE EXCEPTION 'vw_parcelas_consolidadas não pode ser lida por anon';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.vw_parcelas_consolidadas', 'SELECT') THEN
    RAISE EXCEPTION 'vw_parcelas_consolidadas precisa continuar legível pelo app';
  END IF;
END $$;
