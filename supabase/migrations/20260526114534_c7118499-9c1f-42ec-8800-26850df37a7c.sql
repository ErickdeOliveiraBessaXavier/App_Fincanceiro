TRUNCATE TABLE
  public.eventos_parcela, public.parcelas_acordo, public.acordos,
  public.parcelas, public.titulos, public.comunicacoes, public.agendamentos,
  public.anexos, public.notificacoes, public.campaign_logs, public.campanhas,
  public.activity_logs, public.clientes, public.user_roles, public.profiles
RESTART IDENTITY CASCADE;

TRUNCATE TABLE public.audit_log RESTART IDENTITY CASCADE;

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  plano TEXT NOT NULL DEFAULT 'basico',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role = 'super_admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

DO $$
DECLARE
  t TEXT;
  domain_tables TEXT[] := ARRAY[
    'clientes','titulos','parcelas','eventos_parcela','acordos','parcelas_acordo',
    'comunicacoes','agendamentos','anexos','notificacoes','campanhas','campaign_logs','activity_logs'
  ];
  financial_tables TEXT[] := ARRAY[
    'titulos','parcelas','eventos_parcela','acordos','parcelas_acordo'
  ];
BEGIN
  FOREACH t IN ARRAY domain_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_id ON public.%I(company_id)', t, t);
  END LOOP;
  FOREACH t IN ARRAY financial_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_company_id()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user_company UUID;
BEGIN
  v_user_company := public.current_company_id();
  IF NEW.company_id IS NULL THEN
    NEW.company_id := v_user_company;
  END IF;
  IF NOT public.is_super_admin() THEN
    IF NEW.company_id IS DISTINCT FROM v_user_company THEN
      RAISE EXCEPTION 'Acesso negado: company_id inválido';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_hard_delete_financial()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hard delete bloqueado em tabela financeira. Use soft delete (deleted_at).';
  END IF;
  RETURN OLD;
END;
$$;

DO $$
DECLARE
  t TEXT;
  domain_tables TEXT[] := ARRAY[
    'clientes','titulos','parcelas','eventos_parcela','acordos','parcelas_acordo',
    'comunicacoes','agendamentos','anexos','notificacoes','campanhas','campaign_logs','activity_logs'
  ];
  financial_tables TEXT[] := ARRAY[
    'titulos','parcelas','eventos_parcela','acordos','parcelas_acordo'
  ];
BEGIN
  FOREACH t IN ARRAY domain_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_company_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_set_company_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id()', t);
  END LOOP;
  FOREACH t IN ARRAY financial_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_hard_delete ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_prevent_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial()', t);
  END LOOP;
END $$;

DO $$
DECLARE
  pol RECORD;
  all_tables TEXT[] := ARRAY[
    'clientes','titulos','parcelas','eventos_parcela','acordos','parcelas_acordo',
    'comunicacoes','agendamentos','anexos','notificacoes','campanhas','campaign_logs','activity_logs',
    'profiles','user_roles','companies','audit_log'
  ];
  tn TEXT;
BEGIN
  FOREACH tn IN ARRAY all_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = tn LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tn);
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  t TEXT;
  domain_tables TEXT[] := ARRAY[
    'clientes','titulos','parcelas','eventos_parcela','acordos','parcelas_acordo',
    'comunicacoes','agendamentos','anexos','notificacoes','campanhas','campaign_logs','activity_logs'
  ];
BEGIN
  FOREACH t IN ARRAY domain_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "tenant_select_%1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_super_admin() OR company_id = public.current_company_id())', t);
    EXECUTE format('CREATE POLICY "tenant_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id())', t);
    EXECUTE format('CREATE POLICY "tenant_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_super_admin() OR company_id = public.current_company_id()) WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id())', t);
    EXECUTE format('CREATE POLICY "tenant_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.is_super_admin())', t);
  END LOOP;
END $$;

CREATE POLICY "profiles_select_own_or_super" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "profiles_update_own_or_super" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "profiles_delete_super" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles_insert_admin" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles_update_admin" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "user_roles_delete_admin" ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "companies_select_super_or_member" ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_company_id());
CREATE POLICY "companies_insert_super" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY "companies_update_super" ON public.companies FOR UPDATE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "companies_delete_super" ON public.companies FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "audit_log_select_super_or_admin" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP VIEW IF EXISTS public.vw_titulos_completos CASCADE;
CREATE VIEW public.vw_titulos_completos
WITH (security_invoker = true) AS
SELECT
  t.id, t.company_id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj,
  t.numero_documento, t.valor_original, t.vencimento_original,
  t.descricao, t.deleted_at, t.created_at, t.updated_at
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
WHERE t.deleted_at IS NULL;

DROP VIEW IF EXISTS public.vw_audit_record CASCADE;
CREATE VIEW public.vw_audit_record
WITH (security_invoker = true) AS
SELECT id, occurred_at, actor_id, actor_email, action, table_name, record_id,
  before_data, after_data, changed_fields, context,
  reverted, reverted_by_id
FROM public.audit_log;