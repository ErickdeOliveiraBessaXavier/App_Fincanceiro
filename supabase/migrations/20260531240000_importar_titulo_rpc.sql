-- Importação de título (1 linha do CSV) centralizada no backend.
-- Resolve permissão e company_id:
--   - super_admin: importa para a empresa informada (p_company_id obrigatório).
--   - admin da empresa: importa para a própria empresa.
-- Cria/atualiza cliente (por CPF/CNPJ), cobrador (por nome) e o título + parcela.
CREATE OR REPLACE FUNCTION public.importar_titulo(
  p_company_id uuid,
  p_cliente_nome text,
  p_cpf_cnpj text,
  p_valor numeric,
  p_vencimento date,
  p_contato text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_cobrador text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_is_super boolean := public.is_super_admin();
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_titulo_id uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
BEGIN
  -- Empresa efetiva + permissão
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
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF coalesce(trim(p_cliente_nome),'') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;

  -- Cobrador (opcional): cria se não existir na empresa
  IF p_cobrador IS NOT NULL AND length(trim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, trim(p_cobrador), auth.uid())
      RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  -- Cliente: busca por CPF/CNPJ na empresa; cria se não existir
  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cobrador_id, created_by, status)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')), ''), v_cobrador_id, auth.uid(), 'ativo')
    RETURNING id INTO v_cliente_id;
  ELSIF v_cobrador_id IS NOT NULL THEN
    UPDATE public.clientes SET cobrador_id = v_cobrador_id WHERE id = v_cliente_id;
  END IF;

  -- Título + parcela única (numero_documento e evento de emissão via triggers)
  INSERT INTO public.titulos (company_id, cliente_id, valor_original, vencimento_original, descricao, created_by)
  VALUES (v_company, v_cliente_id, p_valor, p_vencimento, NULLIF(trim(coalesce(p_descricao,'')), ''), auth.uid())
  RETURNING id INTO v_titulo_id;

  INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
  VALUES (v_company, v_titulo_id, 1, p_valor, p_vencimento);

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'cliente_id', v_cliente_id);
END; $$;
