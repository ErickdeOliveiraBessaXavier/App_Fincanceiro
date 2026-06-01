-- ============================================================
-- Carteira do representante: usuário "representante" vê só os clientes
-- da sua carteira (clientes.representante_id = seu representante).
-- Usuários não-representantes (admin/financeiro/operador/leitura) veem
-- todos os dados da empresa, como antes.
-- ============================================================

-- Representante (ativo) vinculado ao usuário logado, ou NULL se não for representante.
CREATE OR REPLACE FUNCTION public.current_rep_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.representantes
  WHERE user_id = auth.uid() AND ativo AND deleted_at IS NULL
  LIMIT 1;
$$;

-- true se o usuário NÃO é representante restrito, OU o cliente é da sua carteira.
CREATE OR REPLACE FUNCTION public.rep_ve_cliente(_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_rep_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = _cliente_id AND c.representante_id = public.current_rep_id()
      );
$$;

-- idem, a partir de um título (via cliente do título).
CREATE OR REPLACE FUNCTION public.rep_ve_titulo(_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_rep_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.titulos t
        JOIN public.clientes c ON c.id = t.cliente_id
        WHERE t.id = _titulo_id AND c.representante_id = public.current_rep_id()
      );
$$;

-- ============== Recriar SELECT policies com filtro de carteira ==============

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND (public.current_rep_id() IS NULL OR representante_id = public.current_rep_id())));

DROP POLICY IF EXISTS "titulos_select" ON public.titulos;
CREATE POLICY "titulos_select" ON public.titulos FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id() AND public.rep_ve_cliente(cliente_id)));

DROP POLICY IF EXISTS "parcelas_select" ON public.parcelas;
CREATE POLICY "parcelas_select" ON public.parcelas FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id() AND public.rep_ve_titulo(titulo_id)));

DROP POLICY IF EXISTS "eventos_select" ON public.eventos_parcela;
CREATE POLICY "eventos_select" ON public.eventos_parcela FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND (public.current_rep_id() IS NULL
             OR EXISTS (SELECT 1 FROM public.parcelas p
                        WHERE p.id = eventos_parcela.parcela_id AND public.rep_ve_titulo(p.titulo_id)))));

DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id() AND public.rep_ve_cliente(cliente_id)));

DROP POLICY IF EXISTS "parcelas_acordo_select" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_select" ON public.parcelas_acordo FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id()
        AND (public.current_rep_id() IS NULL
             OR EXISTS (SELECT 1 FROM public.acordos a
                        WHERE a.id = parcelas_acordo.acordo_id AND public.rep_ve_cliente(a.cliente_id)))));

DROP POLICY IF EXISTS "agendamentos_select" ON public.agendamentos;
CREATE POLICY "agendamentos_select" ON public.agendamentos FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id() AND public.rep_ve_cliente(cliente_id)));

DROP POLICY IF EXISTS "comunicacoes_select" ON public.comunicacoes;
CREATE POLICY "comunicacoes_select" ON public.comunicacoes FOR SELECT TO authenticated
  USING (public.is_super_admin()
    OR (company_id = public.current_company_id() AND public.rep_ve_cliente(cliente_id)));

-- ============== Views: aplicar o mesmo filtro de carteira ==============

CREATE OR REPLACE VIEW public.vw_parcelas_consolidadas AS
SELECT * FROM public.mv_parcelas_consolidadas
WHERE public.is_super_admin()
   OR (company_id = public.current_company_id()
       AND (public.current_rep_id() IS NULL OR public.rep_ve_titulo(titulo_id)));

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
           AND (public.current_rep_id() IS NULL OR public.rep_ve_cliente(t.cliente_id))));

-- ============== Fix de segurança: handle_new_user não confia no metadata ==============
-- A empresa do usuário é definida apenas por criar_empresa_e_admin (self-service)
-- ou pela Edge Function de criação de usuários (admin), nunca por metadata do cliente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'name', 'Usuário'),
    NEW.email);
  RETURN NEW;
END; $$;
