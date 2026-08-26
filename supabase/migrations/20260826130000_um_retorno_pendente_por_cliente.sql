-- ============================================================================
-- Um retorno pendente por cliente
--
-- Todo o lado de LEITURA do app já assumia isso e nunca foi verdade no banco:
--
--   * `ClienteRow.proximo_retorno` é singular;
--   * `mapProximosRetornos` (lib/queries/clientes.ts) ordena por data e fica
--     com o PRIMEIRO pendente de cada cliente;
--   * a /fila inteira agrupa o dia por essa data (atrasado / hoje / 7 dias).
--
-- O lado de ESCRITA aceitava N. Um segundo pendente não era "um dado a mais":
-- era um registro que existia, contava como pendente e era invisível — o pior
-- tipo de inconsistência, a que não dá erro e corrói a confiança na fila.
--
-- A unidade operacional da cobrança é o CLIENTE, não o título: o cobrador liga
-- para a pessoa e uma ligação resolve tudo o que ela deve. `titulo_id` e
-- `acordo_id` no agendamento são CONTEXTO ("sobre o que é este retorno"), não
-- agendas paralelas. Confirmado com a operação em 2026-08-26.
--
-- Remarcar continua possível — e é o caso normal. O que muda é que remarcar
-- passa a ser SUCESSÃO EXPLÍCITA em vez de acúmulo silencioso.
-- ============================================================================

-- ============== 1. Vocabulário: substituído ≠ cancelado ==============
-- Fechar o retorno anterior como 'cancelado' apagaria justamente a informação
-- que interessa. "Prometeu ligar dia 5, remarcou pro 12, remarcou pro 20" é
-- prova de enrolação do cliente — é dado de negócio, não lixo. Com um status
-- próprio dá para separar "o operador desmarcou" de "o cliente empurrou".
--
-- `status` nasceu como TEXT livre, sem CHECK. Conferido no projeto linkado em
-- 2026-08-26: a tabela só contém 'pendente' e 'cancelado', ambos dentro do
-- vocabulário — então a constraint entra VALIDADA, sem hedge de NOT VALID que
-- deixaria linha legada fora da regra para sempre.
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_status_check;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('pendente', 'concluido', 'cancelado', 'substituido'));

-- ============== 2. Reconciliar o que já está duplicado ==============
-- Mantém o pendente mais próximo de cada cliente — que é exatamente o que a
-- tela já mostrava. Ou seja: isto NÃO muda nada do que o usuário vê hoje, só
-- torna o banco honesto sobre o que a tela sempre disse.
--
-- Desempate por created_at e id para ser determinístico: sem isso, duas linhas
-- com a mesma data deixariam o resultado à sorte do planner.
--
-- Em 2026-08-26 não havia nenhuma duplicata no projeto linkado, então isto é
-- no-op hoje. Fica assim mesmo: entre escrever e aplicar existe uma janela em
-- que o front antigo ainda pode criar uma, e a migration precisa valer para
-- qualquer ambiente (staging, outro tenant, restore antigo).
WITH ordenados AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cliente_id
           ORDER BY data_agendamento, created_at, id
         ) AS posicao
    FROM public.agendamentos
   WHERE status = 'pendente' AND deleted_at IS NULL
)
UPDATE public.agendamentos a
   SET status = 'substituido',
       resultado = COALESCE(a.resultado || ' | ', '') || 'reconciliado_20260826',
       updated_at = now()
  FROM ordenados o
 WHERE a.id = o.id AND o.posicao > 1;

-- ============== 3. A invariante, onde ela é de verdade ==============
-- Aviso de tela é lembrete; índice é garantia. Enquanto o estado ilegal for
-- representável, ele volta pela próxima porta que alguém abrir.
CREATE UNIQUE INDEX IF NOT EXISTS ux_agendamentos_pendente_por_cliente
  ON public.agendamentos (cliente_id)
  WHERE status = 'pendente' AND deleted_at IS NULL;

