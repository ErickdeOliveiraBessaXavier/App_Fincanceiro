-- =====================================================================
-- FASE 0 — FUNDAÇÃO MULTI-TENANT (SaaS)
-- =====================================================================
-- DESTRUTIVO: recria o schema do zero com isolamento por company_id.
-- Decisões: 1 usuário = 1 empresa | tenant via JWT claim (fallback profile)
--           | soft delete em tabelas financeiras | super_admin global.
-- =====================================================================

-- ============== 0. RESET ==============
DROP VIEW IF EXISTS public.vw_titulos_completos CASCADE;
DROP VIEW IF EXISTS public.vw_parcelas_consolidadas CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_parcelas_consolidadas CASCADE;

DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.notificacoes CASCADE;
DROP TABLE IF EXISTS public.anexos CASCADE;
DROP TABLE IF EXISTS public.comunicacoes CASCADE;
DROP TABLE IF EXISTS public.agendamentos CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.campaign_logs CASCADE;
DROP TABLE IF EXISTS public.campanhas CASCADE;
DROP TABLE IF EXISTS public.parcelas_acordo CASCADE;
DROP TABLE IF EXISTS public.acordos CASCADE;
DROP TABLE IF EXISTS public.eventos_parcela CASCADE;
DROP TABLE IF EXISTS public.parcelas CASCADE;
DROP TABLE IF EXISTS public.titulos CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_min_role(uuid, public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.fn_audit_row() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_last_admin_removal() CASCADE;
DROP FUNCTION IF EXISTS public.gerar_codigo_titulo() CASCADE;
DROP FUNCTION IF EXISTS public.criar_evento_emissao_parcela() CASCADE;
DROP FUNCTION IF EXISTS public.validar_titulo_tem_parcelas() CASCADE;
DROP FUNCTION IF EXISTS public.update_acordo_status() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_mv_parcelas() CASCADE;
DROP FUNCTION IF EXISTS public.criar_titulo_com_parcelas(uuid,numeric,date,text,varchar,integer,integer,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.registrar_pagamento_parcela(uuid,numeric,text,text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.aplicar_encargo_parcela(uuid,text,numeric,text,uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.conceder_desconto_parcela(uuid,numeric,text,uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.estornar_evento_parcela(uuid,text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.current_company_id() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.role_rank(public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.fn_set_company_id() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_hard_delete_financial() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_last_admin_per_company() CASCADE;

-- Dropa TODAS as sobrecargas das funções que recriamos (independe da assinatura),
-- para evitar conflitos com versões pré-existentes (ex.: is_super_admin(uuid)).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'DROP FUNCTION IF EXISTS public.' || quote_ident(p.proname)
           || '(' || pg_get_function_identity_arguments(p.oid) || ') CASCADE' AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_super_admin','current_company_id','has_role','has_min_role','role_rank',
        'fn_set_company_id','prevent_hard_delete_financial','fn_audit_row',
        'prevent_last_admin_per_company','prevent_last_admin_removal','update_updated_at_column',
        'handle_new_user','gerar_codigo_titulo','criar_evento_emissao_parcela',
        'validar_titulo_tem_parcelas','update_acordo_status','refresh_mv_parcelas',
        'criar_titulo_com_parcelas','registrar_pagamento_parcela','aplicar_encargo_parcela',
        'conceder_desconto_parcela','estornar_evento_parcela','custom_access_token_hook',
        'cancelar_titulo','criar_empresa_e_admin'
      )
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

DROP TYPE IF EXISTS public.app_role CASCADE;
DROP SEQUENCE IF EXISTS public.titulo_codigo_seq CASCADE;

-- ============== 1. ENUM DE PAPÉIS ==============
-- Hierarquia: leitura < operador < financeiro < admin < super_admin
CREATE TYPE public.app_role AS ENUM ('leitura','operador','financeiro','admin','super_admin');

-- ============== 2. HELPERS GENÉRICOS ==============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.role_rank(_role public.app_role)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'leitura'     THEN 1
    WHEN 'operador'    THEN 2
    WHEN 'financeiro'  THEN 3
    WHEN 'admin'       THEN 4
    WHEN 'super_admin' THEN 5
  END;
$$;

-- ============== 3. COMPANIES (raiz do tenant) ==============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa','cancelada')),
  plano TEXT NOT NULL DEFAULT 'trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== 4. PROFILES ==============
-- company_id é NULL apenas para super_admin (operador da plataforma).
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO supabase_auth_admin;
CREATE INDEX idx_profiles_company ON public.profiles(company_id);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== 5. USER_ROLES ==============
-- company_id é NULL apenas para super_admin.
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_roles TO supabase_auth_admin;
CREATE INDEX idx_user_roles_company ON public.user_roles(company_id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============== 6. FUNÇÕES DE TENANT / PAPÉIS ==============
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

-- Tenant atual: 1º do JWT claim (rápido), com fallback ao profile (bootstrap/1º login).
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'company_id', '')::uuid,
    (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Tem papel >= _min na hierarquia (super_admin satisfaz qualquer mínimo).
CREATE OR REPLACE FUNCTION public.has_min_role(_uid uuid, _min public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _uid
      AND public.role_rank(ur.role) >= public.role_rank(_min)
  );
$$;

-- ============== 7. JWT CUSTOM ACCESS TOKEN HOOK ==============
-- Injeta company_id e user_role nos claims do token emitido pelo GoTrue.
-- Precisa ser habilitado no Dashboard (Auth > Hooks) ou via config.toml.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  claims jsonb;
  v_company_id uuid;
  v_role public.app_role;
BEGIN
  SELECT company_id INTO v_company_id FROM public.profiles WHERE user_id = (event->>'user_id')::uuid;
  SELECT role INTO v_role FROM public.user_roles
    WHERE user_id = (event->>'user_id')::uuid
    ORDER BY public.role_rank(role) DESC LIMIT 1;

  claims := event->'claims';
  IF v_company_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{company_id}', to_jsonb(v_company_id::text));
  END IF;
  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END; $$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- O hook (rodando como supabase_auth_admin) precisa ler profiles/user_roles:
CREATE POLICY "auth_admin_read_profiles" ON public.profiles
  FOR SELECT TO supabase_auth_admin USING (true);
CREATE POLICY "auth_admin_read_user_roles" ON public.user_roles
  FOR SELECT TO supabase_auth_admin USING (true);

-- ============== 8. TRIGGERS TRANSVERSAIS ==============
-- Preenche company_id automaticamente no INSERT (defesa contra registro sem tenant).
CREATE OR REPLACE FUNCTION public.fn_set_company_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'company_id não pôde ser determinado para %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END; $$;

-- Bloqueia DELETE físico em tabelas financeiras (força cancelamento/estorno/soft-delete).
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_financial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DELETE físico bloqueado em %. Use cancelamento, estorno ou soft-delete (deleted_at).', TG_TABLE_NAME;
END; $$;

-- Auditoria universal (com company_id).
CREATE OR REPLACE FUNCTION public.fn_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_changed text[]; v_rec_id uuid; v_email text; v_company uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_before := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_after := to_jsonb(NEW); END IF;
  v_rec_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
  v_company := coalesce((v_after->>'company_id')::uuid, (v_before->>'company_id')::uuid);
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(array_agg(key), '{}') INTO v_changed
    FROM jsonb_each(v_after) a WHERE a.value IS DISTINCT FROM (v_before->a.key);
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN RETURN NEW; END IF;
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_log (company_id, actor_id, actor_email, action, table_name, record_id, before_data, after_data, changed_fields)
  VALUES (v_company, auth.uid(), v_email, lower(TG_OP), TG_TABLE_NAME, v_rec_id, v_before, v_after, v_changed);
  RETURN coalesce(NEW, OLD);
END; $$;

-- Impede remover o último admin de uma empresa.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_per_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'admin')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NEW.role <> 'admin') THEN
    SELECT COUNT(*) INTO v_count FROM public.user_roles
      WHERE role = 'admin' AND company_id IS NOT DISTINCT FROM OLD.company_id;
    IF v_count <= 1 THEN RAISE EXCEPTION 'Não é possível remover o último admin da empresa'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

-- ============== 9. POLICIES DE companies / profiles / user_roles ==============
-- companies: super_admin vê tudo; membros veem só a sua.
CREATE POLICY "companies_select" ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_company_id());
CREATE POLICY "companies_super_admin_all" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "companies_admin_update" ON public.companies FOR UPDATE TO authenticated
  USING (id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'))
  WITH CHECK (id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));

-- profiles
CREATE POLICY "profiles_select_tenant" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id() OR auth.uid() = user_id);
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin')));

-- user_roles
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_super_admin() OR auth.uid() = user_id
         OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin')));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin()
         OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin') AND role <> 'super_admin'))
  WITH CHECK (public.is_super_admin()
         OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin') AND role <> 'super_admin'));
CREATE TRIGGER trg_prevent_last_admin BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_per_company();

-- ============== 10. CLIENTES ==============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  telefone TEXT, email TEXT, endereco_completo TEXT, cep TEXT, cidade TEXT, estado TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inadimplente','em_acordo','quitado')),
  observacoes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (company_id, cpf_cnpj)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
CREATE INDEX idx_clientes_company_status ON public.clientes(company_id, status);
CREATE INDEX idx_clientes_company_nome ON public.clientes(company_id, nome);
CREATE INDEX idx_clientes_cpf_cnpj ON public.clientes(company_id, cpf_cnpj);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "clientes_delete_admin" ON public.clientes FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_clientes BEFORE INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== 11. TITULOS (financeiro: sem DELETE físico) ==============
CREATE SEQUENCE public.titulo_codigo_seq START 1;
CREATE TABLE public.titulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id),
  numero_documento VARCHAR(50),
  valor_original NUMERIC(15,2) NOT NULL,
  vencimento_original DATE NOT NULL,
  descricao TEXT,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.titulos TO authenticated;
GRANT ALL ON public.titulos TO service_role;
CREATE INDEX idx_titulos_company_cliente ON public.titulos(company_id, cliente_id);
CREATE INDEX idx_titulos_company_venc ON public.titulos(company_id, vencimento_original);
CREATE UNIQUE INDEX idx_titulos_numero_doc ON public.titulos(company_id, numero_documento) WHERE numero_documento IS NOT NULL;
ALTER TABLE public.titulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "titulos_select" ON public.titulos FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "titulos_insert" ON public.titulos FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "titulos_update" ON public.titulos FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
-- (sem policy de DELETE: bloqueado por RLS + trigger)
CREATE TRIGGER trg_set_company_titulos BEFORE INSERT ON public.titulos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER trg_block_delete_titulos BEFORE DELETE ON public.titulos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();
CREATE TRIGGER update_titulos_updated_at BEFORE UPDATE ON public.titulos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.gerar_codigo_titulo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero_documento IS NULL OR NEW.numero_documento = '' THEN
    NEW.numero_documento := 'TIT-' || LPAD(nextval('public.titulo_codigo_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trigger_gerar_codigo_titulo BEFORE INSERT ON public.titulos
  FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_titulo();

-- ============== 12. PARCELAS (financeiro) ==============
CREATE TABLE public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  valor_nominal NUMERIC(15,2) NOT NULL,
  vencimento DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(titulo_id, numero_parcela)
);
GRANT SELECT, INSERT, UPDATE ON public.parcelas TO authenticated;
GRANT ALL ON public.parcelas TO service_role;
CREATE INDEX idx_parcelas_company_titulo ON public.parcelas(company_id, titulo_id);
CREATE INDEX idx_parcelas_company_venc ON public.parcelas(company_id, vencimento);
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcelas_select" ON public.parcelas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "parcelas_insert" ON public.parcelas FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "parcelas_update" ON public.parcelas FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_set_company_parcelas BEFORE INSERT ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER trg_block_delete_parcelas BEFORE DELETE ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();

-- ============== 13. EVENTOS_PARCELA (ledger imutável - financeiro) ==============
CREATE TABLE public.eventos_parcela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  parcela_id UUID NOT NULL REFERENCES public.parcelas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('emissao_parcela','pagamento_total','pagamento_parcial','juros_aplicado','multa_aplicada','desconto_concedido','estorno')),
  valor NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  efeito INTEGER NOT NULL CHECK (efeito IN (0,1,-1)),
  descricao TEXT,
  meio_pagamento TEXT CHECK (meio_pagamento IS NULL OR meio_pagamento IN ('pix','dinheiro','boleto','transferencia','cartao','outro')),
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  estornado BOOLEAN DEFAULT false,
  estornado_por_id UUID REFERENCES public.eventos_parcela(id)
);
GRANT SELECT, INSERT, UPDATE ON public.eventos_parcela TO authenticated;
GRANT ALL ON public.eventos_parcela TO service_role;
CREATE INDEX idx_eventos_company_parcela ON public.eventos_parcela(company_id, parcela_id);
CREATE INDEX idx_eventos_tipo ON public.eventos_parcela(tipo);
ALTER TABLE public.eventos_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos_select" ON public.eventos_parcela FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "eventos_insert" ON public.eventos_parcela FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "eventos_update" ON public.eventos_parcela FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_set_company_eventos BEFORE INSERT ON public.eventos_parcela
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER trg_block_delete_eventos BEFORE DELETE ON public.eventos_parcela
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();

CREATE OR REPLACE FUNCTION public.criar_evento_emissao_parcela()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_parcelas INTEGER; v_created_by UUID; v_company UUID;
BEGIN
  SELECT COUNT(*) INTO v_total_parcelas FROM public.parcelas p WHERE p.titulo_id = NEW.titulo_id;
  SELECT t.created_by, t.company_id INTO v_created_by, v_company FROM public.titulos t WHERE t.id = NEW.titulo_id;
  INSERT INTO public.eventos_parcela (company_id, parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (v_company, NEW.id, 'emissao_parcela', NEW.valor_nominal, 0,
    format('Parcela %s/%s emitida - Vencimento: %s', NEW.numero_parcela, v_total_parcelas, to_char(NEW.vencimento, 'DD/MM/YYYY')), v_created_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER trigger_evento_emissao_parcela AFTER INSERT ON public.parcelas
  FOR EACH ROW EXECUTE FUNCTION public.criar_evento_emissao_parcela();

-- ============== 14. ACORDOS (financeiro) ==============
CREATE TABLE public.acordos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  valor_original NUMERIC(10,2) NOT NULL,
  valor_acordo NUMERIC(10,2) NOT NULL,
  desconto NUMERIC(5,2) NOT NULL DEFAULT 0,
  parcelas INTEGER NOT NULL DEFAULT 1,
  valor_parcela NUMERIC(10,2) NOT NULL,
  taxa_juros NUMERIC(5,2) DEFAULT 0,
  data_acordo DATE NOT NULL DEFAULT CURRENT_DATE,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento_primeira_parcela DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cumprido','quebrado','cancelado')),
  observacoes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT acordos_parcelas_check CHECK (parcelas > 0),
  CONSTRAINT acordos_valor_check CHECK (valor_acordo > 0 AND valor_original > 0),
  CONSTRAINT acordos_desconto_check CHECK (desconto >= 0 AND desconto <= 100),
  CONSTRAINT acordos_taxa_juros_check CHECK (taxa_juros >= 0 AND taxa_juros <= 100)
);
GRANT SELECT, INSERT, UPDATE ON public.acordos TO authenticated;
GRANT ALL ON public.acordos TO service_role;
CREATE INDEX idx_acordos_company_titulo ON public.acordos(company_id, titulo_id);
CREATE INDEX idx_acordos_company_status ON public.acordos(company_id, status);
ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acordos_select" ON public.acordos FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "acordos_insert" ON public.acordos FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE POLICY "acordos_update" ON public.acordos FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_set_company_acordos BEFORE INSERT ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER trg_block_delete_acordos BEFORE DELETE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();
CREATE TRIGGER update_acordos_updated_at BEFORE UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== 15. PARCELAS_ACORDO (financeiro) ==============
CREATE TABLE public.parcelas_acordo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acordo_id UUID NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  valor_juros NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','paga','vencida')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT unique_parcela_acordo UNIQUE (acordo_id, numero_parcela),
  CONSTRAINT parcelas_acordo_valor_check CHECK (valor > 0 AND valor_total > 0)
);
GRANT SELECT, INSERT, UPDATE ON public.parcelas_acordo TO authenticated;
GRANT ALL ON public.parcelas_acordo TO service_role;
CREATE INDEX idx_parcelas_acordo_company ON public.parcelas_acordo(company_id, acordo_id);
ALTER TABLE public.parcelas_acordo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcelas_acordo_select" ON public.parcelas_acordo FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "parcelas_acordo_insert" ON public.parcelas_acordo FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE POLICY "parcelas_acordo_update" ON public.parcelas_acordo FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'financeiro'));
CREATE TRIGGER trg_set_company_parcelas_acordo BEFORE INSERT ON public.parcelas_acordo
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER trg_block_delete_parcelas_acordo BEFORE DELETE ON public.parcelas_acordo
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_financial();
CREATE TRIGGER update_parcelas_acordo_updated_at BEFORE UPDATE ON public.parcelas_acordo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_acordo_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM parcelas_acordo WHERE acordo_id = NEW.acordo_id AND status != 'paga') = 0 THEN
    UPDATE acordos SET status = 'cumprido' WHERE id = NEW.acordo_id;
  ELSIF (SELECT COUNT(*) FROM parcelas_acordo WHERE acordo_id = NEW.acordo_id AND status = 'vencida') > 0 THEN
    UPDATE acordos SET status = 'quebrado' WHERE id = NEW.acordo_id;
  ELSE
    UPDATE acordos SET status = 'ativo' WHERE id = NEW.acordo_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trigger_update_acordo_status AFTER UPDATE OF status ON parcelas_acordo
  FOR EACH ROW EXECUTE FUNCTION public.update_acordo_status();

-- ============== 16. CAMPANHAS / CAMPAIGN_LOGS ==============
CREATE TABLE public.campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','sms')),
  mensagem TEXT NOT NULL,
  filtros JSONB,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','finalizada')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;
GRANT ALL ON public.campanhas TO service_role;
CREATE INDEX idx_campanhas_company ON public.campanhas(company_id, status);
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campanhas_select" ON public.campanhas FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "campanhas_insert" ON public.campanhas FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "campanhas_update" ON public.campanhas FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "campanhas_delete_admin" ON public.campanhas FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_campanhas BEFORE INSERT ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  contato TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','erro','entregue')),
  erro_mensagem TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.campaign_logs TO authenticated;
GRANT ALL ON public.campaign_logs TO service_role;
CREATE INDEX idx_campaign_logs_company ON public.campaign_logs(company_id, campanha_id);
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_logs_select" ON public.campaign_logs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "campaign_logs_insert" ON public.campaign_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE TRIGGER trg_set_company_campaign_logs BEFORE INSERT ON public.campaign_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- ============== 17. ACTIVITY_LOGS ==============
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  recurso_tipo TEXT NOT NULL,
  recurso_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
CREATE INDEX idx_activity_logs_company ON public.activity_logs(company_id, created_at DESC);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_logs_select" ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "activity_logs_insert" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND auth.uid() = user_id);
CREATE TRIGGER trg_set_company_activity_logs BEFORE INSERT ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- ============== 18. AGENDAMENTOS ==============
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE SET NULL,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL,
  descricao TEXT,
  data_agendamento TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  resultado TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;
CREATE INDEX idx_agendamentos_company ON public.agendamentos(company_id, data_agendamento);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agendamentos_select" ON public.agendamentos FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "agendamentos_insert" ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "agendamentos_update" ON public.agendamentos FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "agendamentos_delete" ON public.agendamentos FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_agendamentos BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_agendamentos_updated_at BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== 19. COMUNICACOES ==============
CREATE TABLE public.comunicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ligacao','email','sms','whatsapp','visita','acordo','promessa')),
  canal TEXT NOT NULL CHECK (canal IN ('manual','automatico')),
  assunto TEXT NOT NULL,
  mensagem TEXT,
  anexos JSONB,
  resultado TEXT CHECK (resultado IN ('sucesso','sem_resposta','ocupado','promessa','acordo')),
  data_contato TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.comunicacoes TO authenticated;
GRANT ALL ON public.comunicacoes TO service_role;
CREATE INDEX idx_comunicacoes_company ON public.comunicacoes(company_id, cliente_id);
ALTER TABLE public.comunicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comunicacoes_select" ON public.comunicacoes FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "comunicacoes_insert" ON public.comunicacoes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "comunicacoes_update" ON public.comunicacoes FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE TRIGGER trg_set_company_comunicacoes BEFORE INSERT ON public.comunicacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- ============== 20. ANEXOS ==============
CREATE TABLE public.anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  tamanho_arquivo INTEGER,
  url_arquivo TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN ('comprovante','documento','contrato','correspondencia')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anexos TO authenticated;
GRANT ALL ON public.anexos TO service_role;
CREATE INDEX idx_anexos_company ON public.anexos(company_id);
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anexos_select" ON public.anexos FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "anexos_insert" ON public.anexos FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "anexos_delete" ON public.anexos FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_anexos BEFORE INSERT ON public.anexos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- ============== 21. NOTIFICACOES ==============
CREATE TABLE public.notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('vencimento','atraso','acordo_quebrado','campanha','geral')),
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  lida BOOLEAN NOT NULL DEFAULT false,
  data_agendamento TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
