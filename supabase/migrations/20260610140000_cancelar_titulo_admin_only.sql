-- =====================================================================
-- Cancelamento de título passa a ser exclusivo do ADMIN.
-- =====================================================================
-- Antes exigia >= financeiro. A regra de negócio agora é: só admin (ou
-- super_admin) cancela título. O cancelamento continua sendo soft delete
-- (status='cancelado' + deleted_at), preservando o histórico financeiro —
-- nada é apagado fisicamente.
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
