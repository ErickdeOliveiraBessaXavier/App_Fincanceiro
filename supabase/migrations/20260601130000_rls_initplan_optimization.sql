-- Otimizacao RLS (advisor auth_rls_initplan): envolve chamadas estaveis em
-- (select ...) para o planner avaliar UMA vez por query, nao por linha.
-- Logica das policies inalterada; apenas a forma das chamadas muda.

DROP POLICY IF EXISTS "acordos_insert" ON public.acordos;
CREATE POLICY "acordos_insert" ON public.acordos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND rep_ve_cliente(cliente_id))));

DROP POLICY IF EXISTS "acordos_update" ON public.acordos;
CREATE POLICY "acordos_update" ON public.acordos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND ((select auth.uid()) = user_id)));

DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
CREATE POLICY "activity_logs_select" ON public.activity_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id()))));

DROP POLICY IF EXISTS "agendamentos_delete" ON public.agendamentos;
CREATE POLICY "agendamentos_delete" ON public.agendamentos
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "agendamentos_insert" ON public.agendamentos;
CREATE POLICY "agendamentos_insert" ON public.agendamentos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "agendamentos_select" ON public.agendamentos;
CREATE POLICY "agendamentos_select" ON public.agendamentos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND rep_ve_cliente(cliente_id))));

DROP POLICY IF EXISTS "agendamentos_update" ON public.agendamentos;
CREATE POLICY "agendamentos_update" ON public.agendamentos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "anexos_delete" ON public.anexos;
CREATE POLICY "anexos_delete" ON public.anexos
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "anexos_insert" ON public.anexos;
CREATE POLICY "anexos_insert" ON public.anexos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "anexos_select" ON public.anexos;
CREATE POLICY "anexos_select" ON public.anexos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id()))));

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select" ON public.audit_log
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "campaign_logs_insert" ON public.campaign_logs;
CREATE POLICY "campaign_logs_insert" ON public.campaign_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = (select current_company_id())));

DROP POLICY IF EXISTS "campaign_logs_select" ON public.campaign_logs;
CREATE POLICY "campaign_logs_select" ON public.campaign_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id()))));

DROP POLICY IF EXISTS "campanhas_delete_admin" ON public.campanhas;
CREATE POLICY "campanhas_delete_admin" ON public.campanhas
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "campanhas_insert" ON public.campanhas;
CREATE POLICY "campanhas_insert" ON public.campanhas
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "campanhas_select" ON public.campanhas;
CREATE POLICY "campanhas_select" ON public.campanhas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id()))));

DROP POLICY IF EXISTS "campanhas_update" ON public.campanhas;
CREATE POLICY "campanhas_update" ON public.campanhas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "clientes_delete_admin" ON public.clientes;
CREATE POLICY "clientes_delete_admin" ON public.clientes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
CREATE POLICY "clientes_select" ON public.clientes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND (((select current_rep_id()) IS NULL) OR (representante_id = (select current_rep_id()))))));

DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
CREATE POLICY "clientes_update" ON public.clientes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "companies_super_admin_all" ON public.companies;
CREATE POLICY "companies_super_admin_all" ON public.companies
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((select is_super_admin()))
  WITH CHECK ((select is_super_admin()));

DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (id = (select current_company_id()))));

DROP POLICY IF EXISTS "companies_admin_update" ON public.companies;
CREATE POLICY "companies_admin_update" ON public.companies
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)))
  WITH CHECK (((id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "comunicacoes_insert" ON public.comunicacoes;
CREATE POLICY "comunicacoes_insert" ON public.comunicacoes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "comunicacoes_select" ON public.comunicacoes;
CREATE POLICY "comunicacoes_select" ON public.comunicacoes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND rep_ve_cliente(cliente_id))));

