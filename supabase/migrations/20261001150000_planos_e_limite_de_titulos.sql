-- =====================================================================
-- Planos: limite de títulos e período de teste
-- =====================================================================
-- Regras decididas pelo gestor em 2026-10-01:
--
--   * O plano limita a quantidade de TÍTULOS da empresa. Conta todo título
--     não cancelado: em aberto, vencido, pago, em acordo. É a mesma contagem
--     que a Plataforma já mostrava (metricas_empresas.titulos_ativos), agora
--     em uma função só (_titulos_contabilizados).
--   * Ao atingir 100% do limite, só a criação de título NOVO é recusada (pela
--     planilha, pela Plataforma, pela API do ERP e pelo título manual).
--     Reimportar um título que já existe, dar baixa, fazer acordo e consultar
--     continuam funcionando.
--   * Trial dura 7 dias a partir da aprovação da empresa. Vencido, a empresa
--     fica bloqueada até o super admin trocar o plano ou estender o prazo.
--   * Plano "Cortesia": sem limite e sem prazo, concedido pelo super admin
--     (empresa de teste, piloto, demonstração).
--   * Planos acima do Enterprise não viram plano novo: a empresa recebe um
--     limite personalizado (companies.limite_titulos_personalizado).
--
-- A trava mora no banco (trigger em titulos) porque títulos nascem por quatro
-- portas diferentes; uma conferência só na tela deixaria a API passar.
--
-- Fecha também dois furos que já existiam e que este recurso tornaria graves:
--   1. A policy companies_admin_update deixava o admin da empresa alterar a
--      própria linha inteira, inclusive `plano` e `status`.
--   2. A API do ERP não conferia o status da empresa: com a empresa suspensa,
--      a chave de API continuava gravando.

-- ============== 1. CATÁLOGO DE PLANOS ==============

CREATE TABLE public.planos (
  codigo         text PRIMARY KEY CHECK (codigo ~ '^[a-z0-9_]+$'),
  nome           text NOT NULL,
  -- NULL = sem limite.
  limite_titulos integer CHECK (limite_titulos IS NULL OR limite_titulos > 0),
  -- Preenchido só nos planos de teste: dias de acesso a partir da aprovação.
  dias_teste     integer CHECK (dias_teste IS NULL OR dias_teste > 0),
  ordem          integer NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.planos TO authenticated;
GRANT ALL ON public.planos TO service_role;
-- Catálogo público para quem está logado (nome e limite não são segredo).
-- Escrita só por migration/SQL: não há policy de INSERT/UPDATE.
CREATE POLICY planos_select ON public.planos
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);

INSERT INTO public.planos (codigo, nome, limite_titulos, dias_teste, ordem) VALUES
  ('trial',        'Teste',        5000,  7,    0),
  ('basico',       'Básico',       5000,  NULL, 10),
  ('essencial',    'Essencial',    10000, NULL, 20),
  ('profissional', 'Profissional', 20000, NULL, 30),
  ('enterprise',   'Enterprise',   30000, NULL, 40),
  ('cortesia',     'Cortesia',     NULL,  NULL, 90);

-- ============== 2. PLANO DA EMPRESA ==============

ALTER TABLE public.companies
  ADD COLUMN limite_titulos_personalizado integer
    CHECK (limite_titulos_personalizado IS NULL OR limite_titulos_personalizado > 0),
  -- NULL = sem prazo. Passou da data, a empresa fica bloqueada.
  ADD COLUMN acesso_expira_em timestamptz;

-- Hoje todas as empresas estão em 'trial'; qualquer valor desconhecido vira trial.
UPDATE public.companies SET plano = 'trial'
 WHERE plano NOT IN (SELECT codigo FROM public.planos);

ALTER TABLE public.companies
  ADD CONSTRAINT companies_plano_fkey FOREIGN KEY (plano) REFERENCES public.planos(codigo);

-- Empresas em teste já aprovadas ganham 7 dias a partir de agora: o prazo não
-- pode começar no passado, senão bloquearia quem está usando hoje.
UPDATE public.companies SET acesso_expira_em = now() + interval '7 days'
 WHERE plano = 'trial' AND status = 'ativa' AND acesso_expira_em IS NULL;

-- ============== 3. ACESSO: STATUS + PRAZO ==============

-- Mesma regra de current_company_id(), para quem recebe a empresa por
-- parâmetro (API do ERP).
CREATE OR REPLACE FUNCTION public._empresa_liberada(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = p_company
       AND c.status = 'ativa'
       AND (c.acesso_expira_em IS NULL OR c.acesso_expira_em > now())
  );
$$;

