-- ============================================================================
-- Desconto por antecipação na parcela de acordo
--
-- Regras decididas com o gestor:
--   * Só ADMIN concede desconto. Operador e vendedor, não.
--   * O desconto tem teto percentual definido previamente pela empresa.
--     Teto zero (padrão) = desconto desabilitado.
--   * Desconto só vale na antecipação — pagamento ATÉ a data de vencimento,
--     inclusive. Negar a quem paga exatamente no dia combinado, e conceder a
--     quem pagou um dia antes, geraria discussão sem ganho; e uma regra que
--     incomoda convida o operador a lançar data retroativa, corrompendo a
--     data de pagamento para satisfazer a trava.
--
-- O desconto entra JUNTO com a baixa, não como ação solta: concedido sem o
-- pagamento, ele deixaria a parcela artificialmente menor esperando dinheiro
-- que pode não vir, e a antecipação precisa ser avaliada contra a data do
-- pagamento real.
-- ============================================================================

-- ============== 1. Configuração por empresa ==============
-- O teto precisava de um lugar: `companies` só tem nome/cnpj/plano/status.
-- Colunas tipadas com CHECK, não um JSON — é regra de negócio, merece constraint.
CREATE TABLE IF NOT EXISTS public.configuracoes_empresa (
  company_id                 UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- 0 = desconto desabilitado. É o padrão: só concede quem habilitou antes.
  desconto_maximo_percentual NUMERIC(5,2) NOT NULL DEFAULT 0
                             CHECK (desconto_maximo_percentual >= 0 AND desconto_maximo_percentual <= 100),
  -- Meta mensal de recuperação do Dashboard, que era a constante META_MENSAL
  -- fixa em 50000 no código, com um TODO(gestor) ao lado. Zero = sem meta.
  meta_recuperacao_mensal    NUMERIC(15,2) NOT NULL DEFAULT 0
                             CHECK (meta_recuperacao_mensal >= 0),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.configuracoes_empresa IS
  'Parâmetros de negócio por empresa (teto de desconto, meta de recuperação).';

ALTER TABLE public.configuracoes_empresa ENABLE ROW LEVEL SECURITY;

-- Leitura para a empresa inteira: o operador precisa saber o teto para a tela
-- explicar por que o desconto está indisponível.
DROP POLICY IF EXISTS "configuracoes_empresa_select" ON public.configuracoes_empresa;
CREATE POLICY "configuracoes_empresa_select" ON public.configuracoes_empresa
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());

DROP POLICY IF EXISTS "configuracoes_empresa_admin_write" ON public.configuracoes_empresa;
CREATE POLICY "configuracoes_empresa_admin_write" ON public.configuracoes_empresa
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role((SELECT auth.uid()), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.configuracoes_empresa TO authenticated;
GRANT ALL ON public.configuracoes_empresa TO service_role;

DROP TRIGGER IF EXISTS trg_configuracoes_empresa_updated ON public.configuracoes_empresa;
CREATE TRIGGER trg_configuracoes_empresa_updated
  BEFORE UPDATE ON public.configuracoes_empresa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Empresas existentes herdam a meta que estava fixa no código, para o Dashboard
-- continuar mostrando exatamente o que mostrava. Desconto entra em 0: ninguém
-- ganha permissão nova por causa desta migration.
INSERT INTO public.configuracoes_empresa (company_id, desconto_maximo_percentual, meta_recuperacao_mensal)
SELECT c.id, 0, 50000
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.configuracoes_empresa ce WHERE ce.company_id = c.id
);

-- Empresa nova nasce com a linha de configuração. Sem isto, só as empresas
-- existentes no dia desta migration teriam configuração, e as demais
-- dependeriam de alguém abrir a tela para a linha existir.
CREATE OR REPLACE FUNCTION public.criar_configuracao_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.configuracoes_empresa (company_id)
  VALUES (NEW.id)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_criar_configuracao_empresa ON public.companies;
CREATE TRIGGER trg_criar_configuracao_empresa AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.criar_configuracao_empresa();