CREATE INDEX idx_notificacoes_user_lida ON public.notificacoes(company_id, user_id, lida);
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacoes_select_own" ON public.notificacoes FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() AND auth.uid() = user_id);
CREATE POLICY "notificacoes_insert" ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "notificacoes_update_own" ON public.notificacoes FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND auth.uid() = user_id);
CREATE TRIGGER trg_set_company_notificacoes BEFORE INSERT ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();

-- ============== 22. AUDIT_LOG ==============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_email TEXT,
  actor_ip TEXT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[],
  context JSONB,
  reverted BOOLEAN NOT NULL DEFAULT false,
  reverted_by_id UUID REFERENCES public.audit_log(id)
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
CREATE INDEX idx_audit_log_company ON public.audit_log(company_id, occurred_at DESC);
CREATE INDEX idx_audit_log_record ON public.audit_log(table_name, record_id, occurred_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin')));

-- Triggers de auditoria
CREATE TRIGGER trg_audit_titulos AFTER INSERT OR UPDATE OR DELETE ON public.titulos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_parcelas AFTER INSERT OR UPDATE OR DELETE ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_clientes AFTER INSERT OR UPDATE OR DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_acordos AFTER INSERT OR UPDATE OR DELETE ON public.acordos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_parcelas_acordo AFTER INSERT OR UPDATE OR DELETE ON public.parcelas_acordo FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_eventos_parcela AFTER INSERT OR UPDATE OR DELETE ON public.eventos_parcela FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_agendamentos AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_comunicacoes AFTER INSERT OR UPDATE OR DELETE ON public.comunicacoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_campanhas AFTER INSERT OR UPDATE OR DELETE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- ============== 23. MATERIALIZED VIEW + VIEW COM TENANT ==============
CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT
  p.id, p.company_id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'juros_aplicado' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS juros,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'multa_aplicada' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS multa,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo = 'desconto_concedido' AND (e.estornado IS NULL OR e.estornado = false)), 0) AS descontos,
  COALESCE(SUM(e.valor) FILTER (WHERE e.tipo IN ('pagamento_total','pagamento_parcial') AND (e.estornado IS NULL OR e.estornado = false)), 0) AS total_pago,
  p.valor_nominal + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) AS saldo_atual,
  CASE
    WHEN p.valor_nominal + COALESCE(SUM(e.valor * e.efeito) FILTER (WHERE e.estornado IS NULL OR e.estornado = false), 0) <= 0 THEN 'pago'
    WHEN p.vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  MAX(e.created_at) FILTER (WHERE e.tipo IN ('pagamento_total','pagamento_parcial') AND (e.estornado IS NULL OR e.estornado = false)) AS data_ultimo_pagamento,
  COUNT(e.id) FILTER (WHERE e.estornado IS NULL OR e.estornado = false) AS total_eventos
