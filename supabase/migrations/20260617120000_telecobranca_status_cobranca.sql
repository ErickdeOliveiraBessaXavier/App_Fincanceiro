-- =====================================================================
-- Telecobrança: Status de Cobrança + fluxo "Registrar Resultado".
-- =====================================================================
-- Mantém a separação de responsabilidades definida para o projeto:
--   comunicacoes = fatos históricos (o contato que aconteceu, com seu resultado)
--   agendamentos = ações futuras (o próximo contato)
--
-- O "próximo contato" É o agendamento: data_agendamento já guarda QUANDO será.
-- Por isso NÃO criamos coluna de data redundante. Adicionamos apenas a
-- CLASSIFICAÇÃO do resultado (status_cobranca) nas duas tabelas:
--   - comunicacoes.status_cobranca: o resultado do contato registrado (histórico)
--   - agendamentos.status_cobranca: o motivo/contexto do retorno agendado
--
-- Os valores são slugs validados na camada de negócio
-- (src/domain/telecobranca/statusCobranca.ts) — sem CHECK no banco, espelhando
-- agendamentos.tipo_evento, para que novos status não quebrem o insert.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS status_cobranca TEXT;
COMMENT ON COLUMN public.agendamentos.status_cobranca IS
  'Status de cobrança que gerou este retorno (slug). Regras em src/domain/telecobranca/statusCobranca.ts';

ALTER TABLE public.comunicacoes
  ADD COLUMN IF NOT EXISTS status_cobranca TEXT;
COMMENT ON COLUMN public.comunicacoes.status_cobranca IS
  'Resultado da telecobrança registrado neste contato (slug). Regras em src/domain/telecobranca/statusCobranca.ts';

-- ---------------------------------------------------------------------
-- RPC: registra o resultado do contato (histórico) E agenda o próximo
-- contato (futuro) de forma ATÔMICA. Evita estado inconsistente caso uma
-- das duas escritas falhe. A regra de cálculo da data vive no TS; aqui é
-- só persistência. SECURITY DEFINER seguindo o padrão das demais RPCs;
-- validamos papel (operador) e posse do cliente pela empresa atual.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_resultado_cobranca(
  p_cliente_id uuid,
  p_status_cobranca text,
  p_data_proximo_contato timestamptz,
  p_descricao text DEFAULT NULL,
  p_titulo_id uuid DEFAULT NULL,
  p_acordo_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_comunicacao_id uuid;
  v_agendamento_id uuid;
BEGIN
  IF NOT public.has_min_role(v_user, 'operador') THEN
    RAISE EXCEPTION 'Operação restrita a operadores de cobrança';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- Histórico: o contato que acabou de acontecer.
  INSERT INTO public.comunicacoes (
    company_id, cliente_id, tipo, canal, assunto, mensagem, status_cobranca, data_contato, created_by
  ) VALUES (
    v_company, p_cliente_id, 'contato_cliente', 'manual', 'Resultado de cobrança',
    p_descricao, p_status_cobranca, now(), v_user
  ) RETURNING id INTO v_comunicacao_id;

  -- Ação futura: o próximo contato.
  INSERT INTO public.agendamentos (
    company_id, cliente_id, titulo_id, acordo_id, tipo_evento, status,
    status_cobranca, descricao, data_agendamento, created_by
  ) VALUES (
    v_company, p_cliente_id, p_titulo_id, p_acordo_id, 'agendamento', 'pendente',
    p_status_cobranca, p_descricao, p_data_proximo_contato, v_user
  ) RETURNING id INTO v_agendamento_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'comunicacao_id', v_comunicacao_id,
    'agendamento_id', v_agendamento_id
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.registrar_resultado_cobranca(uuid, text, timestamptz, text, uuid, uuid) TO authenticated;
