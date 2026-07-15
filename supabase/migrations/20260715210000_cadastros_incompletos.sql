-- =====================================================================
-- Cadastros incompletos: contas que se cadastraram e não concluíram
-- =====================================================================
-- O painel da Plataforma lista `companies`. Quem cria a conta mas não conclui a
-- criação da empresa não é uma company — fica com profile, company_id NULL e
-- nenhum papel, e não aparece em tela nenhuma. Na prática é um cadastro parado
-- que ninguém vê: se for um cliente real, ele trava em silêncio.
--
-- O super admin é excluído naturalmente: ele tem company_id NULL, mas tem papel.

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
    ORDER BY p.created_at DESC;
END; $$;

REVOKE EXECUTE ON FUNCTION public.cadastros_incompletos() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cadastros_incompletos() TO authenticated;

NOTIFY pgrst, 'reload schema';