-- ============== 4. Sucessão, num lugar só ==============
-- Fecha os pendentes do cliente e devolve quais foram, para que o chamador
-- registre quem os substituiu. Precisa rodar ANTES do INSERT do novo: o índice
-- único não é deferrable, então dois pendentes nem chegam a coexistir dentro
-- da transação.
CREATE OR REPLACE FUNCTION public.fechar_retornos_pendentes(p_cliente_id uuid)
RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH fechados AS (
    UPDATE public.agendamentos
       SET status = 'substituido', updated_at = now()
     WHERE cliente_id = p_cliente_id
       AND status = 'pendente'
       AND deleted_at IS NULL
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM fechados;

  RETURN COALESCE(v_ids, ARRAY[]::uuid[]);
END; $$;

-- Marca de quem herdou o compromisso: a cadeia de remarcações fica navegável.
CREATE OR REPLACE FUNCTION public.marcar_substituicao(p_ids uuid[], p_sucessor uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agendamentos
     SET resultado = COALESCE(resultado || ' | ', '') || 'substituido_por:' || p_sucessor
   WHERE id = ANY(p_ids);
$$;

-- ============== 5. As duas portas passam a suceder ==============
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
  v_substituidos uuid[];
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

  v_substituidos := public.fechar_retornos_pendentes(p_cliente_id);

  INSERT INTO public.agendamentos (
    company_id, cliente_id, titulo_id, acordo_id, tipo_evento, status,
    descricao, data_agendamento, created_by
  ) VALUES (
    v_company, p_cliente_id, p_titulo_id, p_acordo_id,
    COALESCE(p_tipo_evento, 'agendamento'), 'pendente',
    p_descricao, p_data_agendamento, v_user
  ) RETURNING id INTO v_agendamento_id;

  PERFORM public.marcar_substituicao(v_substituidos, v_agendamento_id);

  RETURN jsonb_build_object(
    'sucesso', true,
    'agendamento_id', v_agendamento_id,
    'substituidos', array_length(v_substituidos, 1)
  );
END; $$;

-- Mesma regra no caminho que o cobrador mais usa. Era justamente aqui que o
-- retorno duplicado nascia sem nenhum aviso: a tela avisava só no modal avulso.
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
  v_substituidos uuid[];
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

  -- Ação futura: o próximo contato sucede o que estava marcado.
  v_substituidos := public.fechar_retornos_pendentes(p_cliente_id);

  INSERT INTO public.agendamentos (
    company_id, cliente_id, titulo_id, acordo_id, tipo_evento, status,
    status_cobranca, descricao, data_agendamento, created_by
  ) VALUES (
    v_company, p_cliente_id, p_titulo_id, p_acordo_id, 'agendamento', 'pendente',
    p_status_cobranca, p_descricao, p_data_proximo_contato, v_user
  ) RETURNING id INTO v_agendamento_id;

  PERFORM public.marcar_substituicao(v_substituidos, v_agendamento_id);

  RETURN jsonb_build_object(
    'sucesso', true,
    'comunicacao_id', v_comunicacao_id,
    'agendamento_id', v_agendamento_id,
    'substituidos', array_length(v_substituidos, 1)
  );
END; $$;

-- ============== 6. Fechar a porta antiga ==============
-- Sai daqui e não da 20260826120000 porque só agora é seguro: o front que
-- chama `agendar_retorno` precisa estar publicado ANTES desta migration. Sem
-- policy de INSERT, `authenticated` não escreve mais direto na tabela — só
-- pelas duas RPCs, que são SECURITY DEFINER e não passam por RLS.
--
-- SELECT e UPDATE seguem como estavam: a timeline lê os eventos, e
-- concluir/cancelar um agendamento ainda é UPDATE de tela.
DROP POLICY IF EXISTS "agendamentos_insert" ON public.agendamentos;

REVOKE INSERT ON public.agendamentos FROM authenticated;

REVOKE ALL ON FUNCTION public.fechar_retornos_pendentes(uuid) FROM public, authenticated;
REVOKE ALL ON FUNCTION public.marcar_substituicao(uuid[], uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.agendar_retorno(uuid, timestamptz, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_cobranca(uuid, text, timestamptz, text, uuid, uuid) TO authenticated;

COMMENT ON INDEX public.ux_agendamentos_pendente_por_cliente IS
  'Um retorno pendente por cliente. A /fila e a lista de Clientes leem um só; permitir N tornava o excedente invisível.';