-- Tenant efetivo: além de ativa, a empresa precisa estar dentro do prazo. Com
-- o teste vencido devolve NULL e toda policy falha sozinha, como já acontece
-- com a empresa suspensa (ver 20260715120000).
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
  FROM public.companies c
  WHERE c.id = public.company_id_do_usuario()
    AND c.status = 'ativa'
    AND (c.acesso_expira_em IS NULL OR c.acesso_expira_em > now());
$$;

-- A chave de API não vale para empresa bloqueada. Devolver NULL faz a Edge
-- Function responder 401 tanto na versão atual quanto na nova.
CREATE OR REPLACE FUNCTION public.resolver_chave_api(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_key record;
BEGIN
  SELECT k.id, k.company_id, k.actor_id INTO v_key
    FROM public.api_keys k
   WHERE k.key_hash = p_hash AND k.revoked_at IS NULL;

  IF v_key.id IS NULL THEN RETURN NULL; END IF;
  IF NOT public._empresa_liberada(v_key.company_id) THEN RETURN NULL; END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'api_key_id', v_key.id,
    'company_id', v_key.company_id,
    'actor_id',   v_key.actor_id
  );
END; $$;

-- ============== 4. CAMPOS QUE SÓ A PLATAFORMA ALTERA ==============

-- A policy companies_admin_update continua valendo para nome/CNPJ, mas plano,
-- status e prazo são decisão da plataforma. Sem usuário (service role, cron,
-- migration) não há o que proteger.
CREATE OR REPLACE FUNCTION public._proteger_campos_da_plataforma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN RETURN NEW; END IF;
  IF (NEW.plano, NEW.status, NEW.limite_titulos_personalizado, NEW.acesso_expira_em, NEW.deleted_at)
     IS DISTINCT FROM
     (OLD.plano, OLD.status, OLD.limite_titulos_personalizado, OLD.acesso_expira_em, OLD.deleted_at) THEN
    RAISE EXCEPTION 'Plano, status e prazo de acesso da empresa só podem ser alterados pela plataforma';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_companies_a_proteger_plataforma
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._proteger_campos_da_plataforma();

-- O relógio do teste começa quando a empresa passa a ter acesso (aprovação),
-- não no cadastro: o tempo em 'pendente' não é uso. Quem já tem prazo definido
-- (inclusive pela plataforma) não é tocado.
CREATE OR REPLACE FUNCTION public._iniciar_periodo_de_teste()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer;
BEGIN
  IF NEW.status <> 'ativa' OR NEW.acesso_expira_em IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ativa' AND OLD.plano = NEW.plano THEN RETURN NEW; END IF;

  SELECT dias_teste INTO v_dias FROM public.planos WHERE codigo = NEW.plano;
  IF v_dias IS NOT NULL THEN
    NEW.acesso_expira_em := now() + make_interval(days => v_dias);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_companies_b_periodo_de_teste
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._iniciar_periodo_de_teste();

-- ============== 5. LIMITE DE TÍTULOS ==============

-- O que o plano conta. Regra única: trigger, Plataforma e tela da empresa
-- usam esta função.
CREATE OR REPLACE FUNCTION public._titulos_contabilizados(p_company uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.titulos t
   WHERE t.company_id = p_company AND t.status = 'ativo';
$$;

-- Limite efetivo: o personalizado, se houver; senão, o do plano. NULL = sem limite.
CREATE OR REPLACE FUNCTION public._limite_titulos(p_company uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.limite_titulos_personalizado, p.limite_titulos)
    FROM public.companies c
    JOIN public.planos p ON p.codigo = c.plano
   WHERE c.id = p_company;
$$;

-- Recusa o título que passaria do limite. O lock por empresa serializa duas
-- importações simultâneas: sem ele, as duas contariam o mesmo número e o
-- limite estouraria. Vale até o fim da transação (cada título importado é uma
-- transação própria, então o lock dura milissegundos).
--
-- HINT 'limite_do_plano' é o código que a tela de importação e a API usam
-- para distinguir este erro dos demais.
CREATE OR REPLACE FUNCTION public._conferir_limite_titulos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limite integer; v_usados bigint;
BEGIN
  IF NEW.status IS DISTINCT FROM 'ativo' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ativo' THEN RETURN NEW; END IF;

  v_limite := public._limite_titulos(NEW.company_id);
  IF v_limite IS NULL THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('limite_titulos:' || NEW.company_id::text, 0));
  v_usados := public._titulos_contabilizados(NEW.company_id);
  IF v_usados >= v_limite THEN
    RAISE EXCEPTION 'Limite do plano atingido: % de % títulos. Para incluir títulos novos, amplie o plano.',
      v_usados, v_limite
      USING HINT = 'limite_do_plano';
  END IF;
  RETURN NEW;
