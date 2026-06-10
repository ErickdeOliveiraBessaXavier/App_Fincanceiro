-- =====================================================================
-- Importação agrupada por título: 1 título (numero_documento) com N parcelas.
-- =====================================================================
-- Atende o formato real do cliente (GRAN): cada linha da planilha é uma
-- PARCELA; várias linhas com o mesmo Nº TITULO formam um único título.
-- O importador agrupa as linhas por título e chama este RPC uma vez por título.
--
-- - Dedup do título por (company_id, numero_documento) — já há índice único.
-- - find-or-create de cliente (por CPF/CNPJ), cobrador e vendedor (por nome).
-- - Grava município/UF no cliente (cidade/estado).
-- - Idempotente: reimportar não duplica parcelas (ON CONFLICT por nº parcela);
--   os totais do título são recalculados a partir das parcelas.
CREATE OR REPLACE FUNCTION public.importar_titulo_completo(
  p_company_id uuid,
  p_cliente_nome text,
  p_cpf_cnpj text,
  p_numero_documento text,
  p_parcelas jsonb,
  p_contato text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_cobrador text DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_estado text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_is_super boolean := public.is_super_admin();
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_vendedor_id uuid;
  v_titulo_id uuid;
  v_doc text := NULLIF(trim(coalesce(p_numero_documento,'')), '');
  v_cidade text := NULLIF(trim(coalesce(p_cidade,'')), '');
  v_estado text := NULLIF(trim(coalesce(p_estado,'')), '');
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
  v_parc jsonb;
  v_num int;
  v_valor numeric;
  v_venc date;
  v_total numeric := 0;
  v_venc_min date;
  v_inseridas int := 0;
BEGIN
  -- Empresa efetiva + permissão (igual importar_titulo)
  IF v_is_super THEN
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
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  -- Validações básicas
  IF length(v_cpf) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF/CNPJ inválido'; END IF;
  IF coalesce(trim(p_cliente_nome),'') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;
  IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Título sem parcelas';
  END IF;

  -- Cobrador (opcional): find-or-create por nome
  IF p_cobrador IS NOT NULL AND length(trim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, trim(p_cobrador), auth.uid()) RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  -- Vendedor (opcional): find-or-create por nome
  IF p_vendedor IS NOT NULL AND length(trim(p_vendedor)) > 0 THEN
    SELECT id INTO v_vendedor_id FROM public.vendedores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_vendedor)) AND deleted_at IS NULL;
    IF v_vendedor_id IS NULL THEN
      INSERT INTO public.vendedores (company_id, nome, created_by)
      VALUES (v_company, trim(p_vendedor), auth.uid()) RETURNING id INTO v_vendedor_id;
    END IF;
  END IF;

  -- Cliente (por CPF/CNPJ): cria se não existir, senão completa dados em branco
  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cidade, estado, cobrador_id, vendedor_id, created_by, status)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')),''), v_cidade, v_estado, v_cobrador_id, v_vendedor_id, auth.uid(), 'ativo')
    RETURNING id INTO v_cliente_id;
  ELSE
    UPDATE public.clientes SET
      cobrador_id = COALESCE(v_cobrador_id, cobrador_id),
      vendedor_id = COALESCE(v_vendedor_id, vendedor_id),
      cidade = COALESCE(v_cidade, cidade),
      estado = COALESCE(v_estado, estado)
    WHERE id = v_cliente_id;
  END IF;

  -- Pré-cálculo: total e menor vencimento (também valida cada parcela)
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de parcela inválido'; END IF;
    IF v_venc IS NULL THEN RAISE EXCEPTION 'Vencimento de parcela inválido'; END IF;
    v_total := v_total + v_valor;
    IF v_venc_min IS NULL OR v_venc < v_venc_min THEN v_venc_min := v_venc; END IF;
  END LOOP;

  -- Título: dedup por numero_documento dentro da empresa
  IF v_doc IS NOT NULL THEN
    SELECT id INTO v_titulo_id FROM public.titulos
      WHERE company_id = v_company AND numero_documento = v_doc AND deleted_at IS NULL;
  END IF;
  IF v_titulo_id IS NULL THEN
    INSERT INTO public.titulos (company_id, cliente_id, numero_documento, valor_original, vencimento_original, descricao, created_by)
    VALUES (v_company, v_cliente_id, v_doc, v_total, v_venc_min, NULLIF(trim(coalesce(p_descricao,'')),''), auth.uid())
    RETURNING id INTO v_titulo_id;
  END IF;

  -- Parcelas (idempotente por nº de parcela)
  FOR v_parc IN SELECT jsonb_array_elements(p_parcelas) LOOP
    v_num   := (v_parc->>'numero')::int;
    v_valor := (v_parc->>'valor')::numeric;
    v_venc  := (v_parc->>'vencimento')::date;
    INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_company, v_titulo_id, v_num, v_valor, v_venc)
    ON CONFLICT (titulo_id, numero_parcela) DO NOTHING;
    IF FOUND THEN v_inseridas := v_inseridas + 1; END IF;
  END LOOP;

  -- Recalcula totais do título a partir das parcelas (consistente em reimport)
  UPDATE public.titulos t SET
    valor_original = COALESCE((SELECT sum(valor_nominal) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.valor_original),
    vencimento_original = COALESCE((SELECT min(vencimento) FROM public.parcelas WHERE titulo_id = t.id AND deleted_at IS NULL), t.vencimento_original)
  WHERE t.id = v_titulo_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'titulo_id', v_titulo_id,
    'cliente_id', v_cliente_id,
    'parcelas_inseridas', v_inseridas
  );
END; $$;

-- Recarrega o cache do PostgREST para o RPC ficar disponível imediatamente.
NOTIFY pgrst, 'reload schema';
