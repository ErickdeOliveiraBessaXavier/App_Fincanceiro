-- Representantes: funcionários da empresa que possuem uma carteira de cobrança.
-- Cada cliente é vinculado a um representante (carteira = clientes do representante).
CREATE TABLE public.representantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- futuro: login do representante
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.representantes TO authenticated;
GRANT ALL ON public.representantes TO service_role;
CREATE INDEX idx_representantes_company ON public.representantes(company_id, ativo);
CREATE INDEX idx_representantes_user ON public.representantes(user_id);
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "representantes_select" ON public.representantes FOR SELECT TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id());
CREATE POLICY "representantes_insert" ON public.representantes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "representantes_update" ON public.representantes FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'operador'));
CREATE POLICY "representantes_delete_admin" ON public.representantes FOR DELETE TO authenticated
  USING (company_id = public.current_company_id() AND public.has_min_role(auth.uid(),'admin'));
CREATE TRIGGER trg_set_company_representantes BEFORE INSERT ON public.representantes
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_company_id();
CREATE TRIGGER update_representantes_updated_at BEFORE UPDATE ON public.representantes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_audit_representantes AFTER INSERT OR UPDATE OR DELETE ON public.representantes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_row();

-- Vínculo cliente -> representante (carteira). ON DELETE SET NULL: remover o
-- representante não apaga os clientes, apenas desvincula.
ALTER TABLE public.clientes
  ADD COLUMN representante_id UUID REFERENCES public.representantes(id) ON DELETE SET NULL;
CREATE INDEX idx_clientes_representante ON public.clientes(company_id, representante_id);

-- Resolve (ou cria) um representante pelo nome, dentro da empresa atual.
-- Usado na importação para vincular clientes ao representante por nome.
CREATE OR REPLACE FUNCTION public.find_or_create_representante(p_nome TEXT)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_company uuid := public.current_company_id();
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;
  SELECT id INTO v_id FROM public.representantes
    WHERE company_id = v_company AND lower(nome) = lower(trim(p_nome)) AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO public.representantes (company_id, nome, created_by)
    VALUES (v_company, trim(p_nome), auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