FROM public.parcelas p
LEFT JOIN public.eventos_parcela e ON e.parcela_id = p.id
GROUP BY p.id, p.company_id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento;
CREATE UNIQUE INDEX idx_mv_parcelas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_company ON public.mv_parcelas_consolidadas(company_id, titulo_id);
-- MV não suporta RLS: acesso direto é revogado; tenants consomem a VIEW abaixo.
REVOKE ALL ON public.mv_parcelas_consolidadas FROM authenticated;
GRANT ALL ON public.mv_parcelas_consolidadas TO service_role;

-- View "definer" (owner) que lê a MV (a qual authenticated NÃO acessa direto) e
-- isola por tenant no WHERE. authenticated só precisa de SELECT na view.
CREATE VIEW public.vw_parcelas_consolidadas AS
SELECT * FROM public.mv_parcelas_consolidadas
WHERE public.is_super_admin() OR company_id = public.current_company_id();
GRANT SELECT ON public.vw_parcelas_consolidadas TO authenticated;
GRANT ALL ON public.vw_parcelas_consolidadas TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_mv_parcelas()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas; END; $$;

-- ============== 24. VIEW TITULOS COMPLETOS (definer + filtro de tenant) ==============
CREATE VIEW public.vw_titulos_completos AS
SELECT
  t.id, t.company_id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  t.numero_documento, t.descricao, t.valor_original, t.vencimento_original, t.metadata, t.status AS titulo_status,
  t.created_by, t.created_at, t.updated_at,
  COALESCE(p.quantidade_parcelas, 0) AS quantidade_parcelas,
  COALESCE(p.parcelas_pagas, 0) AS parcelas_pagas,
  COALESCE(p.parcelas_pendentes, 0) AS parcelas_pendentes,
  COALESCE(p.parcelas_vencidas, 0) AS parcelas_vencidas,
  COALESCE(p.total_pago, 0) AS total_pago,
  COALESCE(p.total_juros, 0) AS total_juros,
  COALESCE(p.total_multa, 0) AS total_multa,
  COALESCE(p.total_descontos, 0) AS total_descontos,
  COALESCE(p.saldo_devedor, 0) AS saldo_devedor,
  p.proximo_vencimento,
  CASE
    WHEN COALESCE(p.saldo_devedor, 0) <= 0 THEN 'pago'
    WHEN EXISTS (SELECT 1 FROM public.acordos a WHERE a.titulo_id = t.id AND a.status = 'ativo') THEN 'renegociado'
    WHEN COALESCE(p.parcelas_vencidas, 0) > 0 THEN 'vencido'
    ELSE 'a_vencer'
  END AS status,
  CASE
    WHEN t.metadata->>'tipo' IS NOT NULL THEN t.metadata->>'tipo'
    WHEN COALESCE(p.quantidade_parcelas, 0) > 1 THEN 'parcelado'
    ELSE 'avista'
  END AS tipo
