-- =====================================================================
-- Limpar agendamentos ao excluir/cancelar título (remove resíduo).
-- =====================================================================
-- agendamentos.titulo_id usa ON DELETE SET NULL — no hard delete de título o
-- agendamento sobrevivia órfão (titulo_id NULL); no cancelamento (soft) ficava
-- obsoleto, lembrando o cobrador de um título já cancelado. Agora os três
-- caminhos que "excluem" título limpam também seus agendamentos.
--
-- comunicacoes NÃO é tocada por título de propósito: não tem titulo_id (é
-- histórico de contato do CLIENTE, não de um título). Seu soft delete acontece
-- na exclusão do cliente (migration 20260724160000).

-- ============== 0. RLS: agendamentos ocultam soft delete ==============
-- agendamentos.deleted_at já existia, mas nada o filtrava — então o soft delete
-- (cancelar_titulo / excluir_cliente) não sumia da agenda. A RLS passa a
-- esconder registros ocultos. Plataforma usa service_role (bypassa RLS).
DROP POLICY IF EXISTS "agendamentos_select" ON public.agendamentos;
CREATE POLICY "agendamentos_select" ON public.agendamentos FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.is_super_admin() OR company_id = public.current_company_id()));

-- ============== 1. cancelar_titulo (admin, soft) ==============
-- Soft-deleta TODOS os agendamentos do título (pendentes e concluídos) para
-- sumirem da agenda junto com o título cancelado.
CREATE OR REPLACE FUNCTION public.cancelar_titulo(
  p_titulo_id uuid, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo record;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Operação restrita ao administrador'; END IF;
  SELECT * INTO v_titulo FROM public.titulos
    WHERE id = p_titulo_id AND company_id = public.current_company_id();
  IF v_titulo.id IS NULL THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF v_titulo.status = 'cancelado' THEN RAISE EXCEPTION 'Título já cancelado'; END IF;

  UPDATE public.titulos
    SET status = 'cancelado', deleted_at = now(),
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('motivo_cancelamento', p_motivo)
    WHERE id = p_titulo_id;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;
  UPDATE public.agendamentos SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END; $$;

-- ============== 2. excluir_titulos_definitivo (super admin, hard) ==============
-- Apaga de vez os agendamentos dos títulos purgados (senão ficariam órfãos
-- via SET NULL).
CREATE OR REPLACE FUNCTION public.excluir_titulos_definitivo(p_titulo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_titulo_ids IS NULL OR array_length(p_titulo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;
  DELETE FROM public.agendamentos WHERE titulo_id = ANY(p_titulo_ids);
  DELETE FROM public.titulos WHERE id = ANY(p_titulo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

-- ============== 3. limpar_titulos_empresa (super admin, hard) ==============
-- Ao limpar todos os títulos da empresa, apaga também os agendamentos ligados
-- a título (titulo_id IS NOT NULL). Os agendamentos gerais do cliente
-- (titulo_id NULL) são preservados.
CREATE OR REPLACE FUNCTION public.limpar_titulos_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não informada'; END IF;
  DELETE FROM public.agendamentos WHERE company_id = p_company_id AND titulo_id IS NOT NULL;
  DELETE FROM public.titulos WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  REFRESH MATERIALIZED VIEW public.mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count, 'company_id', p_company_id);
END; $$;

NOTIFY pgrst, 'reload schema';
