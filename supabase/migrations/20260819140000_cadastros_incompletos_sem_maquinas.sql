-- ============================================================================
-- "Cadastros incompletos" volta a listar só gente
--
-- O painel existe para achar CLIENTE REAL travado no meio do cadastro: conta
-- criada, empresa nunca concluída. O critério é `company_id IS NULL` e sem
-- papel.
--
-- O usuário técnico da integração ("Integração ERP", ator das chaves de API)
-- cai exatamente nesse critério — ele não pertence a time nenhum de propósito,
-- justamente para não aparecer como membro da equipe nem receber permissão. Só
-- que aí ele passou a poluir o painel, que perde a serventia se acumular ruído.
--
-- Correção: contas de máquina saem da lista. A identificação é semântica (a
-- conta é ator de alguma chave de API), não por formato de e-mail.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cadastros_incompletos()
RETURNS TABLE(user_id uuid, nome text, email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;

  RETURN QUERY
    SELECT p.user_id, p.nome, p.email, p.created_at
    FROM public.profiles p
    WHERE p.company_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id
      )
      -- Conta de máquina não é cadastro travado: é integração funcionando.
      AND NOT EXISTS (
        SELECT 1 FROM public.api_keys k WHERE k.actor_id = p.user_id
      )
    ORDER BY p.created_at DESC;
END; $$;

-- ============================================================================
-- Confirmação de que um cadastro pode ser descartado
--
-- Quem apaga a conta é a Edge Function (Admin API do GoTrue), mas a decisão de
-- "isto é descartável" é do banco, onde estão os fatos. Assim a função não
-- precisa reimplementar o critério do painel — e não há como ela apagar por
-- engano uma conta real que só passou perto.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cadastro_incompleto_descartavel(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = p_user_id
      AND p.company_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.api_keys k WHERE k.actor_id = p.user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.cadastro_incompleto_descartavel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cadastro_incompleto_descartavel(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
