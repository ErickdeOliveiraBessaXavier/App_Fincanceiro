-- ============================================================================
-- Razão de eventos da parcela de ACORDO
--
-- PROBLEMA: `pagar_parcela_acordo` só virava o status para 'paga' e gravava a
-- data — não existia "quanto foi recebido". A view de recebimentos usava
-- `pa.valor_total`, ou seja, reportava o PREVISTO como se fosse o RECEBIDO.
-- Cliente que pagou R$ 1.010 (juros de atraso) entrava no caixa como R$ 1.000;
-- os R$ 10 sumiam. Fosse o inverso, o relatório mostraria dinheiro que nunca
-- entrou.
--
-- SOLUÇÃO: a parcela de acordo ganha o MESMO razão que a parcela de título já
-- tem (`eventos_parcela`) desde o início — pagamento total/parcial, juros,
-- multa, desconto e estorno, com saldo derivado. Não é modelo novo: é o modelo
-- que já está em produção do outro lado, aplicado onde faltava.
--
-- Saldo = valor_total + Σ(valor × efeito) dos eventos não estornados.
--   pagamento / desconto -> efeito -1
--   juros / multa        -> efeito +1
--   estorno              -> efeito  0 (marca o evento original)
--
-- View simples, não materializada: parcelas de acordo são poucas por tenant e
-- assim o saldo está sempre fresco, sem o REFRESH que a MV de título exige.
-- ============================================================================

-- ============== 1. Tabela de eventos ==============
CREATE TABLE IF NOT EXISTS public.eventos_parcela_acordo (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parcela_acordo_id UUID NOT NULL REFERENCES public.parcelas_acordo(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN (
                      'pagamento_total','pagamento_parcial',
                      'juros_aplicado','multa_aplicada','desconto_concedido','estorno')),
  valor             NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  efeito            INTEGER NOT NULL CHECK (efeito IN (0,1,-1)),
  -- Data de NEGÓCIO do lançamento (o operador informa). `created_at` é quando
  -- foi digitado — os dois divergem sempre que a baixa é lançada com atraso.
  data_evento       DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao         TEXT,
  meio_pagamento    TEXT CHECK (meio_pagamento IS NULL OR meio_pagamento IN
                      ('pix','dinheiro','boleto','transferencia','cartao','outro')),
  metadata          JSONB,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  estornado         BOOLEAN NOT NULL DEFAULT false,
  estornado_por_id  UUID REFERENCES public.eventos_parcela_acordo(id)
);

COMMENT ON TABLE public.eventos_parcela_acordo IS
  'Razão imutável da parcela de acordo. Espelha eventos_parcela (parcela de título).';

CREATE INDEX IF NOT EXISTS idx_eventos_pa_company_parcela
  ON public.eventos_parcela_acordo(company_id, parcela_acordo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pa_tipo
  ON public.eventos_parcela_acordo(tipo);

GRANT SELECT ON public.eventos_parcela_acordo TO authenticated;
GRANT ALL ON public.eventos_parcela_acordo TO service_role;

ALTER TABLE public.eventos_parcela_acordo ENABLE ROW LEVEL SECURITY;

-- Escrita é EXCLUSIVA das RPCs (SECURITY DEFINER). Um razão financeiro não
-- pode aceitar INSERT solto do cliente: o saldo deixaria de ser confiável.
DROP POLICY IF EXISTS "eventos_pa_select" ON public.eventos_parcela_acordo;
CREATE POLICY "eventos_pa_select" ON public.eventos_parcela_acordo FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());

DROP TRIGGER IF EXISTS trg_set_company_eventos_pa ON public.eventos_parcela_acordo;
CREATE TRIGGER trg_set_company_eventos_pa BEFORE INSERT ON public.eventos_parcela_acordo
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

DROP TRIGGER IF EXISTS trg_block_delete_eventos_pa ON public.eventos_parcela_acordo;
CREATE TRIGGER trg_block_delete_eventos_pa BEFORE DELETE ON public.eventos_parcela_acordo
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();

