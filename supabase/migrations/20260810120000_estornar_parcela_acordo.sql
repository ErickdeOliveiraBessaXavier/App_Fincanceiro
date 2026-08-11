-- ============================================================================
-- Estorno da baixa de uma parcela de ACORDO
--
-- Baixa errada em parcela de TÍTULO já tinha desfazer (estornar_pagamento, com
-- motivo obrigatório). Em parcela de acordo não havia caminho nenhum: uma baixa
-- lançada na parcela errada ficava, e acordo é justamente onde o dinheiro entra
-- parcelado — o erro é mais provável ali, não menos.
--
-- Simétrico a pagar_parcela_acordo: mesma checagem de papel, mesmo isolamento
-- por company_id. Volta a parcela para 'pendente' e limpa a data; o trigger
-- update_acordo_status recomputa o acordo (de 'cumprido' de volta para 'ativo').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.estornar_parcela_acordo(
  p_parcela_acordo_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  -- Estornar é correção de erro operacional: exige admin, um degrau acima de
  -- quem registra a baixa (operador), igual ao estorno de parcela de título.
  IF NOT public.has_min_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo do estorno é obrigatório';
  END IF;

  SELECT * INTO v_row
    FROM public.parcelas_acordo
   WHERE id = p_parcela_acordo_id
     AND company_id = public.current_company_id();

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Parcela do acordo não encontrada';
  END IF;

  IF v_row.status <> 'paga' AND v_row.data_pagamento IS NULL THEN
    RAISE EXCEPTION 'Parcela do acordo não está paga';
  END IF;

  UPDATE public.parcelas_acordo
     SET status = 'pendente',
         data_pagamento = NULL,
         updated_at = now()
   WHERE id = p_parcela_acordo_id;

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (
    public.current_company_id(),
    auth.uid(),
    'rpc',
    'parcelas_acordo',
    p_parcela_acordo_id,
    jsonb_build_object(
      'rpc', 'estornar_parcela_acordo',
      'motivo', p_motivo,
      'acordo_id', v_row.acordo_id,
      'numero_parcela', v_row.numero_parcela,
      'data_pagamento_anterior', v_row.data_pagamento
    )
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'parcela_acordo_id', p_parcela_acordo_id,
    'acordo_id', v_row.acordo_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estornar_parcela_acordo(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.estornar_parcela_acordo(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.estornar_parcela_acordo(uuid, text) IS
  'Desfaz a baixa de uma parcela de acordo (admin+, motivo obrigatório). Registra em audit_log.';
