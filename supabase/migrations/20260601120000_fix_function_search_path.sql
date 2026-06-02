-- Hardening: fixa search_path nas funções que ainda estavam com search_path
-- mutável (advisor function_search_path_mutable). Boa prática para evitar que
-- objetos sejam resolvidos em schemas controlados por terceiros.
ALTER FUNCTION public.role_rank(public.app_role) SET search_path = public;
ALTER FUNCTION public.prevent_hard_delete_financial() SET search_path = public;
ALTER FUNCTION public.check_overdue_parcelas() SET search_path = public;