-- ============== 2. Backfill do histórico ==============
-- Sem isto, todo acordo já pago sairia dos recebimentos no momento em que a
-- view passar a ler os eventos. Cada parcela quitada vira um pagamento_total
-- pelo valor previsto — que é exatamente o que o sistema assumia até aqui.
INSERT INTO public.eventos_parcela_acordo
  (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, metadata)
SELECT
  pa.company_id,
  pa.id,
  'pagamento_total',
  pa.valor_total,
  -1,
  COALESCE(pa.data_pagamento, pa.updated_at::date),
  'Baixa anterior ao razão de eventos (migrada automaticamente)',
  jsonb_build_object('origem', 'backfill_20260811120000')
FROM public.parcelas_acordo pa
WHERE pa.status = 'paga'
  AND pa.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.eventos_parcela_acordo e WHERE e.parcela_acordo_id = pa.id
  );

-- ============== 3. Saldo consolidado ==============
CREATE OR REPLACE VIEW public.vw_parcelas_acordo_consolidadas AS
SELECT
  pa.id,
  pa.company_id,
  pa.acordo_id,
  pa.numero_parcela,
  pa.valor,
  pa.valor_juros,
  pa.valor_total,
  pa.data_vencimento,
  pa.data_pagamento,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo IN ('pagamento_total','pagamento_parcial') AND NOT e.estornado), 0) AS total_pago,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo IN ('juros_aplicado','multa_aplicada') AND NOT e.estornado), 0) AS encargos,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'desconto_concedido' AND NOT e.estornado), 0) AS descontos,
  pa.valor_total + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE NOT e.estornado), 0) AS saldo_atual,
  CASE
    WHEN pa.valor_total + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE NOT e.estornado), 0) <= 0 THEN 'paga'
    WHEN pa.data_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'pendente'
  END AS status
FROM public.parcelas_acordo pa
LEFT JOIN public.eventos_parcela_acordo e ON e.parcela_acordo_id = pa.id
WHERE pa.deleted_at IS NULL
GROUP BY pa.id, pa.company_id, pa.acordo_id, pa.numero_parcela, pa.valor,
         pa.valor_juros, pa.valor_total, pa.data_vencimento, pa.data_pagamento;

-- A view roda como owner e NÃO herda a RLS das tabelas base — o isolamento por
-- tenant é explícito, como em vw_parcelas_consolidadas.
CREATE OR REPLACE VIEW public.vw_parcelas_acordo_tenant AS
SELECT * FROM public.vw_parcelas_acordo_consolidadas
WHERE public.is_super_admin() OR company_id = public.current_company_id();

GRANT SELECT ON public.vw_parcelas_acordo_tenant TO authenticated;
GRANT ALL ON public.vw_parcelas_acordo_consolidadas TO service_role;

