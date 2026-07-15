-- =====================================================================
-- Bloqueio real da empresa + limpeza de títulos sem resíduo
-- =====================================================================
-- Corrige duas funções que a Plataforma já oferece, mas que hoje não fazem o
-- que prometem.
--
-- 1) SUSPENDER A EMPRESA não bloqueia nada. O status só era conferido no
--    frontend (Layout.tsx mostra "Acesso suspenso"), enquanto as policies
--    checavam apenas company_id = current_company_id(). Como a chave anon vai
--    no bundle e o JWT do usuário continua válido, um cliente suspenso seguia
--    lendo e gravando pela API — bastava uma aba aberta ou o console. Era uma
--    cortina, não uma tranca.
--
-- 2) LIMPAR TÍTULOS não libera espaço: devolve o problema em outro lugar. Os
--    triggers fn_audit_row (AFTER DELETE) copiam CADA linha apagada inteira
--    para audit_log.before_data. Apagar 8 mil títulos gravava 8 mil linhas de
--    auditoria carregando CPF, telefone e histórico dos devedores. O banco
--    crescia, e o dado pessoal que se queria remover continuava lá.
--
-- Nada aqui muda regra de negócio: o que era permitido continua permitido, e o
-- que a UI já dizia que acontecia passa a de fato acontecer.

-- ============== 1. O STATUS DA EMPRESA PASSA A VALER NO BANCO ==============

-- Identidade do tenant: a qual empresa o usuário pertence, ativa ou não.
-- Serve para as telas de identidade/bloqueio, nunca para liberar dados.
CREATE OR REPLACE FUNCTION public.company_id_do_usuario()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'company_id', '')::uuid,
    (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid())
  );
$$;

-- Tenant EFETIVO: só resolve se a empresa estiver ativa. Empresa 'pendente',
-- 'suspensa' ou 'cancelada' devolve NULL, e aí toda policy que compara
-- company_id = current_company_id() falha sozinha — sem precisar tocar nas 26
-- policies existentes, e sem risco de esquecer uma.
-- Custo: um probe de índice a mais por statement (companies é minúscula, e a
-- função é STABLE — avaliada uma vez por statement).
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.id = public.company_id_do_usuario()
    AND c.status = 'ativa';
$$;

-- A tela de bloqueio precisa LER a própria empresa para saber que está
-- bloqueada (useCurrentCompany busca status via RLS). Se companies_select
-- dependesse de current_company_id(), a query voltaria vazia, o Layout não
-- veria status <> 'ativa' e renderizaria o app normal — bloqueio nenhum.
-- Por isso esta policy usa a identidade, não o tenant efetivo: o usuário sempre
-- enxerga a linha da própria empresa (nome/status), e nada além disso.
DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select public.is_super_admin()) OR (id = (select public.company_id_do_usuario()))));

-- profiles_select_tenant e user_roles_select já têm a escapatória
-- auth.uid() = user_id, então o usuário de empresa bloqueada continua lendo o
-- próprio cadastro e o AuthContext monta a sessão normalmente.

-- ============== 2. LIMPEZA SEM RESÍDUO ==============

-- Verdadeiro só dentro da transação de limpar_titulos_empresa(), e só para a
-- empresa sendo limpa. O GUC é TRANSACTION-local (set_config(..., true)), então
-- vive numa conexão só e não vaza para outras requisições; é escrito por função
-- SECURITY DEFINER que já validou super admin, e clientes PostgREST não definem
-- GUCs fora do namespace request.*. Comparar com o company_id da própria linha
-- limita o alcance mesmo na hipótese de o valor vazar.
CREATE OR REPLACE FUNCTION public.limpeza_em_andamento(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_company_id IS NOT NULL
     AND current_setting('app.limpeza_empresa', true) = p_company_id::text;
$$;

-- Guard anti-delete físico. Fora da limpeza o comportamento é idêntico ao
-- anterior (super admin passa, demais recebem exceção). Dentro dela, o
-- fast-path evita um SELECT em user_roles por linha apagada.
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_financial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.limpeza_em_andamento(OLD.company_id) THEN RETURN OLD; END IF;
  IF public.is_super_admin() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'DELETE físico bloqueado em %. Use cancelamento/estorno (soft-delete).', TG_TABLE_NAME;
END; $$;

-- Auditoria por linha. Durante a limpeza em massa não gravamos nada: copiar
-- before_data de cada linha recriaria a base inteira dentro do audit_log,
-- anulando a limpeza. O rastro vira UMA linha-resumo em limpar_titulos_empresa().
-- Exclusões pontuais (inclusive excluir_titulos_definitivo) seguem auditadas
-- normalmente — lá o histórico linha a linha é justamente o que se quer.
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_changed text[]; v_rec_id uuid; v_email text; v_company uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_before := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_after := to_jsonb(NEW); END IF;
  v_rec_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
  v_company := coalesce((v_after->>'company_id')::uuid, (v_before->>'company_id')::uuid);

  IF public.limpeza_em_andamento(v_company) THEN RETURN coalesce(NEW, OLD); END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(array_agg(key), '{}') INTO v_changed
    FROM jsonb_each(v_after) a WHERE a.value IS DISTINCT FROM (v_before->a.key);
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN RETURN NEW; END IF;
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_log (company_id, actor_id, actor_email, action, table_name, record_id, before_data, after_data, changed_fields)
  VALUES (v_company, auth.uid(), v_email, lower(TG_OP), TG_TABLE_NAME, v_rec_id, v_before, v_after, v_changed);
  RETURN coalesce(NEW, OLD);
END; $$;

-- Limpa todos os títulos de uma empresa. Mesma assinatura e mesmas permissões
-- de antes; muda só o que acontece por baixo: sem cópia para o audit_log, e a MV
-- continua sendo recalculada ao final.
CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_nome text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;

  SELECT nome INTO v_nome FROM public.companies WHERE id = p_company_id;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;

  PERFORM set_config('app.limpeza_empresa', p_company_id::text, true);
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Um registro do que foi feito, sem carregar os dados apagados junto.
  INSERT INTO public.audit_log (company_id, actor_id, actor_email, action, table_name, context)
  VALUES (p_company_id, auth.uid(),
          (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
          'limpar_titulos_empresa', 'titulos',
          jsonb_build_object('empresa', v_nome, 'titulos_excluidos', v_count));

  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

NOTIFY pgrst, 'reload schema';
