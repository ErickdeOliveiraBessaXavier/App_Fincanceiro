-- =====================================================================
-- Simplificação da hierarquia de perfis (definição de negócio 2026-08-03).
-- =====================================================================
-- Regra: o ADMIN é o gestor máximo da SUA empresa e tem controle total dentro
-- dela, limitado apenas por regra de negócio. O SUPER_ADMIN é papel de
-- PLATAFORMA (multitenancy): administra empresas, acessa qualquer tenant, faz
-- manutenção — e não participa da operação de nenhuma empresa.
--
-- O modelo passa a ter 4 papéis em dois eixos:
--   plataforma: super_admin
--   empresa:    admin > operador ("cobrador") > vendedor (carteira read-only)
--
-- 'financeiro' e 'leitura' saem de circulação. Como o Postgres não suporta
-- remover valor de ENUM, os rótulos continuam existindo no tipo app_role mas
-- ficam inalcançáveis: nenhum gate os cita e um CHECK impede atribuí-los.

-- ============== 1. Migração dos dados existentes ==============
-- Tem de vir antes do CHECK, que valida as linhas já gravadas.

-- 'financeiro' sempre valeu, na prática, o mesmo que 'admin': todos os gates que
-- o citavam usam has_min_role (>=) e rank(admin) > rank(financeiro), então quem
-- tinha só 'financeiro' nunca passou em nada que 'admin' também não passasse.
-- Promover para 'admin' preserva o acesso de quem porventura tenha o papel.
-- UNIQUE(user_id, role) proíbe duplicata: quem já é admin perde a linha extra.
DELETE FROM public.user_roles ur
 WHERE ur.role = 'financeiro'
   AND EXISTS (
     SELECT 1 FROM public.user_roles a
      WHERE a.user_id = ur.user_id AND a.role = 'admin'
   );
UPDATE public.user_roles SET role = 'admin' WHERE role = 'financeiro';

-- 'leitura' não tem equivalente entre os papéis que ficam ('vendedor' é uma
-- carteira, não um nível de leitura genérico). Remover o papel em vez de
-- promover: o usuário cai no gate "aguardando autorização" do Layout e o admin
-- reatribui conscientemente. Nenhum privilégio é concedido automaticamente.
DELETE FROM public.user_roles WHERE role = 'leitura';

-- ============== 2. Trava: só os 4 papéis do modelo ==============
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_papel_valido;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_papel_valido
  CHECK (role IN ('vendedor','operador','admin','super_admin'));

COMMENT ON CONSTRAINT user_roles_papel_valido ON public.user_roles IS
  'Papéis em uso. ENUM app_role ainda contém financeiro/leitura (Postgres não '
  'remove valor de enum), mas eles estão fora de circulação desde 20260803140000.';

-- role_rank mantém a numeração de 6 posições de propósito: renumerar não muda
-- comportamento algum (só a ordem relativa importa para has_min_role) e mexer
-- nela obrigaria a recriar tudo que depende da função. O CHECK acima é quem
-- garante que os dois valores mortos não voltem.

-- ============== 3. Policies: 'financeiro' -> 'admin' ==============
-- Mesma forma das versões vivas (20260601130000 embrulha as chamadas estáveis em
-- (select ...) para o planner avaliar uma vez por query). Só o papel muda.

DROP POLICY IF EXISTS "titulos_update" ON public.titulos;
CREATE POLICY "titulos_update" ON public.titulos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "parcelas_update" ON public.parcelas;
CREATE POLICY "parcelas_update" ON public.parcelas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "eventos_update" ON public.eventos_parcela;
CREATE POLICY "eventos_update" ON public.eventos_parcela
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "acordos_insert" ON public.acordos;
CREATE POLICY "acordos_insert" ON public.acordos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "acordos_update" ON public.acordos;
CREATE POLICY "acordos_update" ON public.acordos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "parcelas_acordo_insert" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_insert" ON public.parcelas_acordo
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "parcelas_acordo_update" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_update" ON public.parcelas_acordo
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "acordo_titulos_insert" ON public.acordo_titulos;
CREATE POLICY "acordo_titulos_insert" ON public.acordo_titulos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

-- ============== 4. RPCs: 'financeiro' -> 'admin' ==============
-- Corpo idêntico ao vigente; muda o gate e a mensagem, que citava um papel que
-- não existe mais na UI.