-- ============== 4. Sincroniza a coluna `status` da parcela ==============
-- `status` continua materializado porque o trigger trigger_update_acordo_status
-- (AFTER UPDATE OF status) recalcula o estado do ACORDO a partir dele. Aqui há
-- um escritor só — as RPCs abaixo — então não há como divergir do razão.
CREATE OR REPLACE FUNCTION public.sincronizar_parcela_acordo(p_parcela_acordo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saldo numeric;
  v_status text;
  v_data date;
BEGIN
  SELECT saldo_atual, status INTO v_saldo, v_status
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;

  -- Quitada => data do último pagamento não estornado. Em aberto => sem data.
  SELECT MAX(data_evento) INTO v_data
    FROM public.eventos_parcela_acordo
   WHERE parcela_acordo_id = p_parcela_acordo_id
     AND tipo IN ('pagamento_total','pagamento_parcial')
     AND NOT estornado;

  UPDATE public.parcelas_acordo
     SET status = v_status,
         data_pagamento = CASE WHEN v_status = 'paga' THEN v_data ELSE NULL END,
         updated_at = now()
   WHERE id = p_parcela_acordo_id;

  RETURN jsonb_build_object('saldo_atual', v_saldo, 'status', v_status);
END; $$;

-- ============== 5. Registrar pagamento (com valor) ==============
CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(
  p_parcela_acordo_id uuid,
  p_valor             numeric,
  p_data_pagamento    date DEFAULT NULL,
  p_meio_pagamento    text DEFAULT NULL,
  p_descricao         text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parcela record;
  v_saldo numeric;
  v_data date;
  v_excedente numeric;
  v_tipo text;
  v_evento_id uuid;
  v_resultado jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT * INTO v_parcela FROM public.parcelas_acordo
    WHERE id = p_parcela_acordo_id AND company_id = public.current_company_id();
  IF v_parcela.id IS NULL THEN
    RAISE EXCEPTION 'Parcela do acordo não encontrada';
  END IF;

  SELECT saldo_atual INTO v_saldo
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;
  IF v_saldo <= 0 THEN
    RAISE EXCEPTION 'Parcela do acordo já está quitada';
  END IF;

  v_data := COALESCE(p_data_pagamento, CURRENT_DATE);

  -- Recebido acima do saldo é encargo de atraso: entra como juros ANTES do
  -- pagamento, para o saldo nunca ficar negativo e para o relatório conseguir
  -- responder quanto entrou de juros. Não confundir com parcelas_acordo.valor_juros,
  -- que é o juros do PARCELAMENTO, definido na criação do acordo.
  v_excedente := p_valor - v_saldo;
  IF v_excedente > 0 THEN
    INSERT INTO public.eventos_parcela_acordo
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'juros_aplicado', v_excedente, 1, v_data,
      format('Encargo por atraso: R$ %s', to_char(v_excedente, 'FM999999990.00')), auth.uid());
  END IF;

  -- Abaixo do saldo é pagamento PARCIAL: a parcela continua aberta pela
  -- diferença. Desconto é outro evento, com autorização própria.
  v_tipo := CASE WHEN p_valor >= v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;

  INSERT INTO public.eventos_parcela_acordo
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, meio_pagamento, created_by)
  VALUES (v_parcela.company_id, p_parcela_acordo_id, v_tipo, p_valor, -1, v_data,
    COALESCE(p_descricao, format('Pagamento de R$ %s', to_char(p_valor, 'FM999999990.00'))),
    p_meio_pagamento, auth.uid())
  RETURNING id INTO v_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(p_parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_parcela.company_id, auth.uid(), 'rpc', 'eventos_parcela_acordo', v_evento_id,
    jsonb_build_object('rpc','pagar_parcela_acordo','valor',p_valor,'result',v_resultado));

  RETURN v_resultado;
END; $$;

-- ============== 5b. Compatibilidade com o app ainda publicado ==============
-- A versão em produção chama pagar_parcela_acordo(p_parcela_acordo_id, p_data_pagamento)
-- e não conhece valor. Dropar essa assinatura agora quebraria a baixa de acordo
-- entre esta migration e o próximo deploy do front.
--
-- Não é sobrecarga ambígua: o PostgREST resolve pelos NOMES dos parâmetros do
-- corpo, e `p_valor` não tem DEFAULT — uma chamada sem ele só casa aqui.
--
-- REMOVER assim que o front novo estiver publicado.
CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(
  p_parcela_acordo_id uuid,
  p_data_pagamento    date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo numeric;
BEGIN
  SELECT saldo_atual INTO v_saldo
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;
  IF v_saldo IS NULL THEN
    RAISE EXCEPTION 'Parcela do acordo não encontrada';
  END IF;
  -- Comportamento idêntico ao anterior: quita a parcela pelo valor devido.
  RETURN public.pagar_parcela_acordo(p_parcela_acordo_id, v_saldo, p_data_pagamento, NULL, NULL);
END; $$;

COMMENT ON FUNCTION public.pagar_parcela_acordo(uuid, date) IS
  'DEPRECADA — compatibilidade com o front anterior ao valor recebido. Remover após o deploy.';

-- ============== 6. Estorno de um lançamento ==============
-- Substitui estornar_parcela_acordo(uuid,text) (20260810120000), que desfazia a
-- parcela inteira. Com o razão, o estorno é de UM lançamento — igual ao que a
-- parcela de título já fazia via estornar_evento_parcela.
DROP FUNCTION IF EXISTS public.estornar_parcela_acordo(uuid, text);

CREATE OR REPLACE FUNCTION public.estornar_evento_parcela_acordo(
  p_evento_id uuid,
  p_motivo    text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento record;
  v_estorno_id uuid;
  v_resultado jsonb;
BEGIN
  -- Estornar é correção de erro operacional: um degrau acima de quem lança.
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo do estorno é obrigatório';
  END IF;

  SELECT * INTO v_evento FROM public.eventos_parcela_acordo
    WHERE id = p_evento_id AND company_id = public.current_company_id();
  IF v_evento.id IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;
  IF v_evento.estornado THEN
    RAISE EXCEPTION 'Lançamento já estornado';
  END IF;
  IF v_evento.tipo = 'estorno' THEN
    RAISE EXCEPTION 'Não é possível estornar um estorno';
  END IF;

  -- O estorno é um lançamento de efeito 0 que APONTA para o original; o saldo
  -- muda porque o original passa a ser ignorado, não porque este soma algo.
  INSERT INTO public.eventos_parcela_acordo
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by, estornado_por_id)
  VALUES (v_evento.company_id, v_evento.parcela_acordo_id, 'estorno', v_evento.valor, 0, CURRENT_DATE,
    format('Estorno de %s: %s', v_evento.tipo, p_motivo), auth.uid(), p_evento_id)
  RETURNING id INTO v_estorno_id;

  UPDATE public.eventos_parcela_acordo
     SET estornado = true, estornado_por_id = v_estorno_id
   WHERE id = p_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(v_evento.parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'estorno_id', v_estorno_id);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_evento.company_id, auth.uid(), 'rpc', 'eventos_parcela_acordo', p_evento_id,
    jsonb_build_object('rpc','estornar_evento_parcela_acordo','motivo',p_motivo,'result',v_resultado));

  RETURN v_resultado;
