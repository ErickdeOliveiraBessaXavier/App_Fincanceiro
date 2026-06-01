-- Modelo de 3 níveis: super_admin (mestre), admin (empresa), representante (carteira).
-- Admins (e super_admin) NUNCA são restritos a uma carteira, mesmo que estejam
-- vinculados a um representante. current_rep_id() retorna NULL para eles.
CREATE OR REPLACE FUNCTION public.current_rep_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_min_role(auth.uid(), 'admin') THEN NULL
    ELSE (
      SELECT id FROM public.representantes
      WHERE user_id = auth.uid() AND ativo AND deleted_at IS NULL
      LIMIT 1
    )
  END;
$$;
