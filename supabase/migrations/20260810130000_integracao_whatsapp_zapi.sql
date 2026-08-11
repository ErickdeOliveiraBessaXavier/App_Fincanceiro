-- ============================================================================
-- Integração de WhatsApp por empresa (provedor: Z-API) — ESTRUTURA
--
-- As campanhas cadastram, filtram, pausam e ativam, mas não têm disparo: não
-- existe canal de saída. Esta migration cria o lugar onde a credencial do
-- provedor vai morar e o registro de cada envio, para que ligar o Z-API depois
-- seja preencher a configuração — não mexer no modelo.
--
-- Nenhuma credencial é criada aqui.
--
-- Sobre o segredo: `token` NUNCA é exposto ao frontend. A RLS de SELECT é
-- negada para `authenticated`; a tela lê `vw_integracoes_whatsapp`, que devolve
-- tudo menos o token mais um booleano dizendo se ele está preenchido. Quem lê o
-- token é a Edge Function, com service_role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integracoes_whatsapp (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Um provedor por empresa por enquanto; a coluna existe para o dia em que
  -- houver outro (Meta Cloud API, Twilio) sem migrar dado.
  provider     text NOT NULL DEFAULT 'z-api' CHECK (provider IN ('z-api')),
  -- Identificadores da instância no Z-API.
  instance_id  text,
  token        text,
  -- Client-Token do Z-API (cabeçalho de segurança da conta).
  client_token text,
  ativo        boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integracoes_whatsapp_uma_por_empresa UNIQUE (company_id, provider)
);

COMMENT ON TABLE public.integracoes_whatsapp IS
  'Credenciais do provedor de WhatsApp por empresa. O token só é lido pela Edge Function (service_role).';

ALTER TABLE public.integracoes_whatsapp ENABLE ROW LEVEL SECURITY;

-- Sem policy de SELECT para `authenticated`: o frontend usa a view abaixo.
DROP POLICY IF EXISTS "integracoes_whatsapp_admin_write" ON public.integracoes_whatsapp;
CREATE POLICY "integracoes_whatsapp_admin_write" ON public.integracoes_whatsapp
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (
    company_id = public.current_company_id()
    AND public.has_min_role((SELECT auth.uid()), 'admin')
  );

GRANT SELECT, INSERT, UPDATE ON public.integracoes_whatsapp TO authenticated;
GRANT ALL ON public.integracoes_whatsapp TO service_role;

-- Situação da integração SEM o segredo. É o que a tela consome.
CREATE OR REPLACE VIEW public.vw_integracoes_whatsapp
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.company_id,
  i.provider,
  i.instance_id,
  i.ativo,
  (i.token IS NOT NULL AND btrim(i.token) <> '') AS token_configurado,
  (i.client_token IS NOT NULL AND btrim(i.client_token) <> '') AS client_token_configurado,
  i.updated_at
FROM public.integracoes_whatsapp i
WHERE i.company_id = public.current_company_id();

GRANT SELECT ON public.vw_integracoes_whatsapp TO authenticated;

COMMENT ON VIEW public.vw_integracoes_whatsapp IS
  'Configuração de WhatsApp da empresa sem o token — apenas se ele está preenchido.';

-- security_invoker respeita a RLS da tabela base, que nega SELECT. A view
-- precisa então de uma policy própria de leitura para admin.
DROP POLICY IF EXISTS "integracoes_whatsapp_admin_read" ON public.integracoes_whatsapp;
CREATE POLICY "integracoes_whatsapp_admin_read" ON public.integracoes_whatsapp
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_min_role((SELECT auth.uid()), 'admin')
  );

-- ============================================================================
-- Registro de envios
--
-- Uma linha por destinatário: é o que permite reprocessar só o que falhou e
-- responder "esse cliente recebeu?" sem depender do painel do provedor.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.campanha_envios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campanha_id    uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  cliente_id     uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  canal          text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'email', 'sms')),
  destino        text NOT NULL,
  status         text NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'enviado', 'falha')),
  -- Id da mensagem no provedor: a chave para conciliar entrega/leitura depois.
  provider_msg_id text,
  erro           text,
  enviado_em     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campanha_envios_campanha
  ON public.campanha_envios(company_id, campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanha_envios_status
  ON public.campanha_envios(company_id, status);

ALTER TABLE public.campanha_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campanha_envios_tenant_read" ON public.campanha_envios;
CREATE POLICY "campanha_envios_tenant_read" ON public.campanha_envios
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Escrita é da Edge Function (service_role): o app não inventa envio.
GRANT SELECT ON public.campanha_envios TO authenticated;
GRANT ALL ON public.campanha_envios TO service_role;

COMMENT ON TABLE public.campanha_envios IS
  'Uma linha por destinatário de campanha. Escrito pela Edge Function enviar-campanha.';

DROP TRIGGER IF EXISTS trg_integracoes_whatsapp_updated ON public.integracoes_whatsapp;
CREATE TRIGGER trg_integracoes_whatsapp_updated
  BEFORE UPDATE ON public.integracoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
