-- ============================================================================
-- Correções da Auditoria — Rodada 2 (AUDITORIA_RODADA_2.md), parte 1
--
--   3  escrita direta nas tabelas financeiras fechada: dinheiro só por RPC
--   1  carteira: só admin troca cobrador/vendedor do cliente; cliente criado
--      por cobrador fica na carteira dele; cadastro de cobrador/vendedor é admin
--   2  cobrador só enxerga (e altera) o que é da carteira dele — decisão do
--      gestor de 2026-09-30: "só enxergar o que for dele"
--
-- O front não usa nenhum dos caminhos fechados aqui: toda escrita financeira
-- já passa por RPC (SECURITY DEFINER, dono postgres, não depende destes grants).
-- ============================================================================

-- ─── 3. Dinheiro só por RPC ────────────────────────────────────────────────
-- Com UPDATE direto, um admin criava dívida sem lançamento (valor_nominal) ou
-- cancelava acordo sem desfazer a novação (status). O razão deixava de ser a
-- fonte do saldo para quem não usasse a tela.
DROP POLICY IF EXISTS titulos_insert ON public.titulos;
DROP POLICY IF EXISTS titulos_update ON public.titulos;
DROP POLICY IF EXISTS parcelas_insert ON public.parcelas;
DROP POLICY IF EXISTS parcelas_update ON public.parcelas;
DROP POLICY IF EXISTS acordos_insert ON public.acordos;
DROP POLICY IF EXISTS acordos_update ON public.acordos;
DROP POLICY IF EXISTS parcelas_acordo_insert ON public.parcelas_acordo;
DROP POLICY IF EXISTS parcelas_acordo_update ON public.parcelas_acordo;
DROP POLICY IF EXISTS acordo_titulos_insert ON public.acordo_titulos;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.titulos, public.parcelas, public.acordos, public.parcelas_acordo,
  public.acordo_titulos, public.movimentos_financeiros
FROM authenticated, anon;

-- ─── 2. Cobrador só vê a própria carteira ──────────────────────────────────
-- Em clientes, a carteira é lida das colunas da própria linha. Não dá para
-- usar cobrador_ve_cliente(id) aqui: ele procura o cliente na tabela, e no
-- INSERT … RETURNING a linha nova ainda não é visível para essa busca — o
-- cobrador não conseguiria cadastrar cliente. Nas outras tabelas, sim.
CREATE OR REPLACE FUNCTION public._na_carteira(p_cobrador uuid, p_vendedor uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
      OR p_cobrador = public.current_cobrador_id()
      OR p_vendedor = public.current_vendedor_id();
$$;
REVOKE EXECUTE ON FUNCTION public._na_carteira(uuid, uuid) FROM PUBLIC, anon;
-- Avaliada dentro de policy, com o papel do usuário: precisa do EXECUTE.
GRANT EXECUTE ON FUNCTION public._na_carteira(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS clientes_select ON public.clientes;
CREATE POLICY clientes_select ON public.clientes FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (public.is_super_admin()
              OR (company_id = public.current_company_id() AND public._na_carteira(cobrador_id, vendedor_id))));

DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.current_company_id())
         AND public.has_min_role((SELECT auth.uid()), 'operador')
         AND public._na_carteira(cobrador_id, vendedor_id))
  WITH CHECK (company_id = (SELECT public.current_company_id())
         AND public.has_min_role((SELECT auth.uid()), 'operador'));

DROP POLICY IF EXISTS comunicacoes_select ON public.comunicacoes;
CREATE POLICY comunicacoes_select ON public.comunicacoes FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (public.is_super_admin()
              OR (company_id = public.current_company_id() AND public.cobrador_ve_cliente(cliente_id))));
DROP POLICY IF EXISTS comunicacoes_insert ON public.comunicacoes;
CREATE POLICY comunicacoes_insert ON public.comunicacoes FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.current_company_id())
              AND public.has_min_role((SELECT auth.uid()), 'operador')
              AND public.cobrador_ve_cliente(cliente_id));
DROP POLICY IF EXISTS comunicacoes_update ON public.comunicacoes;
CREATE POLICY comunicacoes_update ON public.comunicacoes FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.current_company_id())
         AND public.has_min_role((SELECT auth.uid()), 'operador')
         AND public.cobrador_ve_cliente(cliente_id));

DROP POLICY IF EXISTS agendamentos_select ON public.agendamentos;
CREATE POLICY agendamentos_select ON public.agendamentos FOR SELECT TO authenticated
  USING (deleted_at IS NULL
         AND (public.is_super_admin()
              OR (company_id = public.current_company_id() AND public.cobrador_ve_cliente(cliente_id))));
DROP POLICY IF EXISTS agendamentos_update ON public.agendamentos;
CREATE POLICY agendamentos_update ON public.agendamentos FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.current_company_id())
         AND public.has_min_role((SELECT auth.uid()), 'operador')
         AND public.cobrador_ve_cliente(cliente_id));

-- Anexo pode estar ligado a cliente, título ou acordo.
CREATE OR REPLACE FUNCTION public._cliente_do_anexo(p_cliente uuid, p_titulo uuid, p_acordo uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_cliente,
                  (SELECT cliente_id FROM public.titulos WHERE id = p_titulo),
                  (SELECT cliente_id FROM public.acordos WHERE id = p_acordo));
$$;
REVOKE EXECUTE ON FUNCTION public._cliente_do_anexo(uuid, uuid, uuid) FROM PUBLIC, anon;
-- Avaliada dentro de policy, com o papel do usuário: precisa do EXECUTE.
GRANT EXECUTE ON FUNCTION public._cliente_do_anexo(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS anexos_select ON public.anexos;
CREATE POLICY anexos_select ON public.anexos FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (company_id = public.current_company_id()
             AND public.cobrador_ve_cliente(public._cliente_do_anexo(cliente_id, titulo_id, acordo_id))));
DROP POLICY IF EXISTS anexos_insert ON public.anexos;
CREATE POLICY anexos_insert ON public.anexos FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.current_company_id())
              AND public.has_min_role((SELECT auth.uid()), 'operador')
              AND public.cobrador_ve_cliente(public._cliente_do_anexo(cliente_id, titulo_id, acordo_id)));

DROP POLICY IF EXISTS campanha_envios_tenant_read ON public.campanha_envios;
CREATE POLICY campanha_envios_tenant_read ON public.campanha_envios FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND public.cobrador_ve_cliente(cliente_id));
DROP POLICY IF EXISTS campaign_logs_select ON public.campaign_logs;
CREATE POLICY campaign_logs_select ON public.campaign_logs FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (company_id = public.current_company_id()
             AND (titulo_id IS NULL OR public.cobrador_ve_titulo(titulo_id))));

-- ─── 1. Carteira só muda pelo admin ────────────────────────────────────────
-- Sem isto, um cobrador puxava todos os clientes para a própria carteira e
-- passava a ver todos os títulos. Sem sessão (API/service role) e admin: livre.
CREATE OR REPLACE FUNCTION public._proteger_carteira_cliente()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_min_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Quem cadastra entra como responsável; se não tem carteira, fica sem.
    NEW.cobrador_id := public.current_cobrador_id();
    NEW.vendedor_id := public.current_vendedor_id();
    RETURN NEW;
  END IF;

  IF NEW.cobrador_id IS DISTINCT FROM OLD.cobrador_id
     OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN
    RAISE EXCEPTION 'Só o administrador muda o cobrador ou o vendedor do cliente';
  END IF;
  RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public._proteger_carteira_cliente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proteger_carteira_cliente ON public.clientes;
CREATE TRIGGER trg_proteger_carteira_cliente
  BEFORE INSERT OR UPDATE OF cobrador_id, vendedor_id ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public._proteger_carteira_cliente();

-- Cadastro de cobrador/vendedor é tela de admin (Equipe). Com operador, um
-- cobrador podia apontar o cadastro de um colega para o próprio usuário.
DROP POLICY IF EXISTS cobradores_insert ON public.cobradores;
CREATE POLICY cobradores_insert ON public.cobradores FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.current_company_id()) AND public.has_min_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS cobradores_update ON public.cobradores;
CREATE POLICY cobradores_update ON public.cobradores FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.current_company_id()) AND public.has_min_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS vendedores_insert ON public.vendedores;
CREATE POLICY vendedores_insert ON public.vendedores FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS vendedores_update ON public.vendedores;
CREATE POLICY vendedores_update ON public.vendedores FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(), 'admin'));

-- ─── RPCs de operador passam a checar a carteira ───────────────────────────
-- SECURITY DEFINER ignora a RLS: a checagem precisa estar dentro da função.
CREATE OR REPLACE FUNCTION public.agendar_retorno(p_cliente_id uuid, p_data_agendamento timestamp with time zone, p_tipo_evento text DEFAULT 'agendamento'::text, p_descricao text DEFAULT NULL::text, p_titulo_id uuid DEFAULT NULL::uuid, p_acordo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND public.cobrador_ve_cliente(id)
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
END; $function$;

CREATE OR REPLACE FUNCTION public.registrar_resultado_cobranca(p_cliente_id uuid, p_status_cobranca text, p_data_proximo_contato timestamp with time zone, p_descricao text DEFAULT NULL::text, p_titulo_id uuid DEFAULT NULL::uuid, p_acordo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND deleted_at IS NULL AND public.cobrador_ve_cliente(id)
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
END; $function$;

CREATE OR REPLACE FUNCTION public.criar_titulo_com_parcelas(p_cliente_id uuid, p_valor_original numeric, p_vencimento_original date, p_descricao text DEFAULT NULL::text, p_numero_documento character varying DEFAULT NULL::character varying, p_numero_parcelas integer DEFAULT 1, p_intervalo_dias integer DEFAULT 30, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := round(p_valor_original, 2);
  v_base numeric; v_titulo_id uuid; i int;
BEGIN
  IF NOT public.has_min_role(auth.uid(), 'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_numero_parcelas IS NULL OR p_numero_parcelas < 1 THEN RAISE EXCEPTION 'Número de parcelas inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes
                  WHERE id = p_cliente_id AND company_id = public.current_company_id() AND deleted_at IS NULL
                    AND public.cobrador_ve_cliente(id)) THEN
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
END $function$;

-- ─── Conferência ───────────────────────────────────────────────────────────
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(t || ':' || p, ', ') INTO v
    FROM unnest(ARRAY['titulos','parcelas','acordos','parcelas_acordo','acordo_titulos','movimentos_financeiros']) t,
         unnest(ARRAY['INSERT','UPDATE','DELETE']) p
   WHERE has_table_privilege('authenticated', 'public.' || t, p);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'authenticated ainda escreve em: %', v; END IF;

  IF has_function_privilege('authenticated', 'public._proteger_carteira_cliente()', 'EXECUTE') THEN
    RAISE EXCEPTION '_proteger_carteira_cliente exposta';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.agendar_retorno(uuid,timestamptz,text,text,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.registrar_resultado_cobranca(uuid,text,timestamptz,text,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.criar_titulo_com_parcelas(uuid,numeric,date,text,varchar,integer,integer,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC de operador perdeu o grant';
  END IF;
END $$;
