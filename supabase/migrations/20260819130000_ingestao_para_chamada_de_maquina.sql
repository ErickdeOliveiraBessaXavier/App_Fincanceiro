-- ============================================================================
-- Ingestão de títulos utilizável por chamada de máquina (API do ERP)
--
-- `importar_titulo_completo` já faz exatamente o que a API precisa: upsert de
-- cliente por CPF/CNPJ, de título por numero_documento e de parcelas por
-- (titulo_id, numero_parcela), com suporte a parcela já paga. Só que ela é
-- amarrada a um usuário logado em dois pontos que quebram com uma chave de API:
--
--   1. `has_min_role(auth.uid(), 'admin')` — sem sessão, auth.uid() é NULL e a
--      chamada morre em "Apenas administradores podem importar".
--   2. `auth.uid()` como autor em 5 INSERTs — mas `titulos.created_by` é
--      NOT NULL REFERENCES auth.users(id), então o INSERT também falharia.
--
-- Em vez de duplicar ~150 linhas de regra numa segunda função (que sairia do
-- lugar na primeira mudança), o corpo vira `_importar_titulo_completo`, que
-- recebe empresa e ator explicitamente e não decide permissão. A função pública
-- continua com a MESMA assinatura, os MESMOS erros e o MESMO retorno — ela só
-- resolve a empresa, checa a permissão e delega.
--
-- Efeito colateral desejável (CLAUDE.md): a função pública sai de ~150 linhas
-- para ~20, reduzindo bastante a complexidade de um trecho já existente.
-- ============================================================================

