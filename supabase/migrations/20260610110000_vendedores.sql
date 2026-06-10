-- =====================================================================
-- Papel "vendedor": carteira de VENDAS, independente da carteira de
-- cobrança. Espelha a estrutura de `cobradores`, mas o vendedor é
-- READ-ONLY (rank abaixo de operador => bloqueado por todas as policies
-- de escrita) e enxerga apenas os clientes/títulos da sua carteira.
--
-- Decisões (ver memória do projeto):
--   - Carteira de vendas é INDEPENDENTE da de cobrança: clientes.vendedor_id
--     é separado de clientes.cobrador_id (vendedor e cobrador podem diferir).
--   - Papéis EXCLUSIVOS: um usuário é cobrador OU vendedor OU nenhum, nunca
--     os dois ao mesmo tempo.
-- =====================================================================

-- ============== 1. role_rank: inserir vendedor abaixo de operador ==============
-- Apenas a ordem relativa importa (has_min_role usa >=). 'vendedor' fica
-- entre 'leitura' e 'operador', logo qualquer has_min_role(...,'operador')
-- falha para o vendedor => sem escrita em lugar nenhum.
CREATE OR REPLACE FUNCTION public.role_rank(_role public.app_role)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'leitura'     THEN 1
    WHEN 'vendedor'    THEN 2
    WHEN 'operador'    THEN 3
    WHEN 'financeiro'  THEN 4
    WHEN 'admin'       THEN 5
    WHEN 'super_admin' THEN 6
  END;
$$;

-- ============== 2. Tabela vendedores (espelho de cobradores) ==============
CREATE TABLE public.vendedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- login do vendedor
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (company_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores TO authenticated;
GRANT ALL ON public.vendedores TO service_role;
CREATE INDEX idx_vendedores_company ON public.vendedores(company_id, ativo);
CREATE INDEX idx_vendedores_user ON public.vendedores(user_id);
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendedores_select" ON public.vendedores FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "vendedores_insert" ON public.vendedores FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "vendedores_update" ON public.vendedores FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "vendedores_delete_admin" ON public.vendedores FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_vendedores BEFORE INSERT ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_vendedores_updated_at BEFORE UPDATE ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_vendedores AFTER INSERT OR UPDATE OR DELETE ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- ============== 3. Vínculo cliente -> vendedor (carteira de vendas) ==============
-- Independente de cobrador_id. ON DELETE SET NULL: remover o vendedor apenas
-- desvincula os clientes, não os apaga.
ALTER TABLE public.clientes
  ADD COLUMN vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;
CREATE INDEX idx_clientes_vendedor ON public.clientes(company_id, vendedor_id);

-- ============== 4. find_or_create_vendedor (usado na importação) ==============
CREATE OR REPLACE FUNCTION public.find_or_create_vendedor(p_nome TEXT)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_company uuid := public.current_company_id();
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;
  SELECT id INTO v_id FROM public.vendedores
    WHERE company_id = v_company AND lower(nome) = lower(trim(p_nome)) AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.vendedores (company_id, nome, created_by)
    VALUES (v_company, trim(p_nome), auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

-- ============== 5. current_vendedor_id ==============
-- Vendedor (ativo) vinculado ao usuário logado, ou NULL se não for vendedor.
CREATE OR REPLACE FUNCTION public.current_vendedor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.vendedores
  WHERE user_id = auth.uid() AND ativo AND deleted_at IS NULL
  LIMIT 1;
$$;

-- ============== 6. Visibilidade de carteira: cobrador OU vendedor ==============
-- As funções mantêm o nome histórico (cobrador_ve_*) para não quebrar as
-- policies que já as referenciam, mas agora consideram as DUAS carteiras.
-- Como os papéis são exclusivos, no máximo um dos current_*_id() é não-nulo;
-- se ambos forem NULL, o usuário não é restrito por carteira (vê tudo da empresa).
CREATE OR REPLACE FUNCTION public.cobrador_ve_cliente(_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = _cliente_id
          AND (c.cobrador_id = public.current_cobrador_id()
               OR c.vendedor_id = public.current_vendedor_id())
      );
$$;

CREATE OR REPLACE FUNCTION public.cobrador_ve_titulo(_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.titulos t
        JOIN public.clientes c ON c.id = t.cliente_id
        WHERE t.id = _titulo_id
          AND (c.cobrador_id = public.current_cobrador_id()
               OR c.vendedor_id = public.current_vendedor_id())
      );
$$;

-- ============== 7. Policies/views com guarda inline de carteira ==============
-- titulos/parcelas/acordos/agendamentos/comunicacoes já usam cobrador_ve_*
-- (atualizadas acima). Aqui recriamos as que tinham current_cobrador_id()
-- inline, trocando pela guarda "nem cobrador nem vendedor".

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
             OR cobrador_id = public.current_cobrador_id()
             OR vendedor_id = public.current_vendedor_id())));

DROP POLICY IF EXISTS "eventos_select" ON public.eventos_parcela;
CREATE POLICY "eventos_select" ON public.eventos_parcela FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
             OR EXISTS (SELECT 1 FROM public.parcelas p
                        WHERE p.id = eventos_parcela.parcela_id AND public.cobrador_ve_titulo(p.titulo_id)))));