FROM public.titulos t
LEFT JOIN public.clientes c ON c.id = t.cliente_id
LEFT JOIN (
  SELECT titulo_id,
    COUNT(*) AS quantidade_parcelas,
    COUNT(*) FILTER (WHERE status = 'pago') AS parcelas_pagas,
    COUNT(*) FILTER (WHERE status = 'a_vencer') AS parcelas_pendentes,
    COUNT(*) FILTER (WHERE status = 'vencido') AS parcelas_vencidas,
    SUM(total_pago) AS total_pago, SUM(juros) AS total_juros, SUM(multa) AS total_multa,
    SUM(descontos) AS total_descontos, SUM(saldo_atual) AS saldo_devedor,
    MIN(vencimento) FILTER (WHERE status != 'pago') AS proximo_vencimento
  FROM public.mv_parcelas_consolidadas GROUP BY titulo_id
) p ON p.titulo_id = t.id
WHERE t.deleted_at IS NULL
  AND (public.is_super_admin() OR t.company_id = public.current_company_id());
GRANT SELECT ON public.vw_titulos_completos TO authenticated;
GRANT ALL ON public.vw_titulos_completos TO service_role;

-- ============== 25. RPCs FINANCEIRAS ==============
CREATE OR REPLACE FUNCTION public.criar_titulo_com_parcelas(
  p_cliente_id UUID, p_valor_original NUMERIC, p_vencimento_original DATE,
  p_descricao TEXT DEFAULT NULL, p_numero_documento VARCHAR DEFAULT NULL,
  p_numero_parcelas INTEGER DEFAULT 1, p_intervalo_dias INTEGER DEFAULT 30, p_created_by UUID DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo_id UUID; v_valor_parcela NUMERIC; v_data_vencimento DATE; i INTEGER;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO titulos (cliente_id, valor_original, vencimento_original, descricao, numero_documento, created_by)
  VALUES (p_cliente_id, p_valor_original, p_vencimento_original, p_descricao, p_numero_documento, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_titulo_id;
  v_valor_parcela := ROUND(p_valor_original / p_numero_parcelas, 2);
  FOR i IN 1..p_numero_parcelas LOOP
    v_data_vencimento := p_vencimento_original + ((i - 1) * p_intervalo_dias);
    INSERT INTO parcelas (titulo_id, numero_parcela, valor_nominal, vencimento)
    VALUES (v_titulo_id, i, v_valor_parcela, v_data_vencimento);
  END LOOP;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcelas_consolidadas;
  RETURN jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'parcelas_criadas', p_numero_parcelas);
END; $$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_parcela(
  p_parcela_id uuid, p_valor numeric, p_meio_pagamento text, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_tipo_evento text; v_evento_id uuid; v_parcela_info record; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'operador') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT id, saldo_atual, status INTO v_parcela_info FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_parcela_info.id IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  v_saldo_atual := v_parcela_info.saldo_atual;
  IF v_parcela_info.status = 'pago' THEN RAISE EXCEPTION 'Parcela já está paga'; END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Valor excede saldo devedor'; END IF;
  v_tipo_evento := CASE WHEN p_valor >= v_saldo_atual THEN 'pagamento_total' ELSE 'pagamento_parcial' END;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, meio_pagamento, descricao, created_by)
  VALUES (p_parcela_id, v_tipo_evento, p_valor, -1, p_meio_pagamento,
    COALESCE(p_descricao, format('Pagamento de R$ %s via %s', p_valor, p_meio_pagamento)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso', true, 'evento_id', v_evento_id, 'tipo', v_tipo_evento,
    'saldo_anterior', v_saldo_atual, 'saldo_atual', v_saldo_atual - p_valor, 'valor_pago', p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  IF p_tipo NOT IN ('juros_aplicado','multa_aplicada') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, p_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado', CASE WHEN p_tipo='juros_aplicado' THEN 'Juros' ELSE 'Multa' END, p_valor)),
    COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual+p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','aplicar_encargo_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.vw_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Desconto excede saldo'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id,'desconto_concedido',p_valor,-1, COALESCE(p_descricao, format('Desconto de R$ %s concedido', p_valor)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual-p_valor);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','conceder_desconto_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_evento_parcela(
  p_evento_id uuid, p_motivo text, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_evento_original record; v_evento_estorno_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN RAISE EXCEPTION 'Motivo do estorno é obrigatório'; END IF;
  SELECT * INTO v_evento_original FROM public.eventos_parcela WHERE id = p_evento_id;
  IF v_evento_original.id IS NULL THEN RAISE EXCEPTION 'Evento não encontrado'; END IF;
  IF v_evento_original.estornado THEN RAISE EXCEPTION 'Já estornado'; END IF;
  IF v_evento_original.tipo IN ('emissao_parcela','estorno') THEN RAISE EXCEPTION 'Não pode estornar'; END IF;
  UPDATE public.eventos_parcela SET estornado = true WHERE id = p_evento_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  VALUES (v_evento_original.parcela_id,'estorno',v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo), COALESCE(p_created_by, auth.uid()), p_evento_id)
  RETURNING id INTO v_evento_estorno_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_estorno_id',v_evento_estorno_id,'evento_original_id',p_evento_id,'tipo_estornado',v_evento_original.tipo);
  INSERT INTO public.audit_log (company_id, actor_id, action, table_name, record_id, context)
  VALUES (public.current_company_id(), COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',p_evento_id, jsonb_build_object('rpc','estornar_evento_parcela','result',v_result));
  RETURN v_result;
END; $$;

-- Cancela um título (soft delete) preservando histórico financeiro.
CREATE OR REPLACE FUNCTION public.cancelar_titulo(
  p_titulo_id uuid, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo record;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'financeiro') THEN RAISE EXCEPTION 'Operação restrita a financeiro/admin'; END IF;
  SELECT * INTO v_titulo FROM public.titulos
    WHERE id = p_titulo_id AND company_id = public.current_company_id();
  IF v_titulo.id IS NULL THEN RAISE EXCEPTION 'Título não encontrado'; END IF;
  IF v_titulo.status = 'cancelado' THEN RAISE EXCEPTION 'Título já cancelado'; END IF;

  UPDATE public.titulos
    SET status = 'cancelado', deleted_at = now(),
        metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('motivo_cancelamento', p_motivo)
    WHERE id = p_titulo_id;
  UPDATE public.parcelas SET deleted_at = now() WHERE titulo_id = p_titulo_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', p_titulo_id, 'status', 'cancelado');
END; $$;

-- ============== 26. ONBOARDING: criar empresa + 1º admin ==============
-- Cria a empresa e vincula o usuário logado como admin dela (usado no setup inicial).
CREATE OR REPLACE FUNCTION public.criar_empresa_e_admin(
  p_nome TEXT, p_cnpj TEXT DEFAULT NULL, p_slug TEXT DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Usuário já pertence a uma empresa';
  END IF;
  INSERT INTO public.companies (nome, cnpj, slug) VALUES (p_nome, p_cnpj, p_slug) RETURNING id INTO v_company_id;
  UPDATE public.profiles SET company_id = v_company_id WHERE user_id = v_uid;
  -- remove papel default e promove a admin da empresa
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  INSERT INTO public.user_roles (user_id, company_id, role) VALUES (v_uid, v_company_id, 'admin');
  RETURN jsonb_build_object('sucesso', true, 'company_id', v_company_id);
END; $$;

-- ============== 27. NEW USER HANDLER ==============
-- No signup: cria profile (sem empresa ainda). A empresa é definida no setup
-- (criar_empresa_e_admin) ou via convite que injeta company_id no metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := NULLIF(NEW.raw_user_meta_data ->> 'company_id', '')::uuid;
  INSERT INTO public.profiles (user_id, company_id, nome, email)
  VALUES (NEW.id, v_company_id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'name', 'Usuário'), NEW.email);
  -- Papel inicial só quando já há empresa (fluxo de convite). Setup de empresa promove a admin.
  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'operador'));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
