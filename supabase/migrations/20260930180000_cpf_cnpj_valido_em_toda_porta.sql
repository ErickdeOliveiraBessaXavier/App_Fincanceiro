-- ============================================================================
-- CPF/CNPJ válido em toda porta de entrada (decisão do gestor, 2026-09-30:
-- "não deve aceitar CPF ou CNPJ errado em canto nenhum")
--
-- Substitui o CHECK só de formato da 20260930150000. Agora o banco confere o
-- dígito verificador — cadastro, planilha, API e o CNPJ da própria empresa.
--
-- CNPJ alfanumérico: desde julho de 2026 a Receita emite CNPJ com letras nas
-- 12 primeiras posições (IN RFB 2.229/2024). O documento é gravado só com
-- dígitos e letras maiúsculas; o DV usa o código ASCII menos 48 de cada
-- caractere ('0'..'9' = 0..9, 'A'..'Z' = 17..42), o que para documento só de
-- dígitos é o cálculo de sempre. Espelho no front: src/utils/format.ts.
--
-- Os 3 clientes e as 2 empresas de teste com documento inválido foram
-- corrigidos antes desta migration (dados de teste, autorizado pelo gestor).
-- ============================================================================

-- Dígitos e letras maiúsculas, sem máscara. É a forma gravada.
CREATE OR REPLACE FUNCTION public.normalizar_documento(p_doc text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT upper(regexp_replace(COALESCE(p_doc, ''), '[^0-9A-Za-z]', '', 'g'));
$function$;

-- Espera o documento já normalizado.
CREATE OR REPLACE FUNCTION public.cpf_cnpj_valido(p_doc text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE pesos int[]; n int; k int; i int; soma int; resto int;
BEGIN
  IF p_doc ~ '^[0-9]{11}$' THEN
    pesos := ARRAY[11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  ELSIF p_doc ~ '^[0-9A-Z]{12}[0-9]{2}$' THEN
    pesos := ARRAY[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  ELSE
    RETURN false;
  END IF;
  -- "111.111.111-11" passa no cálculo, mas não existe.
  IF p_doc ~ '^(.)\1+$' THEN RETURN false; END IF;

  n := length(p_doc) - 2;
  FOR k IN 0..1 LOOP
    soma := 0;
    FOR i IN 1..(n + k) LOOP
      soma := soma + (ascii(substr(p_doc, i, 1)) - 48) * pesos[array_length(pesos, 1) - (n + k) + i];
    END LOOP;
    resto := soma % 11;
    IF (CASE WHEN resto < 2 THEN 0 ELSE 11 - resto END) <> ascii(substr(p_doc, n + k + 1, 1)) - 48 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $function$;

-- Usadas em CHECK de tabela que o app grava direto: quem insere precisa do EXECUTE.
REVOKE EXECUTE ON FUNCTION public.normalizar_documento(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cpf_cnpj_valido(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_documento(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cpf_cnpj_valido(text) TO authenticated, service_role;

-- ─── Tabelas ───────────────────────────────────────────────────────────────
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_formato;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_valido;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_cpf_cnpj_valido CHECK (public.cpf_cnpj_valido(cpf_cnpj));

-- Empresa é pessoa jurídica: CNPJ (opcional), sempre válido quando informado.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_cnpj_valido;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_cnpj_valido
  CHECK (cnpj IS NULL OR (length(cnpj) = 14 AND public.cpf_cnpj_valido(cnpj)));

-- ─── Portas de entrada ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._importar_titulo_completo(p_company uuid, p_actor uuid, p_cliente_nome text, p_cpf_cnpj text, p_numero_documento text, p_parcelas jsonb, p_contato text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_cobrador text DEFAULT NULL::text, p_vendedor text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_origem text DEFAULT 'planilha'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := p_company;
  v_doc text := NULLIF(btrim(COALESCE(p_numero_documento, '')), '');
  v_cidade text := NULLIF(btrim(COALESCE(p_cidade, '')), '');
  v_estado text := NULLIF(btrim(COALESCE(p_estado, '')), '');
  v_cpf text := public.normalizar_documento(p_cpf_cnpj);
  v_cliente_id uuid; v_cobrador_id uuid; v_vendedor_id uuid; v_titulo_id uuid; v_titulo_cliente uuid;
  v_parc jsonb; v_num int; v_valor numeric; v_venc date;
  v_total numeric := 0; v_venc_min date; v_processadas int := 0;
  v_existia boolean; v_travado boolean := false; v_mudou boolean := false;
  v_aviso text; v_avisos text[] := '{}';
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;
  IF NOT public.cpf_cnpj_valido(v_cpf) THEN
    RAISE EXCEPTION 'CPF/CNPJ inválido: % (confira os dígitos)', COALESCE(NULLIF(btrim(p_cpf_cnpj), ''), 'vazio');
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.buscar_cliente_arquivado(p_cpf_cnpj text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf text := public.normalizar_documento(p_cpf_cnpj);
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
END; $function$;

CREATE OR REPLACE FUNCTION public.criar_empresa_e_admin(p_nome text, p_cnpj text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company_id uuid; v_uid uuid := auth.uid(); v_cnpj text := NULLIF(public.normalizar_documento(p_cnpj), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Usuário já pertence a uma empresa';
  END IF;
  IF v_cnpj IS NOT NULL AND (length(v_cnpj) <> 14 OR NOT public.cpf_cnpj_valido(v_cnpj)) THEN
    RAISE EXCEPTION 'CNPJ inválido: %', p_cnpj;
  END IF;
  INSERT INTO public.companies (nome, cnpj, slug) VALUES (p_nome, v_cnpj, p_slug) RETURNING id INTO v_company_id;
  UPDATE public.profiles SET company_id = v_company_id WHERE user_id = v_uid;
  -- remove papel default e promove a admin da empresa
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  INSERT INTO public.user_roles (user_id, company_id, role) VALUES (v_uid, v_company_id, 'admin');
  RETURN jsonb_build_object('sucesso', true, 'company_id', v_company_id);
END; $function$;


-- ─── Conferência ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT public.cpf_cnpj_valido('52998224725')          -- CPF válido
     OR public.cpf_cnpj_valido('52998224724')           -- DV errado
     OR public.cpf_cnpj_valido('11111111111')           -- sequência
     OR NOT public.cpf_cnpj_valido('11222333000181')    -- CNPJ numérico
     OR NOT public.cpf_cnpj_valido('12ABC34501DE35')    -- CNPJ alfanumérico (exemplo oficial)
     OR public.cpf_cnpj_valido('12ABC34501DE36')
     OR public.normalizar_documento('12.abc.345/01de-35') <> '12ABC34501DE35' THEN
    RAISE EXCEPTION 'cpf_cnpj_valido com resultado errado';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.buscar_cliente_arquivado(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.criar_empresa_e_admin(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cpf_cnpj_valido(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cpf_cnpj_valido(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant errado';
  END IF;
END $$;
