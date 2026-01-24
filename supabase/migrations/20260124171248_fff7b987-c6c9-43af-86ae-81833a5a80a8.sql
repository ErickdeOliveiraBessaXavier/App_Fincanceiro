-- Criar sequência para geração de códigos de título
CREATE SEQUENCE IF NOT EXISTS public.titulo_codigo_seq START 1;

-- Função para gerar código único do título
CREATE OR REPLACE FUNCTION public.gerar_codigo_titulo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se numero_documento não foi fornecido, gerar automaticamente
  IF NEW.numero_documento IS NULL OR NEW.numero_documento = '' THEN
    NEW.numero_documento := 'TIT-' || LPAD(nextval('public.titulo_codigo_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Criar trigger para auto-gerar código antes de inserir
DROP TRIGGER IF EXISTS trigger_gerar_codigo_titulo ON public.titulos;
CREATE TRIGGER trigger_gerar_codigo_titulo
  BEFORE INSERT ON public.titulos
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_codigo_titulo();