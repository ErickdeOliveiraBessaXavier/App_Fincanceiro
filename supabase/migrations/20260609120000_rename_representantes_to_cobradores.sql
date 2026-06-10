-- ============================================================
-- Renomeia o conceito "Representante" -> "Cobrador" no BANCO JÁ APLICADO.
-- As migrations de origem já nascem como "cobradores"; esta migration existe
-- para alinhar um banco remoto que já rodou as versões antigas (representantes).
--
-- É IDEMPOTENTE: cada passo só age se o objeto com o nome ANTIGO existir. Num
-- banco recriado do zero (db reset com as migrations já renomeadas) vira no-op.
--
-- Preserva dados e OIDs: as policies de RLS que referenciam as funções de
-- carteira continuam válidas (function rename segue por OID; column rename
-- segue por attnum) — por isso NÃO é preciso recriar as policies das outras
-- tabelas (clientes, titulos, parcelas, eventos_parcela, acordos, etc.).
-- ============================================================

-- 1) Tabela ---------------------------------------------------
ALTER TABLE IF EXISTS public.representantes RENAME TO cobradores;

-- 2) Colunas (RENAME COLUMN não aceita IF EXISTS -> guarda manual) ----
DO $col$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='clientes' AND column_name='representante_id') THEN
    EXECUTE 'ALTER TABLE public.clientes RENAME COLUMN representante_id TO cobrador_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='convites' AND column_name='representante_id') THEN
    EXECUTE 'ALTER TABLE public.convites RENAME COLUMN representante_id TO cobrador_id';
  END IF;
END $col$;

-- 3) Constraints (nomes auto-gerados pelo Postgres) -----------
DO $con$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='representantes_pkey' AND conrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TABLE public.cobradores RENAME CONSTRAINT representantes_pkey TO cobradores_pkey';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='representantes_company_id_nome_key' AND conrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TABLE public.cobradores RENAME CONSTRAINT representantes_company_id_nome_key TO cobradores_company_id_nome_key';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clientes_representante_id_fkey' AND conrelid='public.clientes'::regclass) THEN
    EXECUTE 'ALTER TABLE public.clientes RENAME CONSTRAINT clientes_representante_id_fkey TO clientes_cobrador_id_fkey';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='convites_representante_id_fkey' AND conrelid='public.convites'::regclass) THEN
    EXECUTE 'ALTER TABLE public.convites RENAME CONSTRAINT convites_representante_id_fkey TO convites_cobrador_id_fkey';
  END IF;
END $con$;

-- 4) Índices --------------------------------------------------
ALTER INDEX IF EXISTS public.idx_representantes_company RENAME TO idx_cobradores_company;
ALTER INDEX IF EXISTS public.idx_representantes_user RENAME TO idx_cobradores_user;
ALTER INDEX IF EXISTS public.idx_clientes_representante RENAME TO idx_clientes_cobrador;

-- 5) Triggers da tabela ---------------------------------------
DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_set_company_representantes' AND tgrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TRIGGER trg_set_company_representantes ON public.cobradores RENAME TO trg_set_company_cobradores';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_representantes_updated_at' AND tgrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TRIGGER update_representantes_updated_at ON public.cobradores RENAME TO update_cobradores_updated_at';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_audit_representantes' AND tgrelid='public.cobradores'::regclass) THEN
    EXECUTE 'ALTER TRIGGER trg_audit_representantes ON public.cobradores RENAME TO trg_audit_cobradores';
  END IF;
END $trg$;

-- 6) Policies da própria tabela cobradores --------------------
DO $pol$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cobradores' AND policyname='representantes_select') THEN
    EXECUTE 'ALTER POLICY representantes_select ON public.cobradores RENAME TO cobradores_select';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cobradores' AND policyname='representantes_insert') THEN
    EXECUTE 'ALTER POLICY representantes_insert ON public.cobradores RENAME TO cobradores_insert';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cobradores' AND policyname='representantes_update') THEN
    EXECUTE 'ALTER POLICY representantes_update ON public.cobradores RENAME TO cobradores_update';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cobradores' AND policyname='representantes_delete_admin') THEN
    EXECUTE 'ALTER POLICY representantes_delete_admin ON public.cobradores RENAME TO cobradores_delete_admin';
  END IF;
END $pol$;

-- 7) Funções de carteira: renomeia preservando OID (policies seguem) --
DO $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='current_rep_id' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'ALTER FUNCTION public.current_rep_id() RENAME TO current_cobrador_id';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='rep_ve_cliente' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'ALTER FUNCTION public.rep_ve_cliente(uuid) RENAME TO cobrador_ve_cliente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='rep_ve_titulo' AND pronamespace='public'::regnamespace) THEN
    EXECUTE 'ALTER FUNCTION public.rep_ve_titulo(uuid) RENAME TO cobrador_ve_titulo';
  END IF;
