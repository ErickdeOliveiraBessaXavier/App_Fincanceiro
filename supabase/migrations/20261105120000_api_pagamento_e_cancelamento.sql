-- API v1: baixa avulsa (valor parcial, data real, meio de pagamento) e
-- cancelamento de título pelo ERP.
--
-- As duas funções são INTERNAS: só a Edge Function api-v1 (service role) as
-- chama. A empresa e o ator vêm da chave de API resolvida, nunca do corpo. Por
-- isso não usam current_company_id()/auth.uid(), e não recebem grant para
-- anon/authenticated (regra do projeto).
--
-- As regras são as mesmas das telas (registrar_pagamento_parcela e
-- cancelar_titulo). Muda só a forma de achar o título (pelo numero_documento) e
-- a idempotência, que uma chamada de máquina precisa: o ERP repete a chamada
-- quando a rede cai e não pode lançar o pagamento duas vezes.

-- ===================== Identificador do pagamento no ERP =====================

ALTER TABLE public.movimentos_financeiros
  ADD COLUMN IF NOT EXISTS id_externo text;

COMMENT ON COLUMN public.movimentos_financeiros.id_externo IS
  'Identificador do pagamento no sistema de origem (id_pagamento da API). Único por empresa: reenviar o mesmo id não lança de novo.';

CREATE UNIQUE INDEX IF NOT EXISTS movimentos_financeiros_id_externo_unico
  ON public.movimentos_financeiros (company_id, id_externo)
  WHERE id_externo IS NOT NULL;

-- ===================== Helpers =====================

