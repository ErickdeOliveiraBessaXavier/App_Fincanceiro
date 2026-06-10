-- Cobradores: funcionários da empresa que possuem uma carteira de cobrança.
-- Cada cliente é vinculado a um cobrador (carteira = clientes do cobrador).
CREATE TABLE public.cobradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- futuro: login do cobrador
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (company_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobradores TO authenticated;
GRANT ALL ON public.cobradores TO service_role;
CREATE INDEX idx_cobradores_company ON public.cobradores(company_id, ativo);
CREATE INDEX idx_cobradores_user ON public.cobradores(user_id);
ALTER TABLE public.cobradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobradores_select" ON public.cobradores FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "cobradores_insert" ON public.cobradores FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "cobradores_update" ON public.cobradores FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "cobradores_delete_admin" ON public.cobradores FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_cobradores BEFORE INSERT ON public.cobradores
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_cobradores_updated_at BEFORE UPDATE ON public.cobradores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_cobradores AFTER INSERT OR UPDATE OR DELETE ON public.cobradores
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Vínculo cliente -> cobrador (carteira). ON DELETE SET NULL: remover o
-- cobrador não apaga os clientes, apenas desvincula.
ALTER TABLE public.clientes
  ADD COLUMN cobrador_id UUID REFERENCES public.cobradores(id) ON DELETE SET NULL;
CREATE INDEX idx_clientes_cobrador ON public.clientes(company_id, cobrador_id);

-- Resolve (ou cria) um cobrador pelo nome, dentro da empresa atual.
-- Usado na importação para vincular clientes ao cobrador por nome.
CREATE OR REPLACE FUNCTION public.find_or_create_cobrador(p_nome TEXT)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_company uuid := public.current_company_id();
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;
  SELECT id INTO v_id FROM public.cobradores
    WHERE company_id = v_company AND lower(nome) = lower(trim(p_nome)) AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.cobradores (company_id, nome, created_by)
    VALUES (v_company, trim(p_nome), auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
