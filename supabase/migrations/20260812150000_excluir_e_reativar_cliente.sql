-- ============================================================================
-- Exclusão de cliente: apagar de verdade quando não há o que preservar
--
-- Até aqui toda exclusão era soft delete. O registro continuava ocupando o par
-- (company_id, cpf_cnpj) da constraint única, então recadastrar o mesmo CPF
-- estourava 409 — sem que a tela soubesse explicar por quê, já que a RLS
-- esconde os excluídos e a consulta de checagem nem os enxerga.
--
-- O que separa os dois casos é HISTÓRICO:
--
--   * Cliente sem nenhum vínculo (cadastro digitado errado, criado por engano)
--     é apagado de verdade. Não há nada a preservar e o CPF fica livre.
--
--   * Cliente com título, acordo, comunicação, agendamento, anexo ou envio de
--     campanha continua em soft delete. Apagá-lo levaria junto o histórico
--     financeiro — relatórios de meses fechados mudariam retroativamente. Para
--     esse caso existe `reativar_cliente`.
--
-- Hard delete de cliente COM histórico nem seria possível: titulos.cliente_id
-- não tem ON DELETE, e titulos/parcelas/movimentos_financeiros têm o trigger
-- prevent_hard_delete_financial. A arquitetura já havia decidido isso.
-- ============================================================================