END $fn$;

-- 7b) Corpos corrigidos (apontam para cobradores/cobrador_id). CREATE OR REPLACE
--     mantém o OID, então as policies que já chamam estas funções seguem válidas.
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

CREATE OR REPLACE FUNCTION public.cobrador_ve_cliente(_cliente_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_cobrador_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = _cliente_id AND c.cobrador_id = public.current_cobrador_id()
      );
$$;

CREATE OR REPLACE FUNCTION public.cobrador_ve_titulo(_titulo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_cobrador_id() IS NULL
      OR EXISTS (
        SELECT 1 FROM public.titulos t
        JOIN public.clientes c ON c.id = t.cliente_id
        WHERE t.id = _titulo_id AND c.cobrador_id = public.current_cobrador_id()
      );
$$;

-- 8) Funções sem dependência de policy: drop do nome antigo + cria novo ----
DROP FUNCTION IF EXISTS public.find_or_create_representante(text);
CREATE OR REPLACE FUNCTION public.find_or_create_cobrador(p_nome text)
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

-- 9) importar_titulo: o parâmetro p_representante virou p_cobrador (mudança de
--    nome de parâmetro exige DROP + CREATE).
DROP FUNCTION IF EXISTS public.importar_titulo(uuid, text, text, numeric, date, text, text, text);
CREATE OR REPLACE FUNCTION public.importar_titulo(
  p_company_id uuid,
  p_cliente_nome text,
  p_cpf_cnpj text,
  p_valor numeric,
  p_vencimento date,
  p_contato text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_cobrador text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid;
  v_is_super boolean := public.is_super_admin();
  v_cliente_id uuid;
  v_cobrador_id uuid;
  v_titulo_id uuid;
  v_cpf text := regexp_replace(coalesce(p_cpf_cnpj,''), '[^0-9]', '', 'g');
BEGIN
  IF v_is_super THEN
    v_company := p_company_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'Selecione a empresa de destino'; END IF;
  ELSE
    IF NOT public.has_min_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Apenas administradores podem importar';
    END IF;
    v_company := public.current_company_id();
    IF p_company_id IS NOT NULL AND p_company_id <> v_company THEN
      RAISE EXCEPTION 'Empresa inválida para este usuário';
    END IF;
  END IF;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada'; END IF;

  IF length(v_cpf) NOT IN (11, 14) THEN RAISE EXCEPTION 'CPF/CNPJ inválido'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  IF coalesce(trim(p_cliente_nome),'') = '' THEN RAISE EXCEPTION 'Nome do cliente obrigatório'; END IF;

  -- Cobrador (opcional): cria se não existir na empresa
  IF p_cobrador IS NOT NULL AND length(trim(p_cobrador)) > 0 THEN
    SELECT id INTO v_cobrador_id FROM public.cobradores
      WHERE company_id = v_company AND lower(nome) = lower(trim(p_cobrador)) AND deleted_at IS NULL;
    IF v_cobrador_id IS NULL THEN
      INSERT INTO public.cobradores (company_id, nome, created_by)
      VALUES (v_company, trim(p_cobrador), auth.uid())
      RETURNING id INTO v_cobrador_id;
    END IF;
  END IF;

  SELECT id INTO v_cliente_id FROM public.clientes
    WHERE company_id = v_company AND cpf_cnpj = v_cpf;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (company_id, nome, cpf_cnpj, telefone, cobrador_id, created_by, status)
    VALUES (v_company, trim(p_cliente_nome), v_cpf, NULLIF(trim(coalesce(p_contato,'')), ''), v_cobrador_id, auth.uid(), 'ativo')
    RETURNING id INTO v_cliente_id;
  ELSIF v_cobrador_id IS NOT NULL THEN
    UPDATE public.clientes SET cobrador_id = v_cobrador_id WHERE id = v_cliente_id;
  END IF;

  INSERT INTO public.titulos (company_id, cliente_id, valor_original, vencimento_original, descricao, created_by)
  VALUES (v_company, v_cliente_id, p_valor, p_vencimento, NULLIF(trim(coalesce(p_descricao,'')), ''), auth.uid())
  RETURNING id INTO v_titulo_id;

  INSERT INTO public.parcelas (company_id, titulo_id, numero_parcela, valor_nominal, vencimento)
  VALUES (v_company, v_titulo_id, 1, p_valor, p_vencimento);

  RETURN jsonb_build_object('sucesso', true, 'titulo_id', v_titulo_id, 'cliente_id', v_cliente_id);
END; $$;
