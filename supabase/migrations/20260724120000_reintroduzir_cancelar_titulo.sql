-- =====================================================================
-- Reintroduz o cancelamento de título (soft delete) para o ADMIN.
-- =====================================================================
-- Contexto: 20260610140000 criou cancelar_titulo (admin, soft delete) e
-- 20260610170000 a removeu, deixando apenas o hard delete de super admin.
-- Decisão do gestor (2026-07-24): o admin da empresa volta a poder CANCELAR
-- um título individual — soft delete reversível que preserva o histórico
-- financeiro (nada é apagado). O hard delete de super admin permanece como
-- opção definitiva.
--
-- Regras:
--  * Exige papel admin (ou super_admin) — has_min_role(...,'admin').
--  * status = 'cancelado' + deleted_at = now() (a vw_titulos_completos já
--    filtra deleted_at IS NULL, então o título some das listagens).
--  * As parcelas recebem deleted_at para sair das consolidações.
--  * O motivo é guardado em metadata.motivo_cancelamento.
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

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END; $$;

REVOKE EXECUTE ON FUNCTION public.cancelar_titulo(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancelar_titulo(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