CREATE OR REPLACE FUNCTION public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_tipo NOT IN ('juros_aplicado','multa_aplicada') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, p_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado', CASE WHEN p_tipo='juros_aplicado' THEN 'Juros' ELSE 'Multa' END, p_valor)),
    COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual+p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','aplicar_encargo_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Desconto excede saldo'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id,'desconto_concedido',p_valor,-1, COALESCE(p_descricao, format('Desconto de R$ %s concedido', p_valor)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual-p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','conceder_desconto_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_evento_parcela(
  p_evento_id uuid, p_motivo text, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_evento_original record; v_evento_estorno_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN RAISE EXCEPTION 'Motivo do estorno é obrigatório'; END IF;
  SELECT * INTO v_evento_original FROM public.eventos_parcela WHERE id = p_evento_id;
  IF v_evento_original.id IS NULL THEN RAISE EXCEPTION 'Evento não encontrado'; END IF;
  IF v_evento_original.estornado THEN RAISE EXCEPTION 'Já estornado'; END IF;
  IF v_evento_original.tipo IN ('emissao_parcela','estorno') THEN RAISE EXCEPTION 'Não pode estornar'; END IF;
  UPDATE public.eventos_parcela SET estornado = true WHERE id = p_evento_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  VALUES (v_evento_original.parcela_id,'estorno',v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo), COALESCE(p_created_by, auth.uid()), p_evento_id)
  RETURNING id INTO v_evento_estorno_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_estorno_id',v_evento_estorno_id,'evento_original_id',p_evento_id,'tipo_estornado',v_evento_original.tipo);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',p_evento_id, jsonb_build_object('rpc','estornar_evento_parcela','result',v_result));
  RETURN v_result;
END; $$;

