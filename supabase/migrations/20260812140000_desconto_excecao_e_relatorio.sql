-- ============================================================================
-- Desconto acima do teto: exceção registrada, não bloqueio
--
-- O teto travava o ADMIN sem saída. Como ele é a maior autoridade da empresa —
-- não há ninguém acima para autorizar —, o único caminho era ir em
-- Configurações, subir o teto, conceder e baixar de volta. Isso é pior que
-- permitir: apaga o rastro. Depois ninguém distingue "houve uma exceção
-- justificada" de "a política mudou".
--
-- Contra a autoridade máxima o controle que funciona não é permissão, é
-- REGISTRO. Então o admin passa a poder exceder, e o lançamento nasce marcado
-- com o teto que valia na hora. `vw_descontos_concedidos` é onde isso aparece.
--
-- O que continua bloqueado: teto ZERO. Zero não é "teto baixo", é "a empresa
-- não habilitou desconto" — é a única chave geral de desligar, e exceção a ela
-- não faria sentido.
-- ============================================================================

-- ============== 1. Avaliação do desconto ==============
-- Deixa de ser só validação: devolve o teto vigente e se o pedido o excede,
-- para quem chama registrar isso junto do movimento.
DROP FUNCTION IF EXISTS public.validar_desconto_acordo(uuid, numeric, numeric, date, date);

CREATE OR REPLACE FUNCTION public.avaliar_desconto_acordo(
  p_company_id     uuid,
  p_valor_total    numeric,
  p_desconto       numeric,
  p_data_pagamento date,
  p_vencimento     date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  RETURN jsonb_build_object(
    'teto_percentual', v_teto,
    'teto_valor', v_maximo,
    'excedeu_teto', p_desconto > v_maximo
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.avaliar_desconto_acordo(uuid, numeric, numeric, date, date)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.avaliar_desconto_acordo(uuid, numeric, numeric, date, date) IS
  'Teto vigente e se o desconto o excede. Recusa quem não é admin, fora da antecipação ou com desconto desabilitado.';

-- ============== 2. Baixa registra a exceção ==============
DROP FUNCTION IF EXISTS public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text);

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
  v_avaliacao jsonb;
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

    v_avaliacao := public.avaliar_desconto_acordo(
      v_parcela.company_id, v_parcela.valor_total, v_desconto, v_data, v_parcela.data_vencimento);

    -- O teto que valia na hora vai junto do movimento: sem isso, mudar o teto
    -- depois reescreveria a história de quais descontos foram exceção.
    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, metadata, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'desconto_concedido', v_desconto, -1, v_data,
      format('Desconto por antecipação: %s', p_motivo_desconto),
      v_avaliacao || jsonb_build_object('motivo', p_motivo_desconto),
      auth.uid());

    v_saldo := v_saldo - v_desconto;
  END IF;

  -- Recebido acima do saldo é encargo de atraso: entra como juros ANTES do
  -- pagamento, para o saldo nunca ficar negativo e para o relatório conseguir
  -- responder quanto entrou de juros. Não confundir com parcelas_acordo.valor_juros,
  -- que é o juros do PARCELAMENTO, definido na criação do acordo.
  v_excedente := p_valor - v_saldo;
  IF v_excedente > 0 THEN
    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'juros_aplicado', v_excedente, 1, v_data,
      format('Encargo por atraso: R$ %s', to_char(v_excedente, 'FM999999990.00')), auth.uid());
  END IF;

  -- Abaixo do saldo é pagamento PARCIAL: a parcela continua aberta pela diferença.
  v_tipo := CASE WHEN p_valor >= v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;

  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, meio_pagamento, created_by)
  VALUES (v_parcela.company_id, p_parcela_acordo_id, v_tipo, p_valor, -1, v_data,
    COALESCE(p_descricao, format('Pagamento de R$ %s', to_char(p_valor, 'FM999999990.00'))),
    p_meio_pagamento, auth.uid())
  RETURNING id INTO v_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(p_parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo,
                                       'desconto', v_desconto, 'avaliacao_desconto', v_avaliacao);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_parcela.company_id, auth.uid(), 'rpc', 'movimentos_financeiros', v_evento_id,
    jsonb_build_object('rpc','pagar_parcela_acordo','valor',p_valor,'desconto',v_desconto,'result',v_resultado));

  RETURN v_resultado;
END; $$;

REVOKE EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.pagar_parcela_acordo(uuid, numeric, date, text, text, numeric, text) IS
  'Baixa da parcela de acordo pelo valor RECEBIDO. Desconto exige admin e antecipação; acima do teto é permitido e registrado como exceção.';

-- ============== 3. Onde a exceção aparece ==============
-- Sem um lugar para ver, o registro não serve para nada. Cobre desconto de
-- parcela de título também: o relatório é "descontos concedidos", não
-- "descontos de acordo".
CREATE OR REPLACE VIEW public.vw_descontos_concedidos AS
SELECT
  m.id,
  m.company_id,
  m.data_evento,
  m.valor,
  m.descricao,
  m.estornado,
  (CASE WHEN m.parcela_acordo_id IS NOT NULL THEN 'acordo' ELSE 'titulo' END)::text AS origem,
  COALESCE((m.metadata->>'excedeu_teto')::boolean, false)  AS excedeu_teto,
  (m.metadata->>'teto_percentual')::numeric                AS teto_percentual,
  (m.metadata->>'teto_valor')::numeric                     AS teto_valor,
  COALESCE(pa.valor_total, p.valor_nominal)                AS valor_parcela,
  COALESCE(pa.numero_parcela, p.numero_parcela)            AS numero_parcela,
  pa.acordo_id,
  COALESCE(a.cliente_id, t.cliente_id)                     AS cliente_id,
  cli.nome                                                 AS cliente_nome,
  perfil.nome                                              AS concedido_por
FROM public.movimentos_financeiros m
LEFT JOIN public.parcelas_acordo pa ON pa.id = m.parcela_acordo_id
LEFT JOIN public.acordos a          ON a.id = pa.acordo_id
LEFT JOIN public.parcelas p         ON p.id = m.parcela_titulo_id
LEFT JOIN public.titulos t          ON t.id = p.titulo_id
LEFT JOIN public.clientes cli       ON cli.id = COALESCE(a.cliente_id, t.cliente_id)
LEFT JOIN public.profiles perfil    ON perfil.user_id = m.created_by
WHERE m.tipo = 'desconto_concedido';

CREATE OR REPLACE VIEW public.vw_descontos_concedidos_tenant AS
SELECT * FROM public.vw_descontos_concedidos
WHERE public.is_super_admin() OR company_id = public.current_company_id();

GRANT SELECT ON public.vw_descontos_concedidos_tenant TO authenticated;
GRANT ALL ON public.vw_descontos_concedidos TO service_role;

COMMENT ON VIEW public.vw_descontos_concedidos IS
  'Descontos concedidos, com quem concedeu, o motivo e se estourou o teto vigente na data.';

NOTIFY pgrst, 'reload schema';
