-- ============================================================================
-- Correções da Auditoria — Rodada 1 (AUDITORIA_RODADA_1.md)
--
-- Itens tratados aqui (numeração do relatório):
--    3  cancelar acordo credita no título o que já foi pago; cumprido não cancela
--    4  reenvio (planilha/API) não reescreve parcela com histórico nem relança baixa
--    5  importação exige o número do título
--    7  toda RPC financeira trava a linha antes de ler o saldo, e lê do razão
--    8  acordo cancelado é terminal: trigger, baixa e estorno respeitam
--    9  título manual: resíduo do arredondamento vai na última parcela
--   11  recebimento de acordo leva todos os títulos do acordo (titulo_ids)
--   12  data da baixa no fuso de Brasília; título aceita data do pagamento
--   14  desconto/encargo de título com motivo, teto registrado e trava de acordo
--   15  criar_acordo valida empresa, cliente, saldo e soma do cronograma
--   16  autoria do lançamento é sempre auth.uid()
--   18  estorno trava o lançamento (dois estornos simultâneos não duplicam)
--
-- Regras de negócio decididas junto (2026-09-29):
--   * Cancelar acordo desfaz a novação e CREDITA no título o que o cliente pagou
--     no acordo (tipo 'credito_acordo', não é recebimento — o recebimento real
--     continua sendo o pagamento no acordo, que segue nos relatórios).
--   * Acordo 'cumprido' não cancela. 'ativo' e 'quebrado' cancelam.
--   * Acordo 'quebrado' continua travando o título (baixa, encargo, novo acordo):
--     para renegociar, cancela-se o quebrado primeiro — renegociação é registro novo.
--   * Acordo com dinheiro lançado não é excluído definitivamente: o crédito dado
--     ao título depende desses pagamentos.
-- ============================================================================

-- ─── Função nova nasce fechada (complemento da 20260929120000) ─────────────
-- O default POR SCHEMA daquela migration tirou anon/authenticated, mas não
-- consegue tirar PUBLIC: o EXECUTE para PUBLIC vem do default GLOBAL do
-- Postgres, e default por schema só acrescenta. Resultado: função nova ainda
-- nascia executável por anon via PUBLIC. A conferência no fim desta migration
-- é que pegou. Precisa vir antes dos CREATE FUNCTION abaixo.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ─── Base ───────────────────────────────────────────────────────────────────

-- O banco roda em UTC: CURRENT_DATE vira o dia seguinte depois das 21h no Brasil.
CREATE OR REPLACE FUNCTION public.hoje_br()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

ALTER TABLE public.movimentos_financeiros
  ALTER COLUMN data_evento SET DEFAULT public.hoje_br();

ALTER TABLE public.movimentos_financeiros DROP CONSTRAINT eventos_parcela_tipo_check;
ALTER TABLE public.movimentos_financeiros ADD CONSTRAINT eventos_parcela_tipo_check CHECK (
  tipo = ANY (ARRAY['emissao_parcela', 'pagamento_total', 'pagamento_parcial', 'juros_aplicado',
                    'multa_aplicada', 'desconto_concedido', 'estorno', 'renegociacao',
                    'credito_acordo']));

ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;

