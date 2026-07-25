-- =====================================================================
-- Exclusão (soft delete) de cliente pelo admin.
-- =====================================================================
-- Antes: useDeleteCliente fazia DELETE físico, que SEMPRE falhava por FK
-- (titulos.cliente_id REFERENCES clientes, sem ON DELETE CASCADE). Como todo
-- cliente real tem títulos, o admin nunca conseguia excluir — caía num toast
-- genérico. Passa a ser SOFT delete (marca deleted_at) via RPC, bloqueando
-- quando o cliente tem título ou acordo EM ABERTO. Alinha com a filosofia do
-- projeto (cancelamento soft; hard delete só na Plataforma via service_role).
-- A coluna clientes.deleted_at já existia (criada na fundação, nunca usada).

-- ============== 1. RLS: ocultar clientes excluídos ==============
-- Passa a filtrar deleted_at IS NULL: cliente excluído some de TODAS as
-- leituras do app (listas, dropdowns, ficha). A Plataforma usa service_role
-- (bypassa RLS), então a limpeza definitiva por empresa continua enxergando.
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.is_super_admin() OR company_id = public.current_company_id()));

-- O DELETE físico deixa de ser exposto ao app (a exclusão agora é soft, via
-- RPC abaixo, com regra de negócio). Purga definitiva permanece na Plataforma.
DROP POLICY IF EXISTS "clientes_delete_admin" ON public.clientes;

-- ============== 1b. comunicacoes ganha soft delete ==============
-- comunicacoes não tinha deleted_at (só cliente_id/company_id). Ao excluir o
-- cliente queremos ocultar também o histórico de contato dele; para isso a
-- tabela passa a suportar soft delete e a RLS a filtrar registros ocultos.
ALTER TABLE public.comunicacoes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "comunicacoes_select" ON public.comunicacoes;
CREATE POLICY "comunicacoes_select" ON public.comunicacoes FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.is_super_admin() OR company_id = public.current_company_id()));

-- ============== 2. Helper: cliente tem título em aberto? ==============
-- Aberto = título ATIVO (deleted_at IS NULL; cancelado já tem deleted_at) cujo
-- saldo devedor somado das parcelas (mv_parcelas_consolidadas) ainda é > 0.
-- Extraído para manter a RPC principal enxuta e legível.
CREATE OR REPLACE FUNCTION public.cliente_tem_titulo_em_aberto(p_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.titulos t
    JOIN public.mv_parcelas_consolidadas m ON m.titulo_id = t.id
    WHERE t.cliente_id = p_cliente_id
      AND t.deleted_at IS NULL
    GROUP BY t.id
    HAVING COALESCE(SUM(m.saldo_atual), 0) > 0
  );
$$;

-- ============== 3. RPC excluir_cliente (admin, soft) ==============
CREATE OR REPLACE FUNCTION public.excluir_cliente(p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Operação restrita a administradores';
  END IF;

  v_company := public.current_company_id();
  IF NOT EXISTS (
    SELECT 1 FROM public.clientes
    WHERE id = p_cliente_id AND company_id = v_company AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.acordos WHERE cliente_id = p_cliente_id AND status = 'ativo') THEN
    RAISE EXCEPTION 'Cliente possui acordo ativo — cancele o acordo antes de excluir';
  END IF;

  IF public.cliente_tem_titulo_em_aberto(p_cliente_id) THEN
    RAISE EXCEPTION 'Cliente possui títulos em aberto — quite ou cancele antes de excluir';
  END IF;

  -- Soft delete do cliente e ocultação do que só faz sentido com ele: a agenda
  -- de retornos e o histórico de contato (comunicações). Nada é apagado — some
  -- das telas e fica no banco para auditoria/reversão.
  UPDATE public.clientes SET deleted_at = now() WHERE id = p_cliente_id;
  UPDATE public.agendamentos SET deleted_at = now() WHERE cliente_id = p_cliente_id AND deleted_at IS NULL;
  UPDATE public.comunicacoes SET deleted_at = now() WHERE cliente_id = p_cliente_id AND deleted_at IS NULL;
  RETURN jsonb_build_object('sucesso', true, 'cliente_id', p_cliente_id);
END; $$;

-- ============== 4. Permissões ==============
REVOKE EXECUTE ON FUNCTION public.excluir_cliente(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.excluir_cliente(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