END; $$;

-- ============== 7. Recebimentos: o que ENTROU, não o previsto ==============
-- Mesma lista de colunas (exigência do CREATE OR REPLACE VIEW); o que muda é a
-- origem do lado do acordo: eventos de pagamento em vez de pa.valor_total.
--
-- `valor` sai com cast explícito para `numeric` sem precisão: era assim que a
-- união resolvia o tipo antes (NUMERIC(15,2) de eventos_parcela com NUMERIC(10,2)
-- de parcelas_acordo). Com os dois lados agora em (15,2), sem o cast a coluna
-- mudaria de tipo e o CREATE OR REPLACE seria recusado.
CREATE OR REPLACE VIEW public.vw_recebimentos AS
SELECT
  e.id                    AS recebimento_id,
  'titulo'::text          AS origem,
  p.company_id,
  p.titulo_id,
  NULL::uuid              AS acordo_id,
  e.valor::numeric        AS valor,
  e.created_at::date      AS data_recebimento,
  e.meio_pagamento
FROM public.eventos_parcela e
JOIN public.parcelas p ON p.id = e.parcela_id
WHERE e.tipo IN ('pagamento_total','pagamento_parcial')
  AND (e.estornado IS NULL OR e.estornado = false)
UNION ALL
SELECT
  ea.id                   AS recebimento_id,
  'acordo'::text          AS origem,
  ea.company_id,
  a.titulo_id,
  pa.acordo_id,
  ea.valor::numeric       AS valor,
  ea.data_evento          AS data_recebimento,
  ea.meio_pagamento
FROM public.eventos_parcela_acordo ea
JOIN public.parcelas_acordo pa ON pa.id = ea.parcela_acordo_id
JOIN public.acordos a ON a.id = pa.acordo_id
WHERE ea.tipo IN ('pagamento_total','pagamento_parcial')
  AND NOT ea.estornado
  AND pa.deleted_at IS NULL
  AND a.status <> 'cancelado';

-- ============== 8. Permissões ==============
REVOKE EXECUTE ON FUNCTION public.sincronizar_parcela_acordo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.estornar_evento_parcela_acordo(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estornar_evento_parcela_acordo(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text) IS
  'Baixa de parcela de acordo pelo valor RECEBIDO. Excedente vira juros_aplicado; abaixo do saldo é pagamento parcial.';
COMMENT ON FUNCTION public.estornar_evento_parcela_acordo(uuid, text) IS
  'Desfaz um lançamento do razão da parcela de acordo (admin+, motivo obrigatório).';

NOTIFY pgrst, 'reload schema';
