-- Modelo de 3 níveis: super_admin (mestre), admin (empresa), cobrador (carteira).
-- Admins (e super_admin) NUNCA são restritos a uma carteira, mesmo que estejam
-- vinculados a um cobrador. current_cobrador_id() retorna NULL para eles.
CREATE OR REPLACE FUNCTION public.current_cobrador_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_min_role(auth.uid(), 'admin') THEN NULL
    ELSE (
      SELECT id FROM public.cobradores
      WHERE user_id = auth.uid() AND ativo AND deleted_at IS NULL
      LIMIT 1
    )
  END;
$$;
