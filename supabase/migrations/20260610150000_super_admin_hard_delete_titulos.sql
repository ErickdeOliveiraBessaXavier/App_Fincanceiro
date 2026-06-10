-- =====================================================================
-- Exclusão DEFINITIVA (hard delete) de títulos — exclusiva do super admin.
-- =====================================================================
-- Para os demais papéis, "excluir" continua sendo cancelamento (soft delete).
-- O super admin pode apagar fisicamente (limpeza de teste / atender solicitação).
-- Apagar o título cascateia para parcelas, eventos, acordos, parcelas de acordo,
-- anexos e logs de campanha (FKs ON DELETE CASCADE); agendamentos ficam com o
-- vínculo nulo (ON DELETE SET NULL). Clientes/cobradores/vendedores são mantidos.

-- 1) O trigger anti-delete físico passa a liberar o super admin.
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_financial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Super admin pode apagar fisicamente (inclui os deletes em cascata).
  IF public.is_super_admin() THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'DELETE físico bloqueado em %. Use cancelamento/estorno (soft-delete).', TG_TABLE_NAME;
END; $$;

-- 2) Exclusão definitiva de títulos selecionados (por ids).
CREATE OR REPLACE FUNCTION public.excluir_titulos_definitivo(p_titulo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;
  DELETE FROM public.titulos WHERE id = ANY(p_titulo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

-- 3) Limpar TODOS os títulos de uma empresa (útil em fase de teste).
CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

NOTIFY pgrst, 'reload schema';