END; $$;

-- Nome ordena depois de trg_set_company_titulos: o company_id já está
-- preenchido quando esta trigger roda (título manual não informa a empresa).
CREATE TRIGGER trg_titulos_limite_plano
  BEFORE INSERT OR UPDATE OF status ON public.titulos
  FOR EACH ROW EXECUTE FUNCTION public._conferir_limite_titulos();

-- A contagem roda a cada título novo: índice parcial só com os que contam.
CREATE INDEX IF NOT EXISTS idx_titulos_company_contabilizados
  ON public.titulos (company_id) WHERE status = 'ativo';

-- ============== 6. RPCs ==============

-- Uso do plano. Usuário da empresa vê a própria; super admin informa qual.
CREATE OR REPLACE FUNCTION public.uso_do_plano(p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  IF public.is_super_admin() THEN
    v_company := p_company_id;
  ELSIF public.has_min_role(auth.uid(), 'leitura') THEN
    v_company := public.current_company_id();
  END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  RETURN (
    SELECT jsonb_build_object(
      'plano',            c.plano,
      'plano_nome',       p.nome,
      'limite',           public._limite_titulos(c.id),
      'usados',           public._titulos_contabilizados(c.id),
      'acesso_expira_em', c.acesso_expira_em
    )
    FROM public.companies c
    JOIN public.planos p ON p.codigo = c.plano
    WHERE c.id = v_company
  );
END; $$;

-- Troca de plano, limite personalizado e prazo. Só super admin.
-- Prazo omitido: plano de teste ganha os dias do plano (se a empresa já estiver
-- aprovada; senão o relógio começa na aprovação); os demais ficam sem prazo.
CREATE OR REPLACE FUNCTION public.definir_plano_empresa(
  p_company_id uuid,
  p_plano text,
  p_limite_personalizado integer DEFAULT NULL,
  p_acesso_expira_em timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer; v_status text; v_expira timestamptz := p_acesso_expira_em;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;
  IF p_limite_personalizado IS NOT NULL AND p_limite_personalizado < 1 THEN
    RAISE EXCEPTION 'Limite personalizado deve ser maior que zero';
  END IF;

  SELECT dias_teste INTO v_dias FROM public.planos WHERE codigo = p_plano AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano inexistente: %', p_plano; END IF;

  SELECT status INTO v_status FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;

  IF v_expira IS NULL AND v_dias IS NOT NULL AND v_status = 'ativa' THEN
    v_expira := now() + make_interval(days => v_dias);
  END IF;

  UPDATE public.companies
     SET plano = p_plano,
         limite_titulos_personalizado = p_limite_personalizado,
         acesso_expira_em = v_expira
   WHERE id = p_company_id;

  RETURN jsonb_build_object('sucesso', true, 'plano', p_plano, 'acesso_expira_em', v_expira);
END; $$;

-- Métricas da Plataforma: a contagem passa pela função do plano e o limite
-- efetivo vem junto. Mudou o tipo de retorno, então DROP + CREATE.
DROP FUNCTION IF EXISTS public.metricas_empresas();
CREATE FUNCTION public.metricas_empresas()
RETURNS TABLE(
  company_id       uuid,
  titulos_ativos   bigint,
  titulos_total    bigint,
  clientes         bigint,
  usuarios         bigint,
  ultima_atividade timestamptz,
  limite_titulos   integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Operação restrita ao super admin'; END IF;

  RETURN QUERY
    SELECT
      c.id,
      public._titulos_contabilizados(c.id),
      (SELECT count(*) FROM public.titulos t WHERE t.company_id = c.id),
      (SELECT count(*) FROM public.clientes cl WHERE cl.company_id = c.id),
      (SELECT count(*) FROM public.profiles p WHERE p.company_id = c.id),
      (SELECT max(a.occurred_at) FROM public.audit_log a WHERE a.company_id = c.id),
      public._limite_titulos(c.id)
    FROM public.companies c;
END; $$;

GRANT EXECUTE ON FUNCTION public.metricas_empresas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.uso_do_plano(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_plano_empresa(uuid, text, integer, timestamptz) TO authenticated;

-- ============== 7. CONFERÊNCIA ==============
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.metricas_empresas()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.uso_do_plano(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.definir_plano_empresa(uuid,text,integer,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.uso_do_plano(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.definir_plano_empresa(uuid,text,integer,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._titulos_contabilizados(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._limite_titulos(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._empresa_liberada(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.current_company_id()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolver_chave_api(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant errado nas funções de plano';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
