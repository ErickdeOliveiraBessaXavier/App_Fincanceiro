-- =====================================================================
-- CONVITES DE ACESSO — cobrador se cadastra por link e admin autoriza
-- =====================================================================
-- Fluxo:
--   1. Admin gera um convite (link com token) para um cobrador.
--   2. Cobrador abre o link e cria a própria conta (e-mail + senha) via
--      Edge Function `registrar-convite` (service role valida o token e define
--      a empresa no servidor — o cliente nunca se auto-atribui a um tenant).
--   3. Conta fica SEM papel => Layout mostra "aguardando autorização".
--   4. Admin autoriza => atribui papel 'operador' e vincula a carteira.
-- Status: pendente (link criado) -> aguardando (cadastrou) -> aprovado | revogado
-- =====================================================================

CREATE TABLE public.convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cobrador_id UUID REFERENCES public.cobradores(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  nome_sugerido TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aguardando','aprovado','revogado')),
  created_by UUID,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.convites TO authenticated;
GRANT ALL ON public.convites TO service_role;

CREATE INDEX idx_convites_company ON public.convites(company_id, status);
CREATE UNIQUE INDEX idx_convites_token ON public.convites(token);

ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

-- Apenas admin da empresa (ou super_admin) enxerga/gerencia os convites.
-- A página pública de cadastro NÃO lê esta tabela: quem valida o token é a
-- Edge Function rodando com service role (ignora RLS).
CREATE POLICY "convites_select" ON public.convites FOR SELECT TO authenticated
  USING (public.is_super_admin()
         OR (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin')));
CREATE POLICY "convites_insert" ON public.convites FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE POLICY "convites_update" ON public.convites FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE POLICY "convites_delete" ON public.convites FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));

-- Preenche company_id automaticamente (defesa: convite sempre no tenant atual).
CREATE TRIGGER trg_set_company_convites BEFORE INSERT ON public.convites
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
