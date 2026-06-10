-- =====================================================================
-- Endurecer o INSERT das tabelas de log/notificação.
-- =====================================================================
-- Antes, qualquer usuário autenticado (inclusive 'vendedor' e 'leitura')
-- podia inserir linhas em campaign_logs / activity_logs / notificacoes —
-- as policies só validavam company_id. Passam a exigir >= operador, alinhando
-- com o resto das tabelas (vendedor é read-only).
--
-- Seguro: no frontend essas tabelas só são lidas/atualizadas (mark-as-read);
-- a geração real é server-side (service_role, que ignora RLS).

DROP POLICY IF EXISTS "campaign_logs_insert" ON public.campaign_logs;
CREATE POLICY "campaign_logs_insert" ON public.campaign_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id()
              AND auth.uid() = user_id
              AND public.has_min_role(auth.uid(),'operador'));

DROP POLICY IF EXISTS "notificacoes_insert" ON public.notificacoes;
CREATE POLICY "notificacoes_insert" ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
