-- =====================================================================
-- Atualizar a MV após exclusão definitiva de títulos.
-- =====================================================================
-- A mv_parcelas_consolidadas é um cache (snapshot). As RPCs de hard delete
-- não a recalculavam, então valores de títulos já apagados continuavam
-- aparecendo. Agora cada exclusão recalcula a MV, e abaixo limpamos o
-- snapshot atual de uma vez. Usamos REFRESH não-concorrente (pode rodar
-- dentro da função/transação; concorrente não pode).

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
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

-- Limpa o snapshot atual (remove os valores fantasmas de títulos já apagados).
REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
