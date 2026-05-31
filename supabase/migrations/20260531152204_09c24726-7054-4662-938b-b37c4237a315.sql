-- ========== ENUM ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'gerente');

-- ========== TIMESTAMP HELPER ==========
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== USER ROLES ==========
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_min_role(_uid uuid, _min public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _min
    WHEN 'operador'::public.app_role THEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _uid)
    WHEN 'gerente'::public.app_role  THEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('gerente'::public.app_role,'admin'::public.app_role))
    WHEN 'admin'::public.app_role    THEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'admin'::public.app_role)
  END
$$;

CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ========== CLIENTES ==========
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL UNIQUE,
  telefone TEXT,
  email TEXT,
  endereco_completo TEXT,
  cep TEXT,
  cidade TEXT,
  estado TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inadimplente','em_acordo','quitado')),
  observacoes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "clientes_update_owner_or_manager" ON public.clientes FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "clientes_delete_owner_or_manager" ON public.clientes FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE INDEX idx_clientes_cpf_cnpj ON public.clientes(cpf_cnpj);
CREATE INDEX idx_clientes_status ON public.clientes(status);
CREATE INDEX idx_clientes_nome ON public.clientes(nome);
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== TITULOS ==========
CREATE TABLE public.titulos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id),
  numero_documento VARCHAR(50),
  valor_original NUMERIC(15,2) NOT NULL,
  vencimento_original DATE NOT NULL,
  descricao TEXT,
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.titulos TO authenticated;
GRANT ALL ON public.titulos TO service_role;
ALTER TABLE public.titulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all titulos" ON public.titulos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert titulos" ON public.titulos FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "titulos_update_owner_or_manager" ON public.titulos FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "titulos_delete_manager" ON public.titulos FOR DELETE TO authenticated USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE INDEX idx_titulos_cliente_id ON public.titulos(cliente_id);
CREATE INDEX idx_titulos_vencimento ON public.titulos(vencimento_original);
CREATE UNIQUE INDEX idx_titulos_numero_documento ON public.titulos(numero_documento) WHERE numero_documento IS NOT NULL;
CREATE TRIGGER update_titulos_updated_at BEFORE UPDATE ON public.titulos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- sequencia/codigo de titulo
CREATE SEQUENCE IF NOT EXISTS public.titulo_codigo_seq START 1;
CREATE OR REPLACE FUNCTION public.gerar_codigo_titulo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.numero_documento IS NULL OR NEW.numero_documento = '' THEN
    NEW.numero_documento := 'TIT-' || LPAD(nextval('public.titulo_codigo_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trigger_gerar_codigo_titulo BEFORE INSERT ON public.titulos FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_titulo();

-- ========== PARCELAS ==========
CREATE TABLE public.parcelas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  numero_parcela INTEGER NOT NULL,
  valor_nominal NUMERIC(15,2) NOT NULL,
  vencimento DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(titulo_id, numero_parcela)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parcelas TO authenticated;
GRANT ALL ON public.parcelas TO service_role;
CREATE INDEX idx_parcelas_titulo_id ON public.parcelas(titulo_id);
CREATE INDEX idx_parcelas_vencimento ON public.parcelas(vencimento);
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parcelas visiveis para usuarios autenticados" ON public.parcelas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Parcelas podem ser inseridas por usuarios autenticados" ON public.parcelas FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.titulos t WHERE t.id = titulo_id AND t.created_by = auth.uid()));
CREATE POLICY "Parcelas podem ser excluidas pelo criador do titulo" ON public.parcelas FOR DELETE USING (EXISTS (SELECT 1 FROM public.titulos t WHERE t.id = titulo_id AND t.created_by = auth.uid()));

-- ========== EVENTOS_PARCELA ==========
CREATE TABLE public.eventos_parcela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_parcela TO authenticated;
GRANT ALL ON public.eventos_parcela TO service_role;
CREATE INDEX idx_eventos_parcela_id ON public.eventos_parcela(parcela_id);
CREATE INDEX idx_eventos_tipo ON public.eventos_parcela(tipo);
CREATE INDEX idx_eventos_created_at ON public.eventos_parcela(created_at);
ALTER TABLE public.eventos_parcela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eventos visiveis para usuarios autenticados" ON public.eventos_parcela FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Eventos podem ser inseridos por usuarios autenticados" ON public.eventos_parcela FOR INSERT WITH CHECK (auth.uid() = created_by OR created_by IS NULL);
CREATE POLICY "Eventos podem ser atualizados para estorno" ON public.eventos_parcela FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.criar_evento_emissao_parcela()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_total_parcelas INTEGER; v_created_by UUID;
BEGIN
  SELECT COUNT(*) INTO v_total_parcelas FROM public.parcelas p WHERE p.titulo_id = NEW.titulo_id;
  SELECT t.created_by INTO v_created_by FROM public.titulos t WHERE t.id = NEW.titulo_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (NEW.id, 'emissao_parcela', NEW.valor_nominal, 0,
    format('Parcela %s/%s emitida - Vencimento: %s', NEW.numero_parcela, v_total_parcelas, to_char(NEW.vencimento, 'DD/MM/YYYY')), v_created_by);
  RETURN NEW;