-- Saldo da parcela de título direto do razão. A MV só enxerga o que já foi
-- confirmado antes da transação — ler saldo dela é o que abria a corrida.
CREATE OR REPLACE FUNCTION public._saldo_parcela_titulo(p_parcela_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.valor_nominal
         + COALESCE(sum(m.valor * m.efeito) FILTER (WHERE NOT COALESCE(m.estornado, false)), 0)
    FROM public.parcelas p
    LEFT JOIN public.movimentos_financeiros m ON m.parcela_titulo_id = p.id
   WHERE p.id = p_parcela_id AND p.deleted_at IS NULL
   GROUP BY p.valor_nominal;
$$;

-- Acordo que ainda responde pela dívida do título. 'quebrado' conta: a
-- novação dele só se desfaz pelo cancelamento.
CREATE OR REPLACE FUNCTION public._titulo_em_acordo_vigente(p_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acordo_titulos at
    JOIN public.acordos a ON a.id = at.acordo_id
    WHERE at.titulo_id = p_titulo_id AND a.status IN ('ativo', 'quebrado'));
$$;

-- Trava o título dono da parcela (empresa e carteira de quem chama). Toda
-- escrita em parcela de título passa por aqui: o título é o ponto único de
-- serialização entre baixa, desconto, encargo, estorno e criação de acordo.
CREATE OR REPLACE FUNCTION public._travar_parcela_titulo(p_parcela_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_titulo uuid;
BEGIN
  SELECT t.id INTO v_titulo
    FROM public.titulos t JOIN public.parcelas p ON p.titulo_id = t.id
   WHERE p.id = p_parcela_id AND p.deleted_at IS NULL AND t.deleted_at IS NULL
     AND t.company_id = public.current_company_id()
     AND public.cobrador_ve_titulo(t.id)
     FOR UPDATE OF t;
  IF v_titulo IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  RETURN v_titulo;
END $$;

-- ─── Baixa, desconto e encargo de título (itens 7, 12, 14, 16) ────────────

DROP FUNCTION IF EXISTS public.registrar_pagamento_parcela(uuid, numeric, text, text, uuid);
CREATE FUNCTION public.registrar_pagamento_parcela(
  p_parcela_id uuid, p_valor numeric, p_meio_pagamento text,
  p_descricao text DEFAULT NULL, p_data_pagamento date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_valor numeric := round(p_valor, 2);
  v_data date := COALESCE(p_data_pagamento, public.hoje_br());
  v_titulo uuid; v_saldo numeric; v_tipo text; v_evento uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF v_data > public.hoje_br() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura'; END IF;

  v_titulo := public._travar_parcela_titulo(p_parcela_id);
  IF public._titulo_em_acordo_vigente(v_titulo) THEN
    RAISE EXCEPTION 'Título renegociado: registre o pagamento nas parcelas do acordo';
  END IF;

  v_saldo := public._saldo_parcela_titulo(p_parcela_id);
  IF v_saldo <= 0 THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF v_valor > v_saldo THEN
    RAISE EXCEPTION 'Valor excede o saldo devedor (R$ %)', to_char(v_saldo, 'FM999999999990.00');
  END IF;

  v_tipo := CASE WHEN v_valor = v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.movimentos_financeiros
    (parcela_titulo_id, tipo, valor, efeito, meio_pagamento, descricao, data_evento, created_by)
  VALUES (p_parcela_id, v_tipo, v_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', to_char(v_valor, 'FM999999999990.00'), p_meio_pagamento)),
    v_data, auth.uid())
  RETURNING id INTO v_evento;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento, 'tipo', v_tipo,
    'saldo_anterior', v_saldo, 'saldo_atual', v_saldo - v_valor, 'valor_pago', v_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), auth.uid(), 'rpc', 'movimentos_financeiros', v_evento,
    jsonb_build_object('rpc', 'registrar_pagamento_parcela', 'result', v_result));
  RETURN v_result;
END $$;

DROP FUNCTION IF EXISTS public.conceder_desconto_parcela(uuid, numeric, text, uuid, text);
CREATE FUNCTION public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric, p_motivo text, p_descricao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_valor numeric := round(p_valor, 2);
  v_titulo uuid; v_saldo numeric; v_nominal numeric; v_teto numeric; v_teto_valor numeric;
  v_evento uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Motivo do desconto é obrigatório'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;

  v_titulo := public._travar_parcela_titulo(p_parcela_id);
  IF public._titulo_em_acordo_vigente(v_titulo) THEN
    RAISE EXCEPTION 'Título renegociado: o desconto entra nas parcelas do acordo';
  END IF;

  v_saldo := public._saldo_parcela_titulo(p_parcela_id);
  IF v_valor > v_saldo THEN RAISE EXCEPTION 'Desconto excede o saldo'; END IF;

  -- Mesmo registro do desconto de acordo: o teto que valia na hora vai junto.
  -- Acima do teto é exceção registrada, não bloqueio (decisão de 2026-08).
  SELECT valor_nominal INTO v_nominal FROM public.parcelas WHERE id = p_parcela_id;
  SELECT desconto_maximo_percentual INTO v_teto
    FROM public.configuracoes_empresa WHERE company_id = public.current_company_id();
  IF COALESCE(v_teto, 0) > 0 THEN v_teto_valor := round(v_nominal * v_teto / 100, 2); END IF;

  INSERT INTO public.movimentos_financeiros
    (parcela_titulo_id, tipo, valor, efeito, descricao, metadata, created_by)
  VALUES (p_parcela_id, 'desconto_concedido', v_valor, -1,
    COALESCE(p_descricao, format('Desconto: %s', btrim(p_motivo))),
    jsonb_build_object('motivo', btrim(p_motivo), 'teto_percentual', v_teto, 'teto_valor', v_teto_valor,
                       'excedeu_teto', CASE WHEN v_teto_valor IS NOT NULL THEN v_valor > v_teto_valor END),
    auth.uid())
  RETURNING id INTO v_evento;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento,
    'saldo_anterior', v_saldo, 'saldo_atual', v_saldo - v_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), auth.uid(), 'rpc', 'movimentos_financeiros', v_evento,
    jsonb_build_object('rpc', 'conceder_desconto_parcela', 'motivo', btrim(p_motivo), 'result', v_result));
  RETURN v_result;
END $$;

DROP FUNCTION IF EXISTS public.aplicar_encargo_parcela(uuid, text, numeric, text, uuid, text);
CREATE FUNCTION public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric, p_descricao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_valor numeric := round(p_valor, 2);
  v_titulo uuid; v_saldo numeric; v_evento uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_tipo NOT IN ('juros_aplicado', 'multa_aplicada') THEN RAISE EXCEPTION 'Tipo de encargo inválido'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;

  v_titulo := public._travar_parcela_titulo(p_parcela_id);
  IF public._titulo_em_acordo_vigente(v_titulo) THEN
    RAISE EXCEPTION 'Título renegociado: encargos entram nas parcelas do acordo';
  END IF;

  v_saldo := public._saldo_parcela_titulo(p_parcela_id);
  IF v_saldo <= 0 THEN RAISE EXCEPTION 'Parcela quitada: não há saldo para encargo'; END IF;

  INSERT INTO public.movimentos_financeiros (parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, v_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado',
      CASE WHEN p_tipo = 'juros_aplicado' THEN 'Juros' ELSE 'Multa' END,
      to_char(v_valor, 'FM999999999990.00'))),
    auth.uid())
  RETURNING id INTO v_evento;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento,
    'saldo_anterior', v_saldo, 'saldo_atual', v_saldo + v_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), auth.uid(), 'rpc', 'movimentos_financeiros', v_evento,
    jsonb_build_object('rpc', 'aplicar_encargo_parcela', 'result', v_result));
  RETURN v_result;
END $$;

-- ─── Estorno (itens 7, 8, 18) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.estornar_movimento(p_movimento_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record; v_status_acordo text; v_titulo uuid; v_estornado boolean;
  v_estorno_id uuid; v_resultado jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Motivo do estorno é obrigatório'; END IF;

  SELECT * INTO v_mov FROM public.movimentos_financeiros
   WHERE id = p_movimento_id AND company_id = public.current_company_id();
  IF v_mov.id IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF v_mov.tipo IN ('emissao_parcela', 'estorno') THEN
    RAISE EXCEPTION 'Este lançamento não pode ser estornado';
  END IF;
  IF v_mov.tipo IN ('renegociacao', 'credito_acordo') THEN
    RAISE EXCEPTION 'Lançamento da novação: ele só se desfaz pelo cancelamento do acordo';
  END IF;

  -- Trava na mesma ordem das outras RPCs: primeiro o dono (título ou acordo),
  -- depois o lançamento.
  IF v_mov.parcela_acordo_id IS NOT NULL THEN
    SELECT a.status INTO v_status_acordo
      FROM public.parcelas_acordo pa JOIN public.acordos a ON a.id = pa.acordo_id
     WHERE pa.id = v_mov.parcela_acordo_id
       FOR UPDATE OF pa, a;
    IF v_status_acordo = 'cancelado' THEN
      RAISE EXCEPTION 'Acordo cancelado: os lançamentos dele não mudam mais';
    END IF;
  ELSE
    v_titulo := public._travar_parcela_titulo(v_mov.parcela_titulo_id);
    IF public._titulo_em_acordo_vigente(v_titulo) THEN
      RAISE EXCEPTION 'Título em acordo: cancele o acordo antes de estornar lançamentos anteriores a ele';
    END IF;
  END IF;

  SELECT estornado INTO v_estornado FROM public.movimentos_financeiros
   WHERE id = p_movimento_id FOR UPDATE;
  IF v_estornado THEN RAISE EXCEPTION 'Lançamento já estornado'; END IF;

  -- Efeito 0: o estorno REGISTRA que o original deixou de valer; quem tira o
  -- valor da conta é a marca `estornado`, que as views filtram.
  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_titulo_id, parcela_acordo_id, tipo, valor, efeito,
     data_evento, descricao, created_by, estornado_por_id)
  VALUES (v_mov.company_id, v_mov.parcela_titulo_id, v_mov.parcela_acordo_id,
    'estorno', v_mov.valor, 0, public.hoje_br(),
    format('Estorno de %s: %s', v_mov.tipo, btrim(p_motivo)), auth.uid(), p_movimento_id)
  RETURNING id INTO v_estorno_id;

  UPDATE public.movimentos_financeiros
     SET estornado = true, estornado_por_id = v_estorno_id
   WHERE id = p_movimento_id;

  IF v_mov.parcela_acordo_id IS NOT NULL THEN
    v_resultado := public.sincronizar_parcela_acordo(v_mov.parcela_acordo_id);
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
    v_resultado := jsonb_build_object();
  END IF;

  v_resultado := v_resultado || jsonb_build_object(
    'sucesso', true, 'estorno_id', v_estorno_id, 'tipo_estornado', v_mov.tipo);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_mov.company_id, auth.uid(), 'rpc', 'movimentos_financeiros', p_movimento_id,
    jsonb_build_object('rpc', 'estornar_movimento', 'motivo', btrim(p_motivo), 'result', v_resultado));
  RETURN v_resultado;
END $$;

-- ─── Parcela de acordo (itens 7, 8, 12) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.pagar_parcela_acordo(
  p_parcela_acordo_id uuid, p_valor numeric, p_data_pagamento date DEFAULT NULL,
  p_meio_pagamento text DEFAULT NULL, p_descricao text DEFAULT NULL,
  p_desconto numeric DEFAULT 0, p_motivo_desconto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_valor numeric := round(p_valor, 2);
  v_desconto numeric := round(COALESCE(p_desconto, 0), 2);
  v_data date := COALESCE(p_data_pagamento, public.hoje_br());
  v_parcela record; v_acordo record; v_saldo numeric; v_avaliacao jsonb;
  v_excedente numeric; v_tipo text; v_evento_id uuid; v_resultado jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF v_data > public.hoje_br() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura'; END IF;

  -- Parcela e acordo travados juntos: serializa com outra baixa, com estorno e
  -- com o cancelamento do acordo.
  SELECT pa.* INTO v_parcela
    FROM public.parcelas_acordo pa JOIN public.acordos a ON a.id = pa.acordo_id
   WHERE pa.id = p_parcela_acordo_id AND pa.deleted_at IS NULL
     AND pa.company_id = public.current_company_id()
     AND public.cobrador_ve_cliente(a.cliente_id)
     FOR UPDATE OF pa, a;
  IF v_parcela.id IS NULL THEN RAISE EXCEPTION 'Parcela do acordo não encontrada'; END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = v_parcela.acordo_id;
  IF v_acordo.status = 'cancelado' THEN RAISE EXCEPTION 'Acordo cancelado não recebe pagamento'; END IF;

  SELECT saldo_atual INTO v_saldo
    FROM public.vw_parcelas_acordo_consolidadas WHERE id = p_parcela_acordo_id;
  IF v_saldo <= 0 THEN RAISE EXCEPTION 'Parcela do acordo já está quitada'; END IF;

  IF v_desconto > 0 THEN
    IF p_motivo_desconto IS NULL OR btrim(p_motivo_desconto) = '' THEN
      RAISE EXCEPTION 'Motivo do desconto é obrigatório';
    END IF;
    IF v_desconto >= v_saldo THEN
      RAISE EXCEPTION 'Desconto não pode zerar ou exceder o saldo da parcela';
    END IF;

    v_avaliacao := public.avaliar_desconto_acordo(
      v_parcela.company_id, v_parcela.valor_total, v_desconto, v_data, v_parcela.data_vencimento);

    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, metadata, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'desconto_concedido', v_desconto, -1, v_data,
      format('Desconto por antecipação: %s', p_motivo_desconto),
      v_avaliacao || jsonb_build_object('motivo', p_motivo_desconto),
      auth.uid());

    v_saldo := v_saldo - v_desconto;
  END IF;

  -- Recebido acima do saldo é encargo de atraso: entra como juros ANTES do
  -- pagamento, para o saldo nunca ficar negativo.
  v_excedente := v_valor - v_saldo;
  IF v_excedente > 0 THEN
    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, created_by)
    VALUES (v_parcela.company_id, p_parcela_acordo_id, 'juros_aplicado', v_excedente, 1, v_data,
      format('Encargo por atraso: R$ %s', to_char(v_excedente, 'FM999999990.00')), auth.uid());
  END IF;

  v_tipo := CASE WHEN v_valor >= v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;

  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_acordo_id, tipo, valor, efeito, data_evento, descricao, meio_pagamento, created_by)
  VALUES (v_parcela.company_id, p_parcela_acordo_id, v_tipo, v_valor, -1, v_data,
    COALESCE(p_descricao, format('Pagamento de R$ %s', to_char(v_valor, 'FM999999990.00'))),
    p_meio_pagamento, auth.uid())
  RETURNING id INTO v_evento_id;

  v_resultado := public.sincronizar_parcela_acordo(p_parcela_acordo_id)
                 || jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo,
                                       'desconto', v_desconto, 'avaliacao_desconto', v_avaliacao);

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_parcela.company_id, auth.uid(), 'rpc', 'movimentos_financeiros', v_evento_id,
    jsonb_build_object('rpc', 'pagar_parcela_acordo', 'valor', v_valor, 'desconto', v_desconto, 'result', v_resultado));

  RETURN v_resultado;
END $$;

-- Cancelado é terminal: nenhuma mudança de parcela o reabre (item 8). O
-- UPDATE só acontece quando o status muda, para não poluir a auditoria.
CREATE OR REPLACE FUNCTION public.update_acordo_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_atual text; v_novo text;
BEGIN
  SELECT status INTO v_atual FROM public.acordos WHERE id = NEW.acordo_id;
  IF v_atual IS NULL OR v_atual = 'cancelado' THEN RETURN NEW; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parcelas_acordo
                  WHERE acordo_id = NEW.acordo_id AND deleted_at IS NULL AND status <> 'paga') THEN
    v_novo := 'cumprido';
  ELSIF EXISTS (SELECT 1 FROM public.parcelas_acordo
                 WHERE acordo_id = NEW.acordo_id AND deleted_at IS NULL AND status = 'vencida') THEN
    v_novo := 'quebrado';
  ELSE
    v_novo := 'ativo';
  END IF;

  IF v_novo <> v_atual THEN
    UPDATE public.acordos SET status = v_novo WHERE id = NEW.acordo_id;
  END IF;
  RETURN NEW;
END $$;

-- Só acordos vigentes, e no dia de Brasília. Continua sem ninguém chamando
-- (P8 em PENDENCIAS.md) — mas agora é seguro ligar.
CREATE OR REPLACE FUNCTION public.marcar_parcelas_acordo_vencidas()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.parcelas_acordo pa
     SET status = 'vencida', updated_at = now()
    FROM public.acordos a
   WHERE a.id = pa.acordo_id
     AND a.status IN ('ativo', 'quebrado')
     AND pa.status = 'pendente'
     AND pa.data_vencimento < public.hoje_br()
     AND pa.deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'parcelas_vencidas', v_count);
END $$;

-- ─── Acordo: criação, novação e cancelamento (itens 3, 7, 15) ─────────────

CREATE OR REPLACE FUNCTION public.check_titulo_acordo_unico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.acordo_titulos at2
    JOIN public.acordos a ON a.id = at2.acordo_id
    WHERE at2.titulo_id = NEW.titulo_id
      AND at2.acordo_id <> NEW.acordo_id
      AND a.status IN ('ativo', 'quebrado')
  ) THEN
    RAISE EXCEPTION 'Título já está vinculado a um acordo ativo ou quebrado';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.liquidar_parcelas_titulo(p_titulo_id uuid, p_acordo_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id, public._saldo_parcela_titulo(p.id) AS saldo
      FROM public.parcelas p
     WHERE p.titulo_id = p_titulo_id AND p.deleted_at IS NULL
  LOOP
    CONTINUE WHEN r.saldo <= 0;
    INSERT INTO public.movimentos_financeiros
      (parcela_titulo_id, tipo, valor, efeito, descricao, acordo_id, created_by)
    VALUES (r.id, 'renegociacao', r.saldo, -1, p_motivo, p_acordo_id, auth.uid());
  END LOOP;
END $$;

-- Soma do que ainda se deve nos títulos, direto do razão.
CREATE OR REPLACE FUNCTION public._saldo_titulo(p_titulo_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(sum(s), 0) FROM (
    SELECT public._saldo_parcela_titulo(id) AS s
      FROM public.parcelas WHERE titulo_id = p_titulo_id AND deleted_at IS NULL) x
   WHERE s > 0;
$$;

-- Validações do cronograma recebido (item 15). A soma é comparada em
-- centavos: o front manda float e cada parcela é gravada com 2 casas.
CREATE OR REPLACE FUNCTION public._validar_cronograma(p_cronograma jsonb, p_parcelas int, p_valor_acordo numeric)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_soma numeric;
BEGIN
  IF p_cronograma IS NULL OR jsonb_typeof(p_cronograma) <> 'array' OR jsonb_array_length(p_cronograma) = 0 THEN
    RAISE EXCEPTION 'Cronograma do acordo vazio';
  END IF;
  IF jsonb_array_length(p_cronograma) <> p_parcelas THEN
    RAISE EXCEPTION 'Número de parcelas (%) não bate com o cronograma (%)', p_parcelas, jsonb_array_length(p_cronograma);
  END IF;
  SELECT sum(round((e->>'valor_total')::numeric, 2)) INTO v_soma FROM jsonb_array_elements(p_cronograma) e;
  IF v_soma <> round(p_valor_acordo, 2) THEN
    RAISE EXCEPTION 'A soma das parcelas (R$ %) difere do valor do acordo (R$ %)',
      to_char(v_soma, 'FM999999999990.00'), to_char(round(p_valor_acordo, 2), 'FM999999999990.00');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_titulo_ids uuid[], p_cliente_id uuid, p_valor_original numeric, p_valor_acordo numeric,
  p_desconto numeric, p_parcelas integer, p_valor_parcela numeric,
  p_data_vencimento_primeira_parcela date, p_observacoes text, p_cronograma jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_qtd int := COALESCE(array_length(p_titulo_ids, 1), 0);
  v_validos int; v_saldo numeric; v_saldo_total numeric := 0;
  v_acordo_id uuid; v_item jsonb; v_titulo uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF v_qtd = 0 THEN RAISE EXCEPTION 'Selecione ao menos um título'; END IF;
  IF v_qtd <> (SELECT count(DISTINCT x) FROM unnest(p_titulo_ids) x) THEN
    RAISE EXCEPTION 'Título repetido na seleção';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes
                  WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;
  PERFORM public._validar_cronograma(p_cronograma, p_parcelas, p_valor_acordo);

  -- Ordem fixa de trava: dois acordos sobre o mesmo título não se cruzam.
  PERFORM 1 FROM public.titulos WHERE id = ANY (p_titulo_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_validos FROM public.titulos
   WHERE id = ANY (p_titulo_ids) AND company_id = v_company
     AND cliente_id = p_cliente_id AND deleted_at IS NULL;
  IF v_validos <> v_qtd THEN
    RAISE EXCEPTION 'Há título que não pertence a este cliente ou não está disponível';
  END IF;

  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    IF public._titulo_em_acordo_vigente(v_titulo) THEN
      RAISE EXCEPTION 'Há título já vinculado a um acordo ativo ou quebrado';
    END IF;
    v_saldo := public._saldo_titulo(v_titulo);
    IF v_saldo <= 0 THEN RAISE EXCEPTION 'Há título sem saldo em aberto na seleção'; END IF;
    v_saldo_total := v_saldo_total + v_saldo;
  END LOOP;

  -- O valor original que a tela mostrou tem de ser o que será liquidado. Se
  -- mudou (baixa entrou no meio), o acordo seria calculado sobre dívida velha.
  IF abs(v_saldo_total - COALESCE(p_valor_original, 0)) >= 0.01 THEN
    RAISE EXCEPTION 'O saldo dos títulos mudou para R$ %. Reabra o acordo para recalcular.',
      to_char(v_saldo_total, 'FM999999999990.00');
  END IF;

  INSERT INTO public.acordos (
    company_id, titulo_id, cliente_id, valor_original, valor_acordo, desconto,
    parcelas, valor_parcela, data_acordo, data_vencimento_primeira_parcela,
    status, observacoes, created_by
  ) VALUES (
    v_company, p_titulo_ids[1], p_cliente_id, v_saldo_total, round(p_valor_acordo, 2), p_desconto,
    p_parcelas, round(p_valor_parcela, 2), public.hoje_br(), p_data_vencimento_primeira_parcela,
    'ativo', p_observacoes, auth.uid()
  ) RETURNING id INTO v_acordo_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cronograma) LOOP
    INSERT INTO public.parcelas_acordo (
      company_id, acordo_id, numero_parcela, valor, valor_juros, valor_total, data_vencimento, status
    ) VALUES (
      v_company, v_acordo_id,
      (v_item->>'numero_parcela')::int, round((v_item->>'valor')::numeric, 2),
      round(COALESCE((v_item->>'valor_juros')::numeric, 0), 2),
      round((v_item->>'valor_total')::numeric, 2), (v_item->>'data_vencimento')::date, 'pendente'
    );
  END LOOP;

  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    INSERT INTO public.acordo_titulos (company_id, acordo_id, titulo_id)
      VALUES (v_company, v_acordo_id, v_titulo);
    PERFORM public.liquidar_parcelas_titulo(
      v_titulo, v_acordo_id, format('Liquidação por novação (acordo %s)', v_acordo_id));
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', v_acordo_id);
END $$;

-- Distribui nas parcelas do título, da mais antiga para a mais nova, o que
-- foi pago no acordo. Devolve quanto coube (o excedente — juros do acordo
-- pagos além da dívida original — não vira crédito).
CREATE OR REPLACE FUNCTION public._creditar_pagamentos_acordo(p_acordo_id uuid, p_valor numeric, p_motivo text)
RETURNS numeric LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; v_resta numeric := p_valor; v_parte numeric;
BEGIN
  FOR r IN
    SELECT p.id, public._saldo_parcela_titulo(p.id) AS saldo
      FROM public.parcelas p
      JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
     WHERE at.acordo_id = p_acordo_id AND p.deleted_at IS NULL
     ORDER BY p.vencimento, p.numero_parcela, p.id
  LOOP
    EXIT WHEN v_resta <= 0;
    CONTINUE WHEN r.saldo <= 0;
    v_parte := LEAST(r.saldo, v_resta);
    INSERT INTO public.movimentos_financeiros
      (parcela_titulo_id, tipo, valor, efeito, descricao, acordo_id, created_by)
    VALUES (r.id, 'credito_acordo', v_parte, -1,
      format('Crédito do que foi pago no acordo cancelado: %s', p_motivo), p_acordo_id, auth.uid());
    v_resta := v_resta - v_parte;
  END LOOP;
  RETURN p_valor - v_resta;
END $$;

DROP FUNCTION IF EXISTS public.cancelar_acordo(uuid);
CREATE FUNCTION public.cancelar_acordo(p_acordo_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acordo record; r record; v_estorno uuid; v_pago numeric; v_credito numeric := 0;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF v_motivo = '' THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório'; END IF;

  SELECT * INTO v_acordo FROM public.acordos
   WHERE id = p_acordo_id AND company_id = public.current_company_id()
     FOR UPDATE;
  IF v_acordo.id IS NULL THEN RAISE EXCEPTION 'Acordo não encontrado'; END IF;
  IF v_acordo.status = 'cancelado' THEN RAISE EXCEPTION 'Acordo já está cancelado'; END IF;
  IF v_acordo.status = 'cumprido' THEN
    RAISE EXCEPTION 'Acordo cumprido não pode ser cancelado: o cliente já pagou tudo. Se houve baixa errada, estorne-a antes.';
  END IF;

  PERFORM 1 FROM public.titulos t
    JOIN public.acordo_titulos at ON at.titulo_id = t.id
   WHERE at.acordo_id = p_acordo_id
   ORDER BY t.id FOR UPDATE OF t;

  -- 1. Desfaz a novação. Cada liquidação ganha seu lançamento de estorno,
  --    como no estorno manual: o histórico mostra quem desfez e por quê.
  FOR r IN
    SELECT m.* FROM public.movimentos_financeiros m
      JOIN public.parcelas p ON p.id = m.parcela_titulo_id
      JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
     WHERE at.acordo_id = p_acordo_id
       AND m.tipo = 'renegociacao'
       AND (m.acordo_id = p_acordo_id OR m.acordo_id IS NULL)
       AND NOT COALESCE(m.estornado, false)
       FOR UPDATE OF m
  LOOP
    INSERT INTO public.movimentos_financeiros
      (company_id, parcela_titulo_id, tipo, valor, efeito, descricao, acordo_id, created_by, estornado_por_id)
    VALUES (r.company_id, r.parcela_titulo_id, 'estorno', r.valor, 0,
      format('Estorno da novação — acordo cancelado: %s', v_motivo), p_acordo_id, auth.uid(), r.id)
    RETURNING id INTO v_estorno;
    UPDATE public.movimentos_financeiros SET estornado = true, estornado_por_id = v_estorno WHERE id = r.id;
  END LOOP;

  -- 2. O que o cliente pagou no acordo abate a dívida que voltou.
  SELECT COALESCE(sum(m.valor), 0) INTO v_pago
    FROM public.movimentos_financeiros m
    JOIN public.parcelas_acordo pa ON pa.id = m.parcela_acordo_id
   WHERE pa.acordo_id = p_acordo_id
     AND m.tipo IN ('pagamento_total', 'pagamento_parcial')
     AND NOT COALESCE(m.estornado, false);
  IF v_pago > 0 THEN
    v_credito := public._creditar_pagamentos_acordo(p_acordo_id, v_pago, v_motivo);
  END IF;

  UPDATE public.acordos
     SET status = 'cancelado', motivo_cancelamento = v_motivo, cancelado_em = now()
   WHERE id = p_acordo_id;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id,
    'pago_no_acordo', v_pago, 'creditado_no_titulo', v_credito, 'nao_creditado', v_pago - v_credito);
END $$;

-- Acordo com dinheiro lançado não é apagado: o crédito dado ao título e o
-- recebimento nos relatórios dependem desses lançamentos.
CREATE OR REPLACE FUNCTION public.excluir_acordos_definitivo(p_acordo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_alheios int; v_ativos int; v_com_dinheiro int;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_acordo_ids IS NULL OR array_length(p_acordo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT count(*) INTO v_alheios FROM public.acordos
     WHERE id = ANY (p_acordo_ids) AND company_id IS DISTINCT FROM public.current_company_id();
    IF v_alheios > 0 THEN RAISE EXCEPTION 'Há acordo(s) de outra empresa na seleção'; END IF;
  END IF;

  SELECT count(*) INTO v_ativos FROM public.acordos
   WHERE id = ANY (p_acordo_ids) AND status <> 'cancelado';
  IF v_ativos > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) não cancelado(s) na seleção. Cancele o acordo antes de excluí-lo definitivamente.', v_ativos;
  END IF;

  SELECT count(DISTINCT pa.acordo_id) INTO v_com_dinheiro
    FROM public.parcelas_acordo pa
    JOIN public.movimentos_financeiros m ON m.parcela_acordo_id = pa.id
   WHERE pa.acordo_id = ANY (p_acordo_ids)
     AND m.tipo IN ('pagamento_total', 'pagamento_parcial', 'desconto_concedido', 'juros_aplicado', 'multa_aplicada');
  IF v_com_dinheiro > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) com pagamento ou lançamento financeiro. Eles ficam no histórico e não podem ser excluídos.', v_com_dinheiro;
  END IF;

  PERFORM set_config('app.hard_delete', 'on', true);
  DELETE FROM public.acordos WHERE id = ANY (p_acordo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.hard_delete', 'off', true);

  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END $$;

-- Título em acordo quebrado também está preso à novação.
CREATE OR REPLACE FUNCTION public.cancelar_titulo(p_titulo_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo record;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  SELECT * INTO v_titulo FROM public.titulos
    WHERE id = p_titulo_id AND company_id = public.current_company_id()
      FOR UPDATE;
  IF v_titulo.id IS NULL THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF v_titulo.status = 'cancelado' THEN RAISE EXCEPTION 'Título já cancelado'; END IF;

  IF public._titulo_em_acordo_vigente(p_titulo_id) THEN
    RAISE EXCEPTION 'Título possui acordo ativo ou quebrado. Cancele o acordo antes de cancelar o título.';
  END IF;

  UPDATE public.titulos
    SET status = 'cancelado', deleted_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('motivo_cancelamento', p_motivo)
    WHERE id = p_titulo_id;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;
  UPDATE public.agendamentos SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END $$;

-- ─── Título manual (itens 9, 16) ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.criar_titulo_com_parcelas(
  p_cliente_id uuid, p_valor_original numeric, p_vencimento_original date,
  p_descricao text DEFAULT NULL, p_numero_documento character varying DEFAULT NULL,
  p_numero_parcelas integer DEFAULT 1, p_intervalo_dias integer DEFAULT 30,
  p_created_by uuid DEFAULT NULL)  -- mantido por compatibilidade; o autor é sempre auth.uid()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric := round(p_valor_original, 2);
  v_base numeric; v_titulo_id uuid; i int;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_numero_parcelas IS NULL OR p_numero_parcelas < 1 THEN RAISE EXCEPTION 'Número de parcelas inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes
                  WHERE id = p_cliente_id AND company_id = public.current_company_id() AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  INSERT INTO public.titulos (cliente_id, valor_original, vencimento_original, descricao, numero_documento, created_by)
  VALUES (p_cliente_id, v_total, p_vencimento_original, p_descricao, p_numero_documento, auth.uid())
  RETURNING id INTO v_titulo_id;

  -- Arredonda cada parcela e joga o resíduo na última: a soma fecha no centavo.
  v_base := round(v_total / p_numero_parcelas, 2);
  FOR i IN 1..p_numero_parcelas LOOP
    INSERT INTO public.parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_titulo_id, i,
      CASE WHEN i = p_numero_parcelas THEN v_total - v_base * (p_numero_parcelas - 1) ELSE v_base END,
      p_vencimento_original + ((i - 1) * p_intervalo_dias));
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'parcelas_criadas', p_numero_parcelas);
END $$;

-- ─── Importação: planilha e API v1 (itens 4, 5) ───────────────────────────

-- Título "com história": já recebeu dinheiro, desconto, encargo ou entrou em
-- acordo. Daí em diante o reenvio não reescreve parcela.
CREATE OR REPLACE FUNCTION public._titulo_tem_historico(p_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.movimentos_financeiros m
             JOIN public.parcelas p ON p.id = m.parcela_titulo_id
            WHERE p.titulo_id = p_titulo_id AND m.tipo <> 'emissao_parcela')
      OR EXISTS (SELECT 1 FROM public.acordo_titulos WHERE titulo_id = p_titulo_id);
$$;

-- Grava uma parcela recebida. Devolve true se criou ou alterou.
CREATE OR REPLACE FUNCTION public._importar_parcela(
  p_company uuid, p_titulo_id uuid, p_doc text, p_travado boolean,
  p_numero int, p_valor numeric, p_vencimento date)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_atual record; v_valor numeric := round(p_valor, 2);
BEGIN
  SELECT id, valor_nominal, vencimento INTO v_atual
    FROM public.parcelas WHERE titulo_id = p_titulo_id AND numero_parcela = p_numero;

  IF v_atual.id IS NULL THEN
    IF p_travado THEN
      RAISE EXCEPTION 'Título %: já tem pagamento ou acordo e não aceita parcela nova (parcela %)', p_doc, p_numero;
    END IF;
    INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (p_company, p_titulo_id, p_numero, v_valor, p_vencimento);
    RETURN true;
  END IF;

  IF v_atual.valor_nominal = v_valor AND v_atual.vencimento = p_vencimento THEN
    RETURN false;
  END IF;

  IF p_travado THEN
    RAISE EXCEPTION 'Título %: a parcela % já tem movimentação e não muda pelo reenvio (R$ % em % → R$ % em %). Ajuste pelo sistema.',
      p_doc, p_numero,
      to_char(v_atual.valor_nominal, 'FM999999999990.00'), to_char(v_atual.vencimento, 'DD/MM/YYYY'),
      to_char(v_valor, 'FM999999999990.00'), to_char(p_vencimento, 'DD/MM/YYYY');
  END IF;

  UPDATE public.parcelas SET valor_nominal = v_valor, vencimento = p_vencimento WHERE id = v_atual.id;
  RETURN true;
END $$;

-- Lança a baixa informada como "pago". Devolve um aviso quando não lança.
-- Só quita o que ainda resta; nunca paga parcela renegociada ou estornada.
CREATE OR REPLACE FUNCTION public._importar_baixa(
  p_company uuid, p_actor uuid, p_titulo_id uuid, p_doc text, p_numero int, p_origem text)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_parcela uuid; v_saldo numeric;
BEGIN
  SELECT id INTO v_parcela FROM public.parcelas
   WHERE titulo_id = p_titulo_id AND numero_parcela = p_numero AND deleted_at IS NULL;
  IF v_parcela IS NULL THEN RETURN NULL; END IF;

  IF public._titulo_em_acordo_vigente(p_titulo_id) THEN
    RETURN format('Título %s, parcela %s: título em acordo — a baixa informada não foi lançada.', p_doc, p_numero);
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentos_financeiros
              WHERE parcela_titulo_id = v_parcela
                AND tipo IN ('pagamento_total', 'pagamento_parcial') AND estornado) THEN
    RETURN format('Título %s, parcela %s: a baixa foi estornada no sistema — não foi relançada.', p_doc, p_numero);
  END IF;

  v_saldo := public._saldo_parcela_titulo(v_parcela);
  IF v_saldo IS NULL OR v_saldo <= 0 THEN RETURN NULL; END IF;

  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_company, v_parcela, 'pagamento_total', v_saldo, -1,
    format('Pagamento importado via %s', p_origem), p_actor);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._importar_titulo_completo(
  p_company uuid, p_actor uuid, p_cliente_nome text, p_cpf_cnpj text, p_numero_documento text,
  p_parcelas jsonb, p_contato text DEFAULT NULL, p_descricao text DEFAULT NULL,
  p_cobrador text DEFAULT NULL, p_vendedor text DEFAULT NULL, p_cidade text DEFAULT NULL,
  p_estado text DEFAULT NULL, p_origem text DEFAULT 'planilha')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := p_company;
  v_doc text := NULLIF(btrim(COALESCE(p_numero_documento, '')), '');
  v_cidade text := NULLIF(btrim(COALESCE(p_cidade, '')), '');
  v_estado text := NULLIF(btrim(COALESCE(p_estado, '')), '');
  v_cpf text := regexp_replace(COALESCE(p_cpf_cnpj, ''), '[^0-9]', '', 'g');
  v_cliente_id uuid; v_cobrador_id uuid; v_vendedor_id uuid; v_titulo_id uuid; v_titulo_cliente uuid;
  v_parc jsonb; v_num int; v_valor numeric; v_venc date;
  v_total numeric := 0; v_venc_min date; v_processadas int := 0;
  v_existia boolean; v_travado boolean := false; v_mudou boolean := false;
  v_aviso text; v_avisos text[] := '{}';
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;
  IF length(v_cpf) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF/CNPJ inválido'; END IF;
  IF COALESCE(btrim(p_cliente_nome), '') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;
  -- Sem o número, cada reimportação criaria um título novo e a dívida dobraria.
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Informe o número do título (Nº TITULO)'; END IF;
  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Título sem parcelas';
  END IF;

  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_num := (v_parc->>'numero')::int;
    v_valor := (v_parc->>'valor')::numeric;
    v_venc := (v_parc->>'vencimento')::date;
    IF v_num IS NULL OR v_num < 1 THEN RAISE EXCEPTION 'Número de parcela inválido'; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de parcela inválido'; END IF;
    IF v_venc IS NULL THEN RAISE EXCEPTION 'Vencimento de parcela inválido'; END IF;
    v_total := v_total + round(v_valor, 2);
    v_venc_min := LEAST(COALESCE(v_venc_min, v_venc), v_venc);
  END LOOP;

  IF p_cobrador IS NOT NULL AND length(btrim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
     WHERE company_id = v_company AND lower(nome) = lower(btrim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, btrim(p_cobrador), p_actor) RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  IF p_vendedor IS NOT NULL AND length(btrim(p_vendedor)) > 0 THEN
    SELECT id INTO v_vendedor_id FROM public.vendedores
     WHERE company_id = v_company AND lower(nome) = lower(btrim(p_vendedor)) AND deleted_at IS NULL;
    IF v_vendedor_id IS NULL THEN
      INSERT INTO public.vendedores (company_id, nome, created_by)
      VALUES (v_company, btrim(p_vendedor), p_actor) RETURNING id INTO v_vendedor_id;
    END IF;
  END IF;

  SELECT id INTO v_cliente_id FROM public.clientes WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cidade, estado, cobrador_id, vendedor_id, created_by)
    VALUES (v_company, btrim(p_cliente_nome), v_cpf, NULLIF(btrim(COALESCE(p_contato, '')), ''),
            v_cidade, v_estado, v_cobrador_id, v_vendedor_id, p_actor)
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes SET
      cobrador_id = COALESCE(v_cobrador_id, cobrador_id),
      vendedor_id = COALESCE(v_vendedor_id, vendedor_id),
      cidade = COALESCE(v_cidade, cidade),
      estado = COALESCE(v_estado, estado)
    WHERE id = v_cliente_id;
  END IF;

  -- Título: o número identifica o reenvio. Travado para serializar com baixa
  -- e acordo que estejam acontecendo ao mesmo tempo.
  SELECT id, cliente_id INTO v_titulo_id, v_titulo_cliente FROM public.titulos
   WHERE company_id = v_company AND numero_documento = v_doc AND deleted_at IS NULL
     FOR UPDATE;
  v_existia := v_titulo_id IS NOT NULL;

  IF v_existia THEN
    IF v_titulo_cliente <> v_cliente_id THEN
      RAISE EXCEPTION 'Título % já existe para outro cliente', v_doc;
    END IF;
    v_travado := public._titulo_tem_historico(v_titulo_id);
  ELSE
    INSERT INTO public.titulos (company_id, cliente_id, numero_documento, valor_original, vencimento_original, descricao, created_by)
    VALUES (v_company, v_cliente_id, v_doc, v_total, v_venc_min, NULLIF(btrim(COALESCE(p_descricao, '')), ''), p_actor)
    RETURNING id INTO v_titulo_id;
  END IF;

  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_num := (v_parc->>'numero')::int;
    -- IF, e não `f(...) OR v_mudou`: o planner pode dobrar `x OR true` para
    -- true sem chamar a função — e a parcela não seria gravada.
    IF public._importar_parcela(v_company, v_titulo_id, v_doc, v_travado, v_num,
         (v_parc->>'valor')::numeric, (v_parc->>'vencimento')::date) THEN
      v_mudou := true;
    END IF;

    IF COALESCE((v_parc->>'pago')::boolean, false) THEN
      v_aviso := public._importar_baixa(v_company, p_actor, v_titulo_id, v_doc, v_num, p_origem);
      IF v_aviso IS NOT NULL THEN v_avisos := v_avisos || v_aviso; END IF;
    END IF;
    v_processadas := v_processadas + 1;
  END LOOP;

  -- valor_original só acompanha as parcelas enquanto o título não tem história.
  IF v_mudou THEN
    UPDATE public.titulos t SET
      valor_original = COALESCE((SELECT sum(valor_nominal) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.valor_original),
      vencimento_original = COALESCE((SELECT min(vencimento) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.vencimento_original)
    WHERE t.id = v_titulo_id;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'cliente_id', v_cliente_id,
    'novo', NOT v_existia,
    'parcelas_processadas', v_processadas,
    'avisos', to_jsonb(v_avisos)
  );
END $$;

-- Versão antiga de importação (uma parcela, sem número de título). Ninguém
-- chama desde a importação completa, e ela criaria título duplicado.
DROP FUNCTION IF EXISTS public.importar_titulo(uuid, text, text, numeric, date, text, text, text, text);

-- ─── Recebimentos (itens 3 e 11) ──────────────────────────────────────────

-- * Pagamento de acordo cancelado continua sendo dinheiro recebido: com o
--   crédito no título (item 3), ele não pode sumir dos relatórios.
-- * `titulo_ids` leva todos os títulos do acordo; `titulo_id` continua sendo
--   o "principal" só por compatibilidade.
CREATE OR REPLACE VIEW public.vw_recebimentos AS
SELECT m.id AS recebimento_id,
       CASE WHEN m.parcela_titulo_id IS NOT NULL THEN 'titulo' ELSE 'acordo' END AS origem,
       m.company_id,
       COALESCE(pt.titulo_id, a.titulo_id) AS titulo_id,
       pa.acordo_id,
       m.valor::numeric AS valor,
       m.data_evento AS data_recebimento,
       m.meio_pagamento,
       COALESCE(t.cliente_id, a.cliente_id) AS cliente_id,
       CASE WHEN pt.titulo_id IS NOT NULL THEN ARRAY[pt.titulo_id]
            ELSE (SELECT array_agg(at.titulo_id ORDER BY at.titulo_id)
                    FROM public.acordo_titulos at WHERE at.acordo_id = pa.acordo_id)
       END AS titulo_ids
  FROM public.movimentos_financeiros m
  LEFT JOIN public.parcelas pt ON pt.id = m.parcela_titulo_id
  LEFT JOIN public.parcelas_acordo pa ON pa.id = m.parcela_acordo_id
  LEFT JOIN public.acordos a ON a.id = pa.acordo_id
  LEFT JOIN public.titulos t ON t.id = pt.titulo_id
 WHERE m.tipo = ANY (ARRAY['pagamento_total', 'pagamento_parcial'])
   AND NOT COALESCE(m.estornado, false)
   AND (m.parcela_titulo_id IS NOT NULL OR pa.deleted_at IS NULL);

CREATE OR REPLACE VIEW public.vw_recebimentos_tenant AS
SELECT recebimento_id, origem, company_id, titulo_id, acordo_id, valor,
       data_recebimento, meio_pagamento, cliente_id, titulo_ids
  FROM public.vw_recebimentos
 WHERE (public.is_super_admin() OR company_id = public.current_company_id())
   AND public.cobrador_ve_cliente(cliente_id);

-- ─── Grants ───────────────────────────────────────────────────────────────
-- Funções recriadas com assinatura nova nascem fechadas (default de
-- 20260929120000). As que o app chama voltam para authenticated.
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_parcela(uuid, numeric, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conceder_desconto_parcela(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_encargo_parcela(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_acordo(uuid, text) TO authenticated;
-- hoje_br é default de coluna e pode aparecer em consulta do app.
GRANT EXECUTE ON FUNCTION public.hoje_br() TO authenticated;

DO $$
DECLARE v_anon text; v_auth text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname <> 'role_rank'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_anon IS NOT NULL THEN RAISE EXCEPTION 'anon executa: %', v_anon; END IF;

  SELECT string_agg(p.proname, ', ') INTO v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.proname LIKE '\_%'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_auth IS NOT NULL THEN RAISE EXCEPTION 'authenticated executa função interna: %', v_auth; END IF;
END $$;
