-- =====================================================================
-- Remover o soft delete (cancelamento) de título.
-- =====================================================================
-- Decisão: exclusão de título passa a ser só do super admin (hard delete via
-- excluir_titulos_definitivo / limpar_titulos_empresa). O cancelamento
-- (cancelar_titulo) sai. O admin da empresa não exclui mais título.
DROP FUNCTION IF EXISTS public.cancelar_titulo(uuid, text);