-- ============== 2. Validação do desconto ==============
-- Isolada da baixa para a regra ficar legível e testável por si.
CREATE OR REPLACE FUNCTION public.validar_desconto_acordo(
  p_company_id     uuid,
  p_valor_total    numeric,
  p_desconto       numeric,
  p_data_pagamento date,
  p_vencimento     date
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_teto numeric;
  v_maximo numeric;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Desconto exige um administrador';
  END IF;

  -- Antecipação: até o vencimento, inclusive.
  IF p_data_pagamento > p_vencimento THEN
    RAISE EXCEPTION 'Desconto só vale para pagamento até o vencimento (%)',
      to_char(p_vencimento, 'DD/MM/YYYY');
  END IF;

  SELECT desconto_maximo_percentual INTO v_teto
    FROM public.configuracoes_empresa WHERE company_id = p_company_id;
  v_teto := COALESCE(v_teto, 0);

  IF v_teto <= 0 THEN
    RAISE EXCEPTION 'Desconto não habilitado. Defina o teto em Configurações.';
  END IF;

  v_maximo := round(p_valor_total * v_teto / 100, 2);
  IF p_desconto > v_maximo THEN
    -- Monta com format() (onde %s é placeholder e %% é o sinal de porcentagem)
    -- e passa pronto ao RAISE, que trataria % como placeholder.
    RAISE EXCEPTION '%', format(
      'Desconto acima do teto de %s%% (máximo R$ %s nesta parcela)',
      to_char(v_teto, 'FM990.00'), to_char(v_maximo, 'FM999999990.00'));
  END IF;
END; $$;

-- ============== 3. Baixa com desconto ==============
-- DROP + CREATE porque a lista de parâmetros muda. `p_desconto` tem DEFAULT,
-- então a chamada atual do front (sem ele) continua casando com esta função —
-- não há janela de incompatibilidade como houve na migration anterior.
DROP FUNCTION IF EXISTS public.pagar_parcela_acordo(uuid, numeric, date, text, text);

CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(
  p_parcela_acordo_id uuid,
  p_valor             numeric,
  p_data_pagamento    date DEFAULT NULL,
  p_meio_pagamento    text DEFAULT NULL,
  p_descricao         text DEFAULT NULL,
  p_desconto          numeric DEFAULT 0,
  p_motivo_desconto   text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parcela record;
  v_saldo numeric;
  v_data date;
  v_desconto numeric;
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
  v_desconto := COALESCE(p_desconto, 0);

  IF v_desconto > 0 THEN
    IF p_motivo_desconto IS NULL OR btrim(p_motivo_desconto) = '' THEN
      RAISE EXCEPTION 'Motivo do desconto é obrigatório';
    END IF;
    IF v_desconto >= v_saldo THEN
      RAISE EXCEPTION 'Desconto não pode zerar ou exceder o saldo da parcela';
    END IF;
    PERFORM public.validar_desconto_acordo(
      v_parcela.company_id, v_parcela.valor_total, v_desconto, v_data, v_parcela.data_vencimento);

    INSERT INTO public.eventos_parcela_acordo
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'desconto_concedido', v_desconto, -1, v_data,
      format('Desconto por antecipação: %s', p_motivo_desconto), auth.uid());

    v_saldo := v_saldo - v_desconto;
  END IF;

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
  -- diferença.
  v_tipo := CASE WHEN p_valor >= v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;

  INSERT INTO public.eventos_parcela_acordo
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, meio_pagamento, created_by)
  VALUES (v_parcela.company_id, p_parcela_acordo_id, v_tipo, p_valor, -1, v_data,
    COALESCE(p_descricao, format('Pagamento de R$ %s', to_char(p_valor, 'FM999999990.00'))),
    p_meio_pagamento, auth.uid())
  RETURNING id INTO v_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(p_parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo,
                                       'desconto', v_desconto);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_parcela.company_id, auth.uid(), 'rpc', 'eventos_parcela_acordo', v_evento_id,
    jsonb_build_object('rpc','pagar_parcela_acordo','valor',p_valor,'desconto',v_desconto,'result',v_resultado));

  RETURN v_resultado;
END; $$;

-- ============== 4. Permissões ==============
REVOKE EXECUTE ON FUNCTION public.validar_desconto_acordo(uuid, numeric, numeric, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) IS
  'Baixa da parcela de acordo pelo valor RECEBIDO. Excedente vira encargo; abaixo do saldo é parcial. Desconto exige admin, teto configurado e pagamento até o vencimento.';

NOTIFY pgrst, 'reload schema';