END; $function$;
CREATE TRIGGER trigger_evento_emissao_parcela AFTER INSERT ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.criar_evento_emissao_parcela();

CREATE OR REPLACE FUNCTION public.validar_titulo_tem_parcelas() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.parcelas WHERE titulo_id = NEW.id) THEN
    RAISE EXCEPTION 'Todo titulo deve ter ao menos uma parcela.';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trigger_validar_titulo_tem_parcelas AFTER INSERT ON public.titulos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validar_titulo_tem_parcelas();

-- ========== ACORDOS ==========
CREATE TABLE public.acordos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_id uuid NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  valor_original numeric(10,2) NOT NULL,
  valor_acordo numeric(10,2) NOT NULL,
  desconto numeric(5,2) NOT NULL DEFAULT 0,
  parcelas integer NOT NULL DEFAULT 1,
  valor_parcela numeric(10,2) NOT NULL,
  taxa_juros numeric(5,2) DEFAULT 0,
  data_acordo date NOT NULL DEFAULT CURRENT_DATE,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento_primeira_parcela date NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acordos_status_check CHECK (status = ANY (ARRAY['ativo','cumprido','quebrado','cancelado'])),
  CONSTRAINT acordos_parcelas_check CHECK (parcelas > 0),
  CONSTRAINT acordos_valor_check CHECK (valor_acordo > 0 AND valor_original > 0),
  CONSTRAINT acordos_desconto_check CHECK (desconto >= 0 AND desconto <= 100),
  CONSTRAINT acordos_taxa_juros_check CHECK (taxa_juros >= 0 AND taxa_juros <= 100)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acordos TO authenticated;
