-- ============================================================================
-- Remove check_overdue_parcelas() — resíduo anterior ao versionamento
--
-- A função foi criada direto no banco, antes de existirem migrations. A
-- 20260601120000 chegou a encontrá-la e ajustou seu search_path dentro de um
-- IF EXISTS: tratou o que estava lá sem adotá-la. Consequência: ela existe em
-- produção e não nasce num `supabase db reset`, então o banco local e o real
-- divergiam por um objeto.
--
-- Não há o que preservar:
--   * nenhuma chamada no app, em migration ou em trigger;
--   * nada a agenda — o projeto não usa pg_cron;
--   * estava com GRANT para anon, authenticated e service_role, e por isso
--     exposta como RPC no PostgREST. Sendo SECURITY INVOKER, a RLS limitava o
--     alcance, mas era superfície sem motivo.
--
-- O que ela fazia — marcar parcela vencida por comparação de data — hoje é
-- derivado na leitura, junto do restante da consolidação de parcelas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.check_overdue_parcelas();

NOTIFY pgrst, 'reload schema';