DROP POLICY IF EXISTS "parcelas_acordo_select" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_select" ON public.parcelas_acordo FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
             OR EXISTS (SELECT 1 FROM public.acordos a
                        WHERE a.id = parcelas_acordo.acordo_id AND public.cobrador_ve_cliente(a.cliente_id)))));

-- Views: mesma guarda de carteira.
CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
SELECT * FROM public.mv_parcelas_consolidadas
WHERE public.is_super_admin()
   OR (company_id = public.current_company_id()
       AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
            OR public.cobrador_ve_titulo(titulo_id)));

CREATE OR REPLACE VIEW public.vw_titulos_completos AS
SELECT
  t.id, t.company_id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  t.numero_documento, t.descricao, t.valor_original, t.vencimento_original, t.metadata, t.status AS titulo_status,
  t.created_by, t.created_at, t.updated_at,
  COALESCE(p.quantidade_parcelas, 0) AS quantidade_parcelas,
  COALESCE(p.parcelas_pagas, 0) AS parcelas_pagas,
  COALESCE(p.parcelas_pendentes, 0) AS parcelas_pendentes,
  COALESCE(p.parcelas_vencidas, 0) AS parcelas_vencidas,
  COALESCE(p.total_pago, 0) AS total_pago,
  COALESCE(p.total_juros, 0) AS total_juros,
  COALESCE(p.total_multa, 0) AS total_multa,
  COALESCE(p.total_descontos, 0) AS total_descontos,
  COALESCE(p.saldo_devedor, 0) AS saldo_devedor,
  p.proximo_vencimento,
  CASE
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = t.id AND a.status = 'ativo') THEN 'renegociado'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT titulo_id,
    COUNT(*) AS quantidade_parcelas,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'a_vencer') AS parcelas_pendentes,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    SUM(total_pago) AS total_pago, SUM(juros) AS total_juros, SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos, SUM(saldo_atual) AS saldo_devedor,
    MIN(vencimento) FILTER (WHERE status != 'pago') AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas GROUP BY titulo_id
) p ON p.titulo_id = t.id
WHERE t.deleted_at IS NULL
  AND (public.is_super_admin()
       OR (t.company_id = public.current_company_id()
           AND ((public.current_cobrador_id() IS NULL AND public.current_vendedor_id() IS NULL)
                OR public.cobrador_ve_cliente(t.cliente_id))));

-- ============== 8. convites: referência opcional ao vendedor ==============
-- Mesmo fluxo do cobrador; o convite carrega cobrador_id OU vendedor_id.
-- A Edge Function `registrar-convite` não muda (só valida token e cria conta);
-- quem decide o papel/carteira é a autorização do admin no frontend.
ALTER TABLE public.convites
  ADD COLUMN vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL;

-- ============== 9. importar_titulo: mapear coluna VENDEDOR ==============
-- A planilha do cliente (GRAN) tem VENDEDOR separado de COBRADOR.
-- Dropar a assinatura antiga (8 args): adicionar p_vendedor cria um overload
-- novo e a chamada com defaults ficaria ambígua entre as duas versões.
DROP FUNCTION IF EXISTS public.importar_titulo(uuid,text,text,numeric,date,text,text,text);
CREATE OR REPLACE FUNCTION public.importar_titulo(
  p_company_id uuid,
  p_cliente_nome text,
  p_cpf_cnpj text,
  p_valor numeric,
  p_vencimento date,
  p_contato text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_cobrador text DEFAULT NULL,
  p_vendedor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_is_super boolean := public.is_super_admin();
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_vendedor_id uuid;
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

  -- Vendedor (opcional): cria se não existir na empresa
  IF p_vendedor IS NOT NULL AND length(trim(p_vendedor)) > 0 THEN
    SELECT id INTO v_vendedor_id FROM public.vendedores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_vendedor)) AND deleted_at IS NULL;
    IF v_vendedor_id IS NULL THEN
      INSERT INTO public.vendedores (company_id, nome, created_by)
      VALUES (v_company, trim(p_vendedor), auth.uid())
      RETURNING id INTO v_vendedor_id;
    END IF;
  END IF;

  -- Cliente: busca por CPF/CNPJ na empresa; cria se não existir
  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cobrador_id, vendedor_id, created_by, status)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')), ''), v_cobrador_id, v_vendedor_id, auth.uid(), 'ativo')
    RETURNING id INTO v_cliente_id;
  ELSE
    IF v_cobrador_id IS NOT NULL THEN
      UPDATE public.clientes SET cobrador_id = v_cobrador_id WHERE id = v_cliente_id;
    END IF;
    IF v_vendedor_id IS NOT NULL THEN
      UPDATE public.clientes SET vendedor_id = v_vendedor_id WHERE id = v_cliente_id;
    END IF;
  END IF;

  -- Título + parcela única (numero_documento e evento de emissão via triggers)
  INSERT INTO public.titulos (company_id, cliente_id, valor_original, vencimento_original, descricao, created_by)
  VALUES (v_company, v_cliente_id, p_valor, p_vencimento, NULLIF(trim(coalesce(p_descricao,'')), ''), auth.uid())
  RETURNING id INTO v_titulo_id;

  INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
  VALUES (v_company, v_titulo_id, 1, p_valor, p_vencimento);

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'cliente_id', v_cliente_id);
END; $$;