-- Título ativo da empresa pelo número, travado: o título é o ponto único de
-- serialização de toda escrita nas parcelas (ver _travar_parcela_titulo).
CREATE OR REPLACE FUNCTION public._api_travar_titulo(p_company uuid, p_numero_documento text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_titulo uuid;
BEGIN
  SELECT id INTO v_titulo FROM public.titulos
   WHERE company_id = p_company
     AND numero_documento = btrim(p_numero_documento)
     AND deleted_at IS NULL
     FOR UPDATE;
  RETURN v_titulo;
END $$;

-- ===================== Baixa avulsa =====================

CREATE OR REPLACE FUNCTION public._api_registrar_pagamento(
  p_company uuid, p_actor uuid, p_numero_documento text, p_numero_parcela int,
  p_id_externo text, p_valor numeric, p_data_pagamento date DEFAULT NULL,
  p_meio_pagamento text DEFAULT NULL, p_descricao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id_externo text := btrim(p_id_externo);
  v_valor numeric := round(p_valor, 2);
  v_data date := COALESCE(p_data_pagamento, public.hoje_br());
  v_titulo uuid; v_parcela uuid; v_saldo numeric; v_tipo text; v_evento uuid;
  v_existente record; v_result jsonb;
BEGIN
  IF v_id_externo IS NULL OR v_id_externo = '' THEN RAISE EXCEPTION 'Informe id_pagamento'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF v_data > public.hoje_br() THEN RAISE EXCEPTION 'A data do pagamento não pode ser futura'; END IF;

  v_titulo := public._api_travar_titulo(p_company, p_numero_documento);
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Nenhum título ativo com numero_documento %', btrim(p_numero_documento)
      USING HINT = 'titulo_nao_encontrado';
  END IF;

  -- Idempotência, depois da trava: duas chamadas iguais em paralelo se
  -- enfileiram no título e a segunda acha o lançamento da primeira.
  SELECT m.id, m.valor, m.data_evento, m.estornado, m.parcela_titulo_id, p.titulo_id, p.numero_parcela
    INTO v_existente
    FROM public.movimentos_financeiros m
    JOIN public.parcelas p ON p.id = m.parcela_titulo_id
   WHERE m.company_id = p_company AND m.id_externo = v_id_externo;
  IF FOUND THEN
    IF v_existente.titulo_id <> v_titulo OR v_existente.numero_parcela <> p_numero_parcela
       OR v_existente.valor <> v_valor THEN
      RAISE EXCEPTION 'id_pagamento % já foi usado em outro pagamento (outro título, parcela ou valor)', v_id_externo;
    END IF;
    RETURN jsonb_build_object(
      'sucesso', true, 'repetido', true,
      -- Estornado do nosso lado: o estorno prevalece e o reenvio não relança.
      'estornado', COALESCE(v_existente.estornado, false),
      'id_pagamento', v_id_externo, 'parcela', v_existente.numero_parcela,
      'valor_pago', v_existente.valor, 'data_pagamento', v_existente.data_evento,
      'saldo_atual', public._saldo_parcela_titulo(v_existente.parcela_titulo_id));
  END IF;

  SELECT id INTO v_parcela FROM public.parcelas
   WHERE titulo_id = v_titulo AND numero_parcela = p_numero_parcela AND deleted_at IS NULL;
  IF v_parcela IS NULL THEN
    RAISE EXCEPTION 'O título % não tem a parcela %', btrim(p_numero_documento), p_numero_parcela
      USING HINT = 'parcela_nao_encontrada';
  END IF;

  IF public._titulo_em_acordo_vigente(v_titulo) THEN
    RAISE EXCEPTION 'Título renegociado em acordo: o pagamento acontece nas parcelas do acordo';
  END IF;

  v_saldo := public._saldo_parcela_titulo(v_parcela);
  IF v_saldo <= 0 THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF v_valor > v_saldo THEN
    RAISE EXCEPTION 'Valor excede o saldo devedor da parcela (R$ %)', to_char(v_saldo, 'FM999999999990.00');
  END IF;

  v_tipo := CASE WHEN v_valor = v_saldo THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.movimentos_financeiros
    (company_id, parcela_titulo_id, tipo, valor, efeito, meio_pagamento, descricao,
     data_evento, created_by, id_externo)
  VALUES (p_company, v_parcela, v_tipo, v_valor, -1, p_meio_pagamento,
    COALESCE(NULLIF(btrim(p_descricao), ''), format('Pagamento de R$ %s informado pelo ERP',
      to_char(v_valor, 'FM999999999990.00'))),
    v_data, p_actor, v_id_externo)
  RETURNING id INTO v_evento;

  v_result := jsonb_build_object(
    'sucesso', true, 'repetido', false, 'estornado', false,
    'id_pagamento', v_id_externo, 'parcela', p_numero_parcela, 'tipo', v_tipo,
    'valor_pago', v_valor, 'data_pagamento', v_data,
    'saldo_anterior', v_saldo, 'saldo_atual', v_saldo - v_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (p_company, p_actor, 'rpc', 'movimentos_financeiros', v_evento,
    jsonb_build_object('rpc', '_api_registrar_pagamento', 'result', v_result));
  RETURN v_result;
END $$;

-- ===================== Cancelamento =====================

CREATE OR REPLACE FUNCTION public._api_cancelar_titulo(
  p_company uuid, p_actor uuid, p_numero_documento text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_titulo uuid; v_doc text := btrim(p_numero_documento);
BEGIN
  v_titulo := public._api_travar_titulo(p_company, v_doc);
  IF v_titulo IS NULL THEN
    -- Cancelar de novo não é erro: o ERP pode repetir a chamada.
    IF EXISTS (SELECT 1 FROM public.titulos
                WHERE company_id = p_company AND numero_documento = v_doc AND status = 'cancelado') THEN
      RETURN jsonb_build_object('sucesso', true, 'numero_documento', v_doc,
        'situacao', 'cancelado', 'ja_estava_cancelado', true);
    END IF;
    RAISE EXCEPTION 'Nenhum título com numero_documento %', v_doc USING HINT = 'titulo_nao_encontrado';
  END IF;

  IF public._titulo_em_acordo_vigente(v_titulo) THEN
    RAISE EXCEPTION 'Título em acordo ativo ou quebrado: a equipe de cobrança precisa cancelar o acordo antes';
  END IF;
  IF public._titulo_tem_dinheiro_registrado(v_titulo) THEN
    RAISE EXCEPTION 'Título tem pagamento registrado (ou foi quitado por acordo): a equipe de cobrança precisa estornar o pagamento antes';
  END IF;

  UPDATE public.titulos
     SET status = 'cancelado', deleted_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb)
           || jsonb_build_object('motivo_cancelamento', NULLIF(btrim(p_motivo), ''), 'cancelado_via', 'API')
   WHERE id = v_titulo;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = v_titulo AND deleted_at IS NULL;
  UPDATE public.agendamentos SET deleted_at = now() WHERE titulo_id = v_titulo AND deleted_at IS NULL;

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (p_company, p_actor, 'rpc', 'titulos', v_titulo,
    jsonb_build_object('rpc', '_api_cancelar_titulo', 'motivo', p_motivo));

  RETURN jsonb_build_object('sucesso', true, 'numero_documento', v_doc,
    'situacao', 'cancelado', 'ja_estava_cancelado', false);
END $$;

-- ===================== Privilégios =====================

REVOKE ALL ON FUNCTION public._api_travar_titulo(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._api_registrar_pagamento(uuid, uuid, text, int, text, numeric, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._api_cancelar_titulo(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._api_registrar_pagamento(uuid, uuid, text, int, text, numeric, date, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._api_cancelar_titulo(uuid, uuid, text, text) TO service_role;
-- As funções acima rodam com o papel de quem chama (service_role): os helpers
-- que elas usam precisam ser executáveis por ele. Explícito, em vez de
-- depender dos default privileges do Supabase.
GRANT EXECUTE ON FUNCTION public._api_travar_titulo(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._titulo_tem_dinheiro_registrado(uuid) TO service_role;

-- Conferência pelo privilégio real, não pelo DDL.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._api_travar_titulo(uuid,text)',
    'public._api_registrar_pagamento(uuid,uuid,text,integer,text,numeric,date,text,text)',
    'public._api_cancelar_titulo(uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'Função % ficou executável por anon/authenticated', f;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role',
       'public._api_registrar_pagamento(uuid,uuid,text,integer,text,numeric,date,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public._api_cancelar_titulo(uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role sem EXECUTE nas funções da API';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
