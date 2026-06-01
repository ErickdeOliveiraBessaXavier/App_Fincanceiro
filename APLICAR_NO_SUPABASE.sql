-- ====================================================================
-- COMO USAR:
--   1. Abra https://supabase.com/dashboard e entre no seu projeto.
--   2. Menu esquerdo -> SQL Editor -> New query.
--   3. Copie TODO o conteudo abaixo, cole na caixa e clique em Run.
--   4. Deve aparecer "Success. No rows returned".
-- Cria a tabela `convites` (acesso do representante por link + autorizacao).
-- ====================================================================

CREATE TABLE public.convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  representante_id UUID REFERENCES public.representantes(id) ON DELETE SET NULL,
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

ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER trg_set_company_convites BEFORE INSERT ON public.convites
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