-- criar_acordo / cancelar_acordo: corpo de 20260803130000, só o gate muda.
CREATE OR REPLACE FUNCTION public.criar_acordo(
  p_titulo_ids uuid[], p_cliente_id uuid, p_valor_original numeric, p_valor_acordo numeric,
  p_desconto numeric, p_parcelas int, p_valor_parcela numeric,
  p_data_vencimento_primeira_parcela date, p_observacoes text, p_cronograma jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acordo_id uuid; v_company uuid; v_item jsonb; v_titulo uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos um título';
  END IF;
  v_company := public.current_company_id();

  INSERT INTO public.acordos (
    company_id, titulo_id, cliente_id, valor_original, valor_acordo, desconto,
    parcelas, valor_parcela, data_acordo, data_vencimento_primeira_parcela,
    status, observacoes, created_by
  ) VALUES (
    v_company, p_titulo_ids[1], p_cliente_id, p_valor_original, p_valor_acordo, p_desconto,
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

  FOREACH v_titulo IN ARRAY p_titulo_ids LOOP
    INSERT INTO public.acordo_titulos (company_id, acordo_id, titulo_id)
      VALUES (v_company, v_acordo_id, v_titulo);
    PERFORM public.liquidar_parcelas_titulo(
      v_titulo, v_acordo_id, format('Liquidação por novação (acordo %s)', v_acordo_id));
  END LOOP;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', v_acordo_id);
END; $$;

CREATE OR REPLACE FUNCTION public.cancelar_acordo(p_acordo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acordos WHERE id = p_acordo_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'Acordo não encontrado';
  END IF;

  UPDATE public.acordos SET status = 'cancelado' WHERE id = p_acordo_id;

  UPDATE public.eventos_parcela e
    SET estornado = true
    FROM public.parcelas p
    JOIN public.acordo_titulos at ON at.titulo_id = p.titulo_id
    WHERE p.id = e.parcela_id
      AND at.acordo_id = p_acordo_id
      AND e.tipo = 'renegociacao'
      AND (e.acordo_id = p_acordo_id OR e.acordo_id IS NULL)
      AND (e.estornado IS NULL OR e.estornado = false);

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'acordo_id', p_acordo_id);
END; $$;

-- ============== 5. Exclusão definitiva passa a ser do admin ==============
-- Antes era exclusiva do super_admin — que o Layout redireciona para /plataforma
-- e portanto nunca alcança as telas de Títulos/Acordos. Resultado: a operação
-- era inalcançável na prática. Passa para o admin, com duas salvaguardas.

-- 5.1 O trigger anti-delete físico deixa de ser "super admin ou nada". Em vez de
-- liberar todo admin (o que valeria para qualquer DELETE que passasse pela RLS),
-- libera só quem estiver dentro de uma RPC de exclusão definitiva, que marca a
-- flag abaixo. DELETE direto na tabela continua bloqueado para o admin.
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_financial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin() THEN RETURN OLD; END IF;
  IF current_setting('app.hard_delete', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'DELETE físico bloqueado em %. Use cancelamento/estorno (soft-delete).', TG_TABLE_NAME;
END; $$;

-- 5.2 Títulos. Mantém as guardas de 20260803130000 (acordo vinculado barra a
-- purga) e ganha escopo de tenant: a função é SECURITY DEFINER, logo a RLS de
-- titulos NÃO se aplica aqui — sem esta checagem um admin apagaria título de
-- outra empresa passando o uuid na mão.
CREATE OR REPLACE FUNCTION public.excluir_titulos_definitivo(p_titulo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_com_acordo int; v_alheios int;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT count(*) INTO v_alheios FROM public.titulos
     WHERE id = ANY(p_titulo_ids) AND company_id IS DISTINCT FROM public.current_company_id();
    IF v_alheios > 0 THEN RAISE EXCEPTION 'Há título(s) de outra empresa na seleção'; END IF;
  END IF;

  SELECT count(DISTINCT a.id) INTO v_com_acordo
    FROM public.acordos a
    LEFT JOIN public.acordo_titulos at ON at.acordo_id = a.id
   WHERE a.titulo_id = ANY(p_titulo_ids) OR at.titulo_id = ANY(p_titulo_ids);
  IF v_com_acordo > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) vinculado(s) a estes títulos. Exclua os acordos antes de purgar os títulos.', v_com_acordo;
  END IF;

  PERFORM set_config('app.hard_delete','on',true);
  DELETE FROM public.agendamentos WHERE titulo_id = ANY(p_titulo_ids);
  DELETE FROM public.titulos WHERE id = ANY(p_titulo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.hard_delete','off',true);

  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

-- 5.3 Acordos. Além do escopo de tenant, exige que o acordo esteja CANCELADO.
-- Acordo = novação: um acordo ativo mantém as parcelas do título liquidadas
-- (eventos 'renegociacao'). Apagá-lo sem cancelar antes deixaria o título com
-- saldo zerado e nenhum acordo apontando para ele — dívida sumida do nada.
-- Cancelar primeiro estorna a liquidação e devolve a dívida original.
CREATE OR REPLACE FUNCTION public.excluir_acordos_definitivo(p_acordo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_alheios int; v_ativos int;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  IF p_acordo_ids IS NULL OR array_length(p_acordo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;

  IF NOT public.is_super_admin() THEN
    SELECT count(*) INTO v_alheios FROM public.acordos
     WHERE id = ANY(p_acordo_ids) AND company_id IS DISTINCT FROM public.current_company_id();
    IF v_alheios > 0 THEN RAISE EXCEPTION 'Há acordo(s) de outra empresa na seleção'; END IF;
  END IF;

  SELECT count(*) INTO v_ativos FROM public.acordos
   WHERE id = ANY(p_acordo_ids) AND status <> 'cancelado';
  IF v_ativos > 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) não cancelado(s) na seleção. Cancele o acordo antes de excluí-lo definitivamente.', v_ativos;
  END IF;

  PERFORM set_config('app.hard_delete','on',true);
  DELETE FROM public.acordos WHERE id = ANY(p_acordo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.hard_delete','off',true);

  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

-- 5.4 limpar_titulos_empresa continua exclusiva do super_admin: é operação de
-- plataforma (recebe company_id como parâmetro e roda a partir de /plataforma),
-- não a exclusão pontual que o admin faz dentro da própria empresa. Só ganha a
-- flag, já que o trigger mudou de forma.
CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;
  PERFORM set_config('app.hard_delete','on',true);
  DELETE FROM public.agendamentos WHERE company_id = p_company_id AND titulo_id IS NOT NULL;
  DELETE FROM public.acordos WHERE company_id = p_company_id;
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.hard_delete','off',true);
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

-- ============== 6. Permissões ==============
GRANT EXECUTE ON FUNCTION public.excluir_titulos_definitivo(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_acordos_definitivo(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.excluir_titulos_definitivo(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.excluir_acordos_definitivo(uuid[]) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
