-- =====================================================================
-- Acordo = NOVAÇÃO: o acordo substitui a dívida original do título.
-- =====================================================================
-- Contexto (inconsistência relatada): título e acordo viviam em dois
-- livros-caixa independentes. Ao criar um acordo, as parcelas ORIGINAIS do
-- título continuavam em aberto e ainda aceitavam pagamento
-- (registrar_pagamento_parcela não checava acordo). As parcelas do acordo
-- (parcelas_acordo) nasciam 'pendente' e NADA as marcava como pagas — não
-- existia fluxo de baixa. Resultado: pagamento lançado no título não refletia
-- no acordo e a parcela do acordo ficava "em aberto" para sempre.
--
-- Decisão do gestor (2026-07-24): Modelo A (novação). Ao criar o acordo, as
-- parcelas do título são LIQUIDADAS (saldo zera, preservando histórico) e o
-- pagamento passa a ser registrado nas PARCELAS DO ACORDO. Cancelar o acordo
-- reverte a liquidação (a dívida original volta). Pagamento direto no título
-- renegociado fica bloqueado.
--
-- Escopo: fluxo novo + trava. Não migra dados antigos (acordos já existentes
-- não são liquidados retroativamente) — reconciliação fica para depois.

-- ============== 1. Novo tipo de evento: 'renegociacao' ==============
-- Evento de efeito -1 que zera o saldo da parcela original quando ela migra
-- para um acordo. Tipo próprio (não 'desconto_concedido') para a reversão
-- conseguir distinguir liquidação de desconto real.
ALTER TABLE public.eventos_parcela DROP CONSTRAINT IF EXISTS eventos_parcela_tipo_check;
ALTER TABLE public.eventos_parcela ADD CONSTRAINT eventos_parcela_tipo_check
  CHECK (tipo IN ('emissao_parcela','pagamento_total','pagamento_parcial',
                  'juros_aplicado','multa_aplicada','desconto_concedido','estorno','renegociacao'));

-- ============== 2. Liquidar parcelas em aberto de um título ==============
-- Insere um evento 'renegociacao' (efeito -1, valor = saldo atual) para cada
-- parcela com saldo > 0, zerando o saldo. Não faz REFRESH — quem chama refaz.
CREATE OR REPLACE FUNCTION public.liquidar_parcelas_titulo(p_titulo_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT vp.id, vp.saldo_atual
    FROM public.vw_parcelas_consolidadas vp
    WHERE vp.titulo_id = p_titulo_id AND vp.saldo_atual > 0
  LOOP
    INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
    VALUES (r.id, 'renegociacao', r.saldo_atual, -1, p_motivo, auth.uid());
  END LOOP;
END; $$;

-- ============== 3. Criar acordo (atômico) + liquidar o título ==============
CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_titulo_id uuid, p_cliente_id uuid, p_valor_original numeric, p_valor_acordo numeric,
  p_desconto numeric, p_parcelas int, p_valor_parcela numeric,
  p_data_vencimento_primeira_parcela date, p_observacoes text, p_cronograma jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acordo_id uuid; v_company uuid; v_item jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  v_company := public.current_company_id();

  INSERT INTO public.acordos (
    company_id, titulo_id, cliente_id, valor_original, valor_acordo, desconto,
    parcelas, valor_parcela, data_acordo, data_vencimento_primeira_parcela,
    status, observacoes, created_by
  ) VALUES (
    v_company, p_titulo_id, p_cliente_id, p_valor_original, p_valor_acordo, p_desconto,
    p_parcelas, p_valor_parcela, CURRENT_DATE, p_data_vencimento_primeira_parcela,
    'ativo', p_observacoes, auth.uid()
  ) RETURNING id INTO v_acordo_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_cronograma, '[]'::jsonb)) LOOP
    INSERT INTO public.parcelas_acordo (
      company_id, acordo_id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, status
    ) VALUES (
      v_company, v_acordo_id,
      (v_item->>'numero_parcela')::int, (v_item->>'valor')::numeric, (v_item->>'valor_juros')::numeric,
      (v_item->>'valor_total')::numeric, (v_item->>'data_vencimento')::date, 'pendente'
    );
  END LOOP;

  PERFORM public.liquidar_parcelas_titulo(p_titulo_id, format('Liquidação por novação (acordo %s)', v_acordo_id));
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;

  RETURN jsonb_build_object('sucesso', true, 'acordo_id', v_acordo_id);