DROP POLICY IF EXISTS "comunicacoes_update" ON public.comunicacoes;
CREATE POLICY "comunicacoes_update" ON public.comunicacoes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "convites_delete" ON public.convites;
CREATE POLICY "convites_delete" ON public.convites
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "convites_insert" ON public.convites;
CREATE POLICY "convites_insert" ON public.convites
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "convites_select" ON public.convites;
CREATE POLICY "convites_select" ON public.convites
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "convites_update" ON public.convites;
CREATE POLICY "convites_update" ON public.convites
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)))
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "eventos_insert" ON public.eventos_parcela;
CREATE POLICY "eventos_insert" ON public.eventos_parcela
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "eventos_select" ON public.eventos_parcela;
CREATE POLICY "eventos_select" ON public.eventos_parcela
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND (((select current_rep_id()) IS NULL) OR (EXISTS ( SELECT 1
   FROM parcelas p
  WHERE ((p.id = eventos_parcela.parcela_id) AND rep_ve_titulo(p.titulo_id))))))));

DROP POLICY IF EXISTS "eventos_update" ON public.eventos_parcela;
CREATE POLICY "eventos_update" ON public.eventos_parcela
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "notificacoes_insert" ON public.notificacoes;
CREATE POLICY "notificacoes_insert" ON public.notificacoes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = (select current_company_id())));

DROP POLICY IF EXISTS "notificacoes_select_own" ON public.notificacoes;
CREATE POLICY "notificacoes_select_own" ON public.notificacoes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = (select current_company_id())) AND ((select auth.uid()) = user_id)));

DROP POLICY IF EXISTS "notificacoes_update_own" ON public.notificacoes;
CREATE POLICY "notificacoes_update_own" ON public.notificacoes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND ((select auth.uid()) = user_id)));

DROP POLICY IF EXISTS "parcelas_insert" ON public.parcelas;
CREATE POLICY "parcelas_insert" ON public.parcelas
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "parcelas_select" ON public.parcelas;
CREATE POLICY "parcelas_select" ON public.parcelas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND rep_ve_titulo(titulo_id))));

DROP POLICY IF EXISTS "parcelas_update" ON public.parcelas;
CREATE POLICY "parcelas_update" ON public.parcelas
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "parcelas_acordo_insert" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_insert" ON public.parcelas_acordo
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "parcelas_acordo_select" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_select" ON public.parcelas_acordo
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND (((select current_rep_id()) IS NULL) OR (EXISTS ( SELECT 1
   FROM acordos a
  WHERE ((a.id = parcelas_acordo.acordo_id) AND rep_ve_cliente(a.cliente_id))))))));

DROP POLICY IF EXISTS "parcelas_acordo_update" ON public.parcelas_acordo;
CREATE POLICY "parcelas_acordo_update" ON public.parcelas_acordo
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "profiles_select_tenant" ON public.profiles;
CREATE POLICY "profiles_select_tenant" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id())) OR ((select auth.uid()) = user_id)));

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((select auth.uid()) = user_id) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role))));

DROP POLICY IF EXISTS "representantes_delete_admin" ON public.representantes;
CREATE POLICY "representantes_delete_admin" ON public.representantes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY IF EXISTS "representantes_insert" ON public.representantes;
CREATE POLICY "representantes_insert" ON public.representantes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "representantes_select" ON public.representantes;
CREATE POLICY "representantes_select" ON public.representantes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR (company_id = (select current_company_id()))));

DROP POLICY IF EXISTS "representantes_update" ON public.representantes;
CREATE POLICY "representantes_update" ON public.representantes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "titulos_insert" ON public.titulos;
CREATE POLICY "titulos_insert" ON public.titulos
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'operador'::app_role)));

DROP POLICY IF EXISTS "titulos_select" ON public.titulos;
CREATE POLICY "titulos_select" ON public.titulos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND rep_ve_cliente(cliente_id))));

DROP POLICY IF EXISTS "titulos_update" ON public.titulos;
CREATE POLICY "titulos_update" ON public.titulos
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'financeiro'::app_role)));

DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role) AND (role <> 'super_admin'::app_role))))
  WITH CHECK (((select is_super_admin()) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role) AND (role <> 'super_admin'::app_role))));

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select is_super_admin()) OR ((select auth.uid()) = user_id) OR ((company_id = (select current_company_id())) AND has_min_role((select auth.uid()), 'admin'::app_role))));