-- ============== 1. Existe algo que valha preservar? ==============
CREATE OR REPLACE FUNCTION public.cliente_tem_historico(p_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Títulos e acordos entram mesmo cancelados/excluídos: cancelado continua
  -- sendo registro do que aconteceu.
  SELECT EXISTS (SELECT 1 FROM public.titulos        WHERE cliente_id = p_cliente_id)
      OR EXISTS (SELECT 1 FROM public.acordos        WHERE cliente_id = p_cliente_id)
      OR EXISTS (SELECT 1 FROM public.comunicacoes   WHERE cliente_id = p_cliente_id)
      OR EXISTS (SELECT 1 FROM public.agendamentos   WHERE cliente_id = p_cliente_id)
      OR EXISTS (SELECT 1 FROM public.anexos         WHERE cliente_id = p_cliente_id)
      OR EXISTS (SELECT 1 FROM public.campanha_envios WHERE cliente_id = p_cliente_id);
$$;

REVOKE EXECUTE ON FUNCTION public.cliente_tem_historico(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cliente_tem_historico(uuid) TO authenticated;

COMMENT ON FUNCTION public.cliente_tem_historico(uuid) IS
  'Se o cliente tem qualquer vínculo que justifique preservar o registro na exclusão.';

-- ============== 2. Exclusão ==============
CREATE OR REPLACE FUNCTION public.excluir_cliente(p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_tem_historico boolean;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Operação restrita a administradores';
  END IF;

  v_company := public.current_company_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.acordos WHERE cliente_id = p_cliente_id AND status = 'ativo') THEN
    RAISE EXCEPTION 'Cliente possui acordo ativo — cancele o acordo antes de excluir';
  END IF;

  IF public.cliente_tem_titulo_em_aberto(p_cliente_id) THEN
    RAISE EXCEPTION 'Cliente possui títulos em aberto — quite ou cancele antes de excluir';
  END IF;

  v_tem_historico := public.cliente_tem_historico(p_cliente_id);

  IF v_tem_historico THEN
    -- Some das telas e fica no banco. Junto vão a agenda de retornos e o
    -- histórico de contato, que só fazem sentido com o cliente.
    UPDATE public.clientes     SET deleted_at = now() WHERE id = p_cliente_id;
    UPDATE public.agendamentos SET deleted_at = now() WHERE cliente_id = p_cliente_id AND deleted_at IS NULL;
    UPDATE public.comunicacoes SET deleted_at = now() WHERE cliente_id = p_cliente_id AND deleted_at IS NULL;

    RETURN jsonb_build_object('sucesso', true, 'modo', 'arquivado', 'cliente_id', p_cliente_id);
  END IF;

  -- Sem vínculo nenhum: apaga mesmo. O trigger de auditoria registra o DELETE,
  -- então o rastro da operação não se perde.
  DELETE FROM public.clientes WHERE id = p_cliente_id;

  RETURN jsonb_build_object('sucesso', true, 'modo', 'removido', 'cliente_id', p_cliente_id);
END; $$;

COMMENT ON FUNCTION public.excluir_cliente(uuid) IS
  'Apaga o cliente quando não há histórico; arquiva (soft delete) quando há. Devolve modo = removido|arquivado.';

-- ============== 3. Localizar um cliente arquivado ==============
-- A RLS esconde os excluídos, então uma consulta comum devolve "não existe" e
-- o INSERT seguinte estoura 409 sem explicação. Esta função enxerga o arquivado
-- para a tela conseguir oferecer a reativação.
CREATE OR REPLACE FUNCTION public.buscar_cliente_arquivado(p_cpf_cnpj text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
  v_cliente record;
BEGIN
  -- Quem cadastra cliente é operador+; ele precisa entender o erro mesmo sem
  -- poder reativar.
  IF NOT public.has_min_role(auth.uid(),'operador') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_cpf = '' THEN RETURN NULL; END IF;

  SELECT c.id, c.nome, c.cpf_cnpj, c.deleted_at
    INTO v_cliente
    FROM public.clientes c
   WHERE c.company_id = public.current_company_id()
     AND c.cpf_cnpj = v_cpf
     AND c.deleted_at IS NOT NULL;

  IF v_cliente.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_cliente.id,
    'nome', v_cliente.nome,
    'cpf_cnpj', v_cliente.cpf_cnpj,
    'deleted_at', v_cliente.deleted_at,
    'titulos', (SELECT count(*) FROM public.titulos WHERE cliente_id = v_cliente.id),
    'acordos', (SELECT count(*) FROM public.acordos WHERE cliente_id = v_cliente.id)
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.buscar_cliente_arquivado(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buscar_cliente_arquivado(text) TO authenticated;

COMMENT ON FUNCTION public.buscar_cliente_arquivado(text) IS
  'Cliente arquivado (soft delete) com este CPF/CNPJ na empresa, com a contagem do histórico. NULL se não houver.';

-- ============== 4. Reativação ==============
-- Mesmo CPF na mesma empresa é a mesma pessoa: reativar traz o cadastro e o
-- histórico de volta, em vez de criar um segundo registro que deixaria a
-- dívida antiga pendurada num cliente invisível.
--
-- Exige admin: a exclusão foi decisão de admin, desfazê-la é do mesmo nível.
CREATE OR REPLACE FUNCTION public.reativar_cliente(
  p_cliente_id uuid,
  p_dados      jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Reativar cadastro é restrito a administradores';
  END IF;

  v_company := public.current_company_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cadastro arquivado não encontrado';
  END IF;

  -- Campo ausente no jsonb mantém o valor guardado; string vazia também, para
  -- um formulário parcialmente preenchido não apagar dado antigo.
  UPDATE public.clientes SET
    deleted_at        = NULL,
    nome              = COALESCE(NULLIF(p_dados->>'nome', ''), nome),
    telefone          = COALESCE(NULLIF(p_dados->>'telefone', ''), telefone),
    email             = COALESCE(NULLIF(p_dados->>'email', ''), email),
    endereco_completo = COALESCE(NULLIF(p_dados->>'endereco_completo', ''), endereco_completo),
    cep               = COALESCE(NULLIF(p_dados->>'cep', ''), cep),
    cidade            = COALESCE(NULLIF(p_dados->>'cidade', ''), cidade),
    estado            = COALESCE(NULLIF(p_dados->>'estado', ''), estado),
    observacoes       = COALESCE(NULLIF(p_dados->>'observacoes', ''), observacoes),
    cobrador_id       = COALESCE((NULLIF(p_dados->>'cobrador_id', ''))::uuid, cobrador_id),
    vendedor_id       = COALESCE((NULLIF(p_dados->>'vendedor_id', ''))::uuid, vendedor_id),
    updated_at        = now()
  WHERE id = p_cliente_id;

  -- Devolve o que a exclusão havia ocultado junto.
  UPDATE public.agendamentos SET deleted_at = NULL WHERE cliente_id = p_cliente_id;
  UPDATE public.comunicacoes SET deleted_at = NULL WHERE cliente_id = p_cliente_id;

  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (v_company, auth.uid(), 'rpc', 'clientes', p_cliente_id,
    jsonb_build_object('rpc','reativar_cliente','dados',p_dados));

  RETURN jsonb_build_object('sucesso', true, 'cliente_id', p_cliente_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.reativar_cliente(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reativar_cliente(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.reativar_cliente(uuid, jsonb) IS
  'Desfaz o arquivamento do cliente e devolve agendamentos e comunicações (admin+).';

NOTIFY pgrst, 'reload schema';
