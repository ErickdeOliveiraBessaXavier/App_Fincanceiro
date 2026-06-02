-- ====================================================================
-- FIX DE ISOLAMENTO MULTI-TENANT
-- Fecha dois vetores de vazamento entre empresas (tenants):
--
--   #2 (CRÍTICO) — Um usuário podia dar UPDATE no próprio profile e trocar
--      `company_id` para o de outra empresa (a policy de UPDATE usava apenas
--      `auth.uid() = user_id`, sem WITH CHECK que travasse a coluna). Após
--      renovar o token, `current_company_id()` passava a apontar para a vítima
--      e TODAS as policies de SELECT liberavam leitura só por company_id.
--      -> Correção: privilégio de UPDATE por COLUNA. O usuário autenticado só
--         pode alterar `nome`/`email`; `company_id` fica imutável para ele.
--         Quem define a empresa continua sendo `criar_empresa_e_admin`
--         (SECURITY DEFINER, roda como owner) e as Edge Functions (service_role)
--         — ambos ignoram este GRANT.
--
--   #3 (ALTO) — `has_min_role()` não filtrava por empresa: um admin da Empresa A
--      era considerado admin em QUALQUER tenant para onde `current_company_id()`
--      apontasse, amplificando qualquer falha de isolamento.
--      -> Correção: exigir que o papel pertença ao tenant atual
--         (super_admin, cujo papel é global, continua valendo em qualquer lugar).
--
-- Observação: a falha #1 (signup confiando em company_id/role do metadata) já
-- havia sido corrigida em 20260531220000_carteira_rls.sql (handle_new_user).
-- ====================================================================

-- ============== #3: has_min_role escopada por empresa ==============
CREATE OR REPLACE FUNCTION public.has_min_role(_uid uuid, _min public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND public.role_rank(ur.role) >= public.role_rank(_min)
      AND (ur.role = 'super_admin' OR ur.company_id = public.current_company_id())
  );
$$;

-- ============== #2: company_id imutável para o usuário autenticado ==============
-- Remove o UPDATE amplo e concede apenas nas colunas seguras. Assim, mesmo com a
-- policy RLS permitindo a linha, o usuário não consegue tocar em `company_id`.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nome, email) ON public.profiles TO authenticated;
