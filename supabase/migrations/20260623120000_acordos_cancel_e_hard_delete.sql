-- =====================================================================
-- Acordos: cancelamento (soft delete) + exclusão DEFINITIVA (hard delete).
-- =====================================================================
-- Espelha o padrão já adotado em títulos (20260610150000):
--  * Financeiro/Admin: "excluir" = cancelar o acordo (UPDATE status='cancelado'),
--    já coberto pela policy acordos_update existente. Ao cancelar, os títulos
--    vinculados deixam de ser 'renegociado' (a view checa status='ativo') e
--    voltam a ficar disponíveis. O acordo permanece no histórico.
--  * Super admin: pode apagar fisicamente o acordo via a RPC abaixo. As
--    parcelas do acordo são removidas por cascata (FK ON DELETE CASCADE).
--
-- O trigger prevent_hard_delete_financial já libera o super admin (atualizado
-- em 20260610150000), inclusive nos deletes em cascata de parcelas_acordo;
-- para os demais papéis o DELETE físico continua bloqueado.

CREATE OR REPLACE FUNCTION public.excluir_acordos_definitivo(p_acordo_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_acordo_ids IS NULL OR array_length(p_acordo_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('sucesso', true, 'excluidos', 0);
  END IF;
  DELETE FROM public.acordos WHERE id = ANY(p_acordo_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('sucesso', true, 'excluidos', v_count);
END; $$;

NOTIFY pgrst, 'reload schema';