END; $$;

-- ============== 4. Cancelar acordo + reverter a liquidação ==============
-- Marca o acordo como cancelado e estorna os eventos 'renegociacao' (marca
-- estornado=true, o que os exclui da soma da MV → o saldo original volta).
CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  SELECT titulo_id INTO v_titulo FROM public.acordos
    WHERE id = p_acordo_id AND company_id = public.current_company_id();
  IF v_titulo IS NULL THEN RAISE EXCEPTION 'Acordo não encontrado'; END IF;

  UPDATE public.acordos SET status = 'cancelado' WHERE id = p_acordo_id;

  UPDATE public.eventos_parcela e
    SET estornado = true
    FROM public.parcelas p
    WHERE p.id = e.parcela_id
      AND p.titulo_id = v_titulo
      AND e.tipo = 'renegociacao'
      AND (e.estornado IS NULL OR e.estornado = false);

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id);
END; $$;

-- ============== 5. Registrar pagamento de uma parcela do acordo ==============
-- Marca a parcela do acordo como paga (+ data). O trigger update_acordo_status
-- recomputa o status do acordo (cumprido quando todas quitam).
CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(
  p_parcela_acordo_id uuid, p_data_pagamento date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO v_row FROM public.parcelas_acordo
    WHERE id = p_parcela_acordo_id AND company_id = public.current_company_id();
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Parcela do acordo não encontrada'; END IF;
  IF v_row.status = 'paga' THEN RAISE EXCEPTION 'Parcela do acordo já está paga'; END IF;

  UPDATE public.parcelas_acordo
    SET status = 'paga', data_pagamento = COALESCE(p_data_pagamento, CURRENT_DATE), updated_at = now()
    WHERE id = p_parcela_acordo_id;

  RETURN jsonb_build_object('sucesso', true, 'parcela_acordo_id', p_parcela_acordo_id);
END; $$;

-- ============== 6. Trava: não pagar direto um título renegociado ==============
-- Recria registrar_pagamento_parcela acrescentando a guarda de acordo ativo.
-- (Após a liquidação a parcela já fica 'pago'; a guarda cobre a janela e deixa
-- a mensagem clara para o operador.)
CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcela(
  p_parcela_id uuid, p_valor numeric, p_meio_pagamento text, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_tipo_evento text; v_evento_id uuid; v_parcela_info record; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.acordos a
    JOIN public.parcelas p ON p.titulo_id = a.titulo_id
    WHERE p.id = p_parcela_id AND a.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Título renegociado: registre o pagamento nas parcelas do acordo';
  END IF;
  SELECT id, saldo_atual, status INTO v_parcela_info FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_parcela_info.id IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  v_saldo_atual := v_parcela_info.saldo_atual;
  IF v_parcela_info.status = 'pago' THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Valor excede saldo devedor'; END IF;
  v_tipo_evento := CASE WHEN p_valor >= v_saldo_atual THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  VALUES (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela','result',v_result));
  RETURN v_result;
END; $$;

-- ============== 7. Status do título: acordo ativo vence "pago" ==============
-- Como a liquidação zera o saldo, sem esta reordenação um título com acordo
-- ativo apareceria como 'pago'. Agora, enquanto houver acordo ATIVO ele é
-- 'renegociado'; quando o acordo é cumprido (não-ativo) e o saldo está zerado,
-- volta a 'pago'. Demais colunas idênticas (exigência do CREATE OR REPLACE VIEW).
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
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = t.id AND a.status = 'ativo') THEN 'renegociado'
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo,
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

-- ============== 8. Permissões ==============
REVOKE EXECUTE ON FUNCTION public.liquidar_parcelas_titulo(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.criar_acordo(uuid, uuid, numeric, numeric, numeric, int, numeric, date, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_acordo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_acordo(uuid, uuid, numeric, numeric, numeric, int, numeric, date, text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancelar_acordo(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.pagar_parcela_acordo(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
