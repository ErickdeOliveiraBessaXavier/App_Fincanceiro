-- ============================================================================
-- Agendamento de retorno: uma porta de escrita só
--
-- Existiam DUAS portas para o mesmo evento de domínio:
--
--   * registrar_resultado_cobranca() — RPC com validação de papel e posse do
--     cliente, que grava a comunicação e o próximo contato de forma atômica.
--   * um INSERT cru de `AgendamentoModal`, direto na tabela, liberado pela
--     policy `agendamentos_insert` para qualquer operador autenticado.
--
-- Toda regra escrita numa das portas era contornada pela outra. Foi exatamente
-- o que aconteceu com o aviso de retorno duplicado: o modal avisa que "os dois
-- vão coexistir", e o caminho que o cobrador mais usa — Registrar contato —
-- não avisa nada, porque a regra morava na tela e não no domínio.
--
-- Esta migration é a metade ADITIVA da mudança: cria a RPC e mais nada. A
-- revogação do INSERT direto e a invariante de um retorno por cliente ficam em
-- 20260826130000. Enquanto houver INSERT direto, qualquer invariante é
-- decorativa — mas fechar a porta exige que o front novo já esteja no ar.
-- ============================================================================

-- ============== 1. A porta ==============
-- Espelha a validação de registrar_resultado_cobranca: mesmo papel mínimo,
-- mesma checagem de posse do cliente pela empresa corrente. SECURITY DEFINER
-- segue o padrão das demais RPCs do projeto.
CREATE OR REPLACE FUNCTION public.agendar_retorno(
  p_cliente_id uuid,
  p_data_agendamento timestamptz,
  p_tipo_evento text DEFAULT 'agendamento',
  p_descricao text DEFAULT NULL,
  p_titulo_id uuid DEFAULT NULL,
  p_acordo_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_agendamento_id uuid;
BEGIN
  IF NOT public.has_min_role(v_user, 'operador') THEN
    RAISE EXCEPTION 'Operação restrita a operadores de cobrança';
  END IF;

  IF p_data_agendamento IS NULL THEN
    RAISE EXCEPTION 'Data do retorno é obrigatória';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  INSERT INTO public.agendamentos (
    company_id, cliente_id, titulo_id, acordo_id, tipo_evento, status,
    descricao, data_agendamento, created_by
  ) VALUES (
    v_company, p_cliente_id, p_titulo_id, p_acordo_id,
    COALESCE(p_tipo_evento, 'agendamento'), 'pendente',
    p_descricao, p_data_agendamento, v_user
  ) RETURNING id INTO v_agendamento_id;

  RETURN jsonb_build_object('sucesso', true, 'agendamento_id', v_agendamento_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.agendar_retorno(uuid, timestamptz, text, text, uuid, uuid) TO authenticated;

-- O fechamento da porta antiga (DROP POLICY + REVOKE INSERT) NÃO mora aqui, de
-- propósito: esta migration precisa ser segura com o front que já está no ar,
-- que ainda faz INSERT direto. Ela só ACRESCENTA a RPC. A revogação vem em
-- 20260826130000, para ser aplicada depois que o front novo estiver publicado.
-- Sem essa separação, qualquer ordem de deploy derruba "Agendar retorno":
-- banco antes -> o front velho perde o INSERT; front antes -> ele chama uma
-- RPC que ainda não existe.

COMMENT ON FUNCTION public.agendar_retorno(uuid, timestamptz, text, text, uuid, uuid) IS
  'Única porta de criação de agendamento pela aplicação. O INSERT direto é revogado em 20260826130000.';