GRANT ALL ON public.acordos TO service_role;
CREATE INDEX idx_acordos_titulo_id ON public.acordos(titulo_id);
CREATE INDEX idx_acordos_cliente_id ON public.acordos(cliente_id);
CREATE INDEX idx_acordos_status ON public.acordos(status);
ALTER TABLE public.acordos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acordos sao visiveis apenas para usuarios autenticados" ON public.acordos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "acordos_insert_manager" ON public.acordos FOR INSERT WITH CHECK (public.has_min_role(auth.uid(),'gerente'::public.app_role) AND auth.uid() = created_by);
CREATE POLICY "acordos_update_manager" ON public.acordos FOR UPDATE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "acordos_delete_manager" ON public.acordos FOR DELETE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE TRIGGER update_acordos_updated_at BEFORE UPDATE ON public.acordos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== PARCELAS_ACORDO ==========
CREATE TABLE public.parcelas_acordo (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acordo_id uuid NOT NULL REFERENCES public.acordos(id) ON DELETE CASCADE,
  numero_parcela integer NOT NULL,
  valor numeric(10,2) NOT NULL,
  valor_juros numeric(10,2) NOT NULL DEFAULT 0,
  valor_total numeric(10,2) NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcelas_acordo_status_check CHECK (status = ANY (ARRAY['pendente','paga','vencida'])),
  CONSTRAINT unique_parcela_acordo UNIQUE (acordo_id, numero_parcela),
  CONSTRAINT parcelas_acordo_valor_check CHECK (valor > 0 AND valor_total > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parcelas_acordo TO authenticated;
GRANT ALL ON public.parcelas_acordo TO service_role;
CREATE INDEX idx_parcelas_acordo_id ON public.parcelas_acordo(acordo_id);
CREATE INDEX idx_parcelas_acordo_status ON public.parcelas_acordo(status);
ALTER TABLE public.parcelas_acordo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parcelas acordo visiveis para autenticados" ON public.parcelas_acordo FOR SELECT USING (EXISTS (SELECT 1 FROM public.acordos WHERE acordos.id = parcelas_acordo.acordo_id AND acordos.created_by = auth.uid()));
CREATE POLICY "parcelas_acordo_insert_manager" ON public.parcelas_acordo FOR INSERT WITH CHECK (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "parcelas_acordo_update_manager" ON public.parcelas_acordo FOR UPDATE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "parcelas_acordo_delete_manager" ON public.parcelas_acordo FOR DELETE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE TRIGGER update_parcelas_acordo_updated_at BEFORE UPDATE ON public.parcelas_acordo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_acordo_status() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
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
CREATE TRIGGER trigger_update_acordo_status AFTER UPDATE OF status ON parcelas_acordo FOR EACH ROW EXECUTE FUNCTION public.update_acordo_status();

-- ========== CAMPANHAS ==========
CREATE TABLE public.campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','sms')),
  mensagem TEXT NOT NULL,
  filtros JSONB,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada','finalizada')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;
GRANT ALL ON public.campanhas TO service_role;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all campanhas" ON public.campanhas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campanhas" ON public.campanhas FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "campanhas_update_manager" ON public.campanhas FOR UPDATE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "campanhas_delete_manager" ON public.campanhas FOR DELETE USING (public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== CAMPAIGN_LOGS ==========
CREATE TABLE public.campaign_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  titulo_id UUID NOT NULL REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  contato TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','erro','entregue')),
  erro_mensagem TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_logs TO authenticated;
GRANT ALL ON public.campaign_logs TO service_role;
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all campaign logs" ON public.campaign_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campaign logs" ON public.campaign_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_campaign_logs_campanha_id ON public.campaign_logs(campanha_id);

-- ========== ACTIVITY_LOGS ==========
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  descricao TEXT NOT NULL,
  recurso_tipo TEXT NOT NULL,
  recurso_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ========== AGENDAMENTOS ==========
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE SET NULL,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL,
  descricao TEXT,
  data_agendamento TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  resultado TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agendamentos sao visiveis para usuarios autenticados" ON public.agendamentos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Agendamentos podem ser inseridos por usuarios autenticados" ON public.agendamentos FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "agendamentos_update_owner_or_manager" ON public.agendamentos FOR UPDATE USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "agendamentos_delete_owner_or_manager" ON public.agendamentos FOR DELETE USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE INDEX idx_agendamentos_cliente_id ON public.agendamentos(cliente_id);
CREATE INDEX idx_agendamentos_data ON public.agendamentos(data_agendamento);
CREATE TRIGGER update_agendamentos_updated_at BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== COMUNICACOES ==========
CREATE TABLE public.comunicacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('ligacao','email','sms','whatsapp','visita','acordo','promessa')),
  canal TEXT NOT NULL CHECK (canal IN ('manual','automatico')),
  assunto TEXT NOT NULL,
  mensagem TEXT,
  anexos JSONB,
  resultado TEXT CHECK (resultado IN ('sucesso','sem_resposta','ocupado','promessa','acordo')),
  data_contato TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comunicacoes TO authenticated;
GRANT ALL ON public.comunicacoes TO service_role;
ALTER TABLE public.comunicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all comunicacoes" ON public.comunicacoes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert comunicacoes" ON public.comunicacoes FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "comunicacoes_update_owner_or_manager" ON public.comunicacoes FOR UPDATE USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE POLICY "comunicacoes_delete_owner_or_manager" ON public.comunicacoes FOR DELETE USING (auth.uid() = created_by OR public.has_min_role(auth.uid(),'gerente'::public.app_role));
CREATE INDEX idx_comunicacoes_cliente_id ON public.comunicacoes(cliente_id);

-- ========== ANEXOS ==========
CREATE TABLE public.anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_id UUID REFERENCES public.titulos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  acordo_id UUID REFERENCES public.acordos(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  tamanho_arquivo INTEGER,
  url_arquivo TEXT NOT NULL,
  categoria TEXT CHECK (categoria IN ('comprovante','documento','contrato','correspondencia')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anexos TO authenticated;
GRANT ALL ON public.anexos TO service_role;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all anexos" ON public.anexos FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert anexos" ON public.anexos FOR INSERT WITH CHECK (auth.uid() = created_by);

-- ========== NOTIFICACOES ==========
CREATE TABLE public.notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notificacoes" ON public.notificacoes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert notificacoes" ON public.notificacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own notificacoes" ON public.notificacoes FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_notificacoes_user_id_lida ON public.notificacoes(user_id, lida);

-- ========== AUDIT_LOG ==========
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  context jsonb,
  reverted boolean NOT NULL DEFAULT false,
  reverted_by_id uuid REFERENCES public.audit_log(id)
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
CREATE INDEX idx_audit_log_record ON public.audit_log (table_name, record_id, occurred_at desc);
CREATE INDEX idx_audit_log_actor ON public.audit_log (actor_id, occurred_at desc);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_select_admin_or_self_manager" ON public.audit_log FOR SELECT USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR (public.has_min_role(auth.uid(),'gerente'::public.app_role) AND actor_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.fn_audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_changed text[]; v_rec_id uuid; v_email text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN v_before := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_after := to_jsonb(NEW); END IF;
  v_rec_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(array_agg(key), '{}') INTO v_changed FROM jsonb_each(v_after) a WHERE a.value IS DISTINCT FROM (v_before->a.key);
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN RETURN NEW; END IF;
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, action, table_name, record_id, before_data, after_data, changed_fields)
  VALUES (auth.uid(), v_email, lower(TG_OP), TG_TABLE_NAME, v_rec_id, v_before, v_after, v_changed);
  RETURN coalesce(NEW, OLD);
END; $$;

CREATE TRIGGER trg_audit_titulos AFTER INSERT OR UPDATE OR DELETE ON public.titulos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_parcelas AFTER INSERT OR UPDATE OR DELETE ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_clientes AFTER INSERT OR UPDATE OR DELETE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_acordos AFTER INSERT OR UPDATE OR DELETE ON public.acordos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_parcelas_acordo AFTER INSERT OR UPDATE OR DELETE ON public.parcelas_acordo FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_agendamentos AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_comunicacoes AFTER INSERT OR UPDATE OR DELETE ON public.comunicacoes FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();
CREATE TRIGGER trg_audit_campanhas AFTER INSERT OR UPDATE OR DELETE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- anti-lockout + audit em user_roles
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_count INTEGER;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'admin'::public.app_role)
     OR (TG_OP = 'UPDATE' AND OLD.role = 'admin'::public.app_role AND NEW.role <> 'admin'::public.app_role) THEN
    SELECT COUNT(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin'::public.app_role;
    IF v_admin_count <= 1 THEN RAISE EXCEPTION 'Nao e possivel remover o ultimo administrador do sistema'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER trg_prevent_last_admin_removal BEFORE DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- ========== MATERIALIZED VIEW ==========
CREATE MATERIALIZED VIEW public.mv_parcelas_consolidadas AS
SELECT
  p.id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento,
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
GROUP BY p.id, p.titulo_id, p.numero_parcela, p.valor_nominal, p.vencimento;
CREATE UNIQUE INDEX idx_mv_parcelas_id ON public.mv_parcelas_consolidadas(id);
CREATE INDEX idx_mv_parcelas_titulo ON public.mv_parcelas_consolidadas(titulo_id);
CREATE INDEX idx_mv_parcelas_status ON public.mv_parcelas_consolidadas(status);
GRANT SELECT ON public.mv_parcelas_consolidadas TO authenticated;
GRANT ALL ON public.mv_parcelas_consolidadas TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_mv_parcelas() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas; END; $$;

-- ========== VIEW TITULOS COMPLETOS ==========
CREATE VIEW public.vw_titulos_completos
WITH (security_invoker = true) AS
SELECT
  t.id, t.cliente_id,
  c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj, c.telefone AS cliente_telefone, c.email AS cliente_email,
  t.numero_documento, t.descricao, t.valor_original, t.vencimento_original, t.metadata, t.created_by, t.created_at, t.updated_at,
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
) p ON p.titulo_id = t.id;
GRANT SELECT ON public.vw_titulos_completos TO authenticated;
GRANT ALL ON public.vw_titulos_completos TO service_role;

-- ========== RPCs FINANCEIRAS ==========
CREATE OR REPLACE FUNCTION public.criar_titulo_com_parcelas(
  p_cliente_id UUID, p_valor_original NUMERIC, p_vencimento_original DATE,
  p_descricao TEXT DEFAULT NULL, p_numero_documento VARCHAR DEFAULT NULL,
  p_numero_parcelas INTEGER DEFAULT 1, p_intervalo_dias INTEGER DEFAULT 30, p_created_by UUID DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_titulo_id UUID; v_valor_parcela NUMERIC; v_data_vencimento DATE; i INTEGER;
BEGIN
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
  SELECT id, saldo_atual, status INTO v_parcela_info FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_parcela_info.id IS NULL THEN RAISE EXCEPTION 'Parcela nao encontrada'; END IF;
  v_saldo_atual := v_parcela_info.saldo_atual;
  IF v_parcela_info.status = 'pago' THEN RAISE EXCEPTION 'Parcela ja esta paga'; END IF;
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
  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, context)
  VALUES (COALESCE(p_created_by, auth.uid()), 'rpc', 'eventos_parcela', v_evento_id,
    jsonb_build_object('rpc','registrar_pagamento_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.aplicar_encargo_parcela(
  p_parcela_id uuid, p_tipo text, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'gerente'::public.app_role) THEN RAISE EXCEPTION 'Operacao restrita a gerente/admin'; END IF;
  IF p_tipo NOT IN ('juros_aplicado','multa_aplicada') THEN RAISE EXCEPTION 'Tipo invalido'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela nao encontrada'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id, p_tipo, p_valor, 1,
    COALESCE(p_descricao, format('%s de R$ %s aplicado', CASE WHEN p_tipo='juros_aplicado' THEN 'Juros' ELSE 'Multa' END, p_valor)),
    COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual+p_valor);
  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, context)
  VALUES (COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','aplicar_encargo_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.conceder_desconto_parcela(
  p_parcela_id uuid, p_valor numeric, p_descricao text DEFAULT NULL, p_created_by uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_atual numeric; v_evento_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'gerente'::public.app_role) THEN RAISE EXCEPTION 'Operacao restrita a gerente/admin'; END IF;
  SELECT saldo_atual INTO v_saldo_atual FROM public.mv_parcelas_consolidadas WHERE id = p_parcela_id;
  IF v_saldo_atual IS NULL THEN RAISE EXCEPTION 'Parcela nao encontrada'; END IF;
  IF p_valor > v_saldo_atual THEN RAISE EXCEPTION 'Desconto excede saldo'; END IF;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by)
  VALUES (p_parcela_id,'desconto_concedido',p_valor,-1, COALESCE(p_descricao, format('Desconto de R$ %s concedido', p_valor)), COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_evento_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_id',v_evento_id,'saldo_anterior',v_saldo_atual,'saldo_atual',v_saldo_atual-p_valor);
  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, context)
  VALUES (COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',v_evento_id, jsonb_build_object('rpc','conceder_desconto_parcela','result',v_result));
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.estornar_evento_parcela(
  p_evento_id uuid, p_motivo text, p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_evento_original record; v_evento_estorno_id uuid; v_result jsonb;
BEGIN
  IF NOT public.has_min_role(auth.uid(),'gerente'::public.app_role) THEN RAISE EXCEPTION 'Operacao restrita a gerente/admin'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN RAISE EXCEPTION 'Motivo do estorno e obrigatorio'; END IF;
  SELECT * INTO v_evento_original FROM public.eventos_parcela WHERE id = p_evento_id;
  IF v_evento_original.id IS NULL THEN RAISE EXCEPTION 'Evento nao encontrado'; END IF;
  IF v_evento_original.estornado THEN RAISE EXCEPTION 'Ja estornado'; END IF;
  IF v_evento_original.tipo IN ('emissao_parcela','estorno') THEN RAISE EXCEPTION 'Nao pode estornar'; END IF;
  UPDATE public.eventos_parcela SET estornado = true WHERE id = p_evento_id;
  INSERT INTO public.eventos_parcela (parcela_id, tipo, valor, efeito, descricao, created_by, estornado_por_id)
  VALUES (v_evento_original.parcela_id,'estorno',v_evento_original.valor, v_evento_original.efeito * -1,
    format('Estorno: %s - Motivo: %s', v_evento_original.descricao, p_motivo), COALESCE(p_created_by, auth.uid()), p_evento_id)
  RETURNING id INTO v_evento_estorno_id;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_parcelas_consolidadas;
  v_result := jsonb_build_object('sucesso',true,'evento_estorno_id',v_evento_estorno_id,'evento_original_id',p_evento_id,'tipo_estornado',v_evento_original.tipo);
  INSERT INTO public.audit_log (actor_id, action, table_name, record_id, context)
  VALUES (COALESCE(p_created_by, auth.uid()),'rpc','eventos_parcela',p_evento_id, jsonb_build_object('rpc','estornar_evento_parcela','result',v_result));
  RETURN v_result;
END; $$;

-- ========== NEW USER HANDLER ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.raw_user_meta_data ->> 'name', 'Usuario'), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operador');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();