-- Complemento do rename: as constraints de FK DA PRÓPRIA tabela cobradores
-- mantiveram o nome antigo (renomear a tabela não renomeia as constraints dela).
-- Num banco recriado do zero elas já nascem como cobradores_* — por isso é guardado.
DO $fk$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='representantes_company_id_fkey' AND conrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TABLE public.cobradores RENAME CONSTRAINT representantes_company_id_fkey TO cobradores_company_id_fkey';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='representantes_user_id_fkey' AND conrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TABLE public.cobradores RENAME CONSTRAINT representantes_user_id_fkey TO cobradores_user_id_fkey';
  END IF;
END $fk$;
