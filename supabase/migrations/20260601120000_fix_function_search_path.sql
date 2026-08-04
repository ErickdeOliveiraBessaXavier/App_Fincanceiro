-- Hardening: fixa search_path nas funções que ainda estavam com search_path
-- mutável (advisor function_search_path_mutable). Boa prática para evitar que
-- objetos sejam resolvidos em schemas controlados por terceiros.
ALTER FUNCTION public.role_rank(public.app_role) SET search_path = public;
ALTER FUNCTION public.prevent_hard_delete_financial() SET search_path = public;

-- check_overdue_parcelas foi criada fora do versionamento (era pré-migrations) e
-- só existe em produção — nenhuma migration a cria. O ALTER incondicional
-- quebrava `db reset` do zero com 42883, impedindo validar QUALQUER migration
-- localmente. Condicionar preserva o efeito onde a função existe e deixa a
-- cadeia reproduzível onde não existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_overdue_parcelas'
  ) THEN
    ALTER FUNCTION public.check_overdue_parcelas() SET search_path = public;
  END IF;
END $$;