-- ============== 1. O motor, sem opinião sobre quem chamou ==============
CREATE OR REPLACE FUNCTION public._importar_titulo_completo(
  p_company          uuid,
  p_actor            uuid,
  p_cliente_nome     text,
  p_cpf_cnpj         text,
  p_numero_documento text,
  p_parcelas         jsonb,
  p_contato          text DEFAULT NULL,
  p_descricao        text DEFAULT NULL,
  p_cobrador         text DEFAULT NULL,
  p_vendedor         text DEFAULT NULL,
  p_cidade           text DEFAULT NULL,
  p_estado           text DEFAULT NULL,
  -- Só muda o texto do movimento de pagamento importado, para o histórico
  -- distinguir uma baixa que veio da planilha de uma que veio do ERP.
  p_origem           text DEFAULT 'planilha'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := p_company;
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_vendedor_id uuid;
  v_titulo_id uuid;
  v_parcela_id uuid;
  v_doc text := NULLIF(trim(coalesce(p_numero_documento,'')), '');
  v_cidade text := NULLIF(trim(coalesce(p_cidade,'')), '');
  v_estado text := NULLIF(trim(coalesce(p_estado,'')), '');
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
  v_parc jsonb;
  v_num int;
  v_valor numeric;
  v_venc date;
  v_pago boolean;
  v_total numeric := 0;
  v_venc_min date;
  v_inseridas int := 0;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  -- Validações básicas
  IF length(v_cpf) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF/CNPJ inválido'; END IF;
  IF coalesce(trim(p_cliente_nome),'') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;
  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Título sem parcelas';
  END IF;

  -- Cobrador (opcional)
  IF p_cobrador IS NOT NULL AND length(trim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, trim(p_cobrador), p_actor) RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  -- Vendedor (opcional)
  IF p_vendedor IS NOT NULL AND length(trim(p_vendedor)) > 0 THEN
    SELECT id INTO v_vendedor_id FROM public.vendedores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_vendedor)) AND deleted_at IS NULL;
    IF v_vendedor_id IS NULL THEN
      INSERT INTO public.vendedores (company_id, nome, created_by)
      VALUES (v_company, trim(p_vendedor), p_actor) RETURNING id INTO v_vendedor_id;
    END IF;
  END IF;

  -- Cliente
  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cidade, estado, cobrador_id, vendedor_id, created_by)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')),''), v_cidade, v_estado, v_cobrador_id, v_vendedor_id, p_actor)
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes SET
      cobrador_id = COALESCE(v_cobrador_id, cobrador_id),
      vendedor_id = COALESCE(v_vendedor_id, vendedor_id),
      cidade = COALESCE(v_cidade, cidade),
      estado = COALESCE(v_estado, estado)
    WHERE id = v_cliente_id;
  END IF;

  -- Pré-cálculo
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de parcela inválido'; END IF;
    IF v_venc IS NULL THEN RAISE EXCEPTION 'Vencimento de parcela inválido'; END IF;
    v_total := v_total + v_valor;
    IF v_venc_min IS NULL OR v_venc < v_venc_min THEN v_venc_min := v_venc; END IF;
  END LOOP;

  -- Título
  IF v_doc IS NOT NULL THEN
    SELECT id INTO v_titulo_id FROM public.titulos
      WHERE company_id = v_company AND numero_documento = v_doc AND deleted_at IS NULL;
  END IF;
  IF v_titulo_id IS NULL THEN
    INSERT INTO public.titulos (company_id, cliente_id, numero_documento, valor_original, vencimento_original, descricao, created_by)
    VALUES (v_company, v_cliente_id, v_doc, v_total, v_venc_min, NULLIF(trim(coalesce(p_descricao,'')),''), p_actor)
    RETURNING id INTO v_titulo_id;
  END IF;

  -- Parcelas (idempotente com suporte a pagamento)
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_num   := (v_parc->>'numero')::int;
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    v_pago  := COALESCE((v_parc->>'pago')::boolean, false);

    INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_company, v_titulo_id, v_num, v_valor, v_venc)
    ON CONFLICT (titulo_id, numero_parcela) DO UPDATE SET
      valor_nominal = EXCLUDED.valor_nominal,
      vencimento = EXCLUDED.vencimento
    RETURNING id INTO v_parcela_id;

    -- Se marcado como pago, registra o evento se ainda não houver pagamento
    IF v_pago THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.movimentos_financeiros
        WHERE parcela_titulo_id = v_parcela_id AND tipo IN ('pagamento_total', 'pagamento_parcial') AND estornado = false
      ) THEN
        INSERT INTO public.movimentos_financeiros (company_id, parcela_titulo_id, tipo, valor, efeito, descricao, created_by)
        VALUES (v_company, v_parcela_id, 'pagamento_total', v_valor, -1,
                format('Pagamento importado via %s', p_origem), p_actor);
      END IF;
    END IF;

    v_inseridas := v_inseridas + 1;
  END LOOP;

  -- Recalcula totais do título
  UPDATE public.titulos t SET
    valor_original = COALESCE((SELECT sum(valor_nominal) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.valor_original),
    vencimento_original = COALESCE((SELECT min(vencimento) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.vencimento_original)
  WHERE t.id = v_titulo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'cliente_id', v_cliente_id,
    'parcelas_processadas', v_inseridas
  );
END; $$;

COMMENT ON FUNCTION public._importar_titulo_completo IS
  'Motor da ingestão de títulos. Recebe empresa e ator prontos e NÃO checa permissão — quem chama é responsável por isso. Use importar_titulo_completo (tela) ou a Edge Function api-v1 (ERP).';

-- Motor interno: nem o app nem a API o chamam direto sem passar por um portão.
REVOKE ALL ON FUNCTION public._importar_titulo_completo(uuid, uuid, text, text, text, jsonb, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._importar_titulo_completo(uuid, uuid, text, text, text, jsonb, text, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._importar_titulo_completo(uuid, uuid, text, text, text, jsonb, text, text, text, text, text, text, text) TO service_role;

-- ============== 2. O portão da tela, agora só portão ==============
-- Assinatura, mensagens de erro e retorno idênticos aos de antes.
CREATE OR REPLACE FUNCTION public.importar_titulo_completo(
  p_company_id uuid, p_cliente_nome text, p_cpf_cnpj text, p_numero_documento text,
  p_parcelas jsonb, p_contato text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text,
  p_cobrador text DEFAULT NULL::text, p_vendedor text DEFAULT NULL::text,
  p_cidade text DEFAULT NULL::text, p_estado text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  -- Empresa efetiva + permissão
  IF public.is_super_admin() THEN
    v_company := p_company_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'Selecione a empresa de destino'; END IF;
  ELSE
    IF NOT public.has_min_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Apenas administradores podem importar';
    END IF;
    v_company := public.current_company_id();
    IF p_company_id IS NOT NULL AND p_company_id <> v_company THEN
      RAISE EXCEPTION 'Empresa inválida para este usuário';
    END IF;
  END IF;

  RETURN public._importar_titulo_completo(
    v_company, auth.uid(), p_cliente_nome, p_cpf_cnpj, p_numero_documento, p_parcelas,
    p_contato, p_descricao, p_cobrador, p_vendedor, p_cidade, p_estado, 'planilha'
  );
END; $$;

NOTIFY pgrst, 'reload schema';
