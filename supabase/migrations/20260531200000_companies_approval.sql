-- Fase 3: empresas self-service nascem "pendente" e só acessam após aprovação do super_admin.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check CHECK (status IN ('pendente','ativa','suspensa','cancelada'));
ALTER TABLE public.companies ALTER COLUMN status SET DEFAULT 'pendente';
