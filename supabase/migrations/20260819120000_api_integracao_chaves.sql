-- ============================================================================
-- Chaves de API por empresa (integração com o ERP do cliente) — ESTRUTURA
--
-- O ERP do cliente nunca recebe acesso ao banco: ele chama a nossa Edge
-- Function `api-v1` com uma chave, e é a chave que diz de qual empresa aquela
-- requisição é. O `company_id` NUNCA vem do corpo da requisição.
--
-- Sobre o segredo: a chave em claro só existe uma vez, no momento em que é
-- gerada e devolvida ao super admin. Aqui fica apenas o SHA-256 dela. O hash é
-- calculado na Edge Function (Web Crypto), não no banco — assim não dependemos
-- de pgcrypto e a chave em claro nunca trafega até o Postgres.
--
-- Sobre o ator: `titulos.created_by` é NOT NULL REFERENCES auth.users(id), e
-- uma chave de máquina não tem usuário logado. Cada chave aponta então para um
-- usuário técnico ("Integração ERP"), criado sem senha — não consegue fazer
-- login, mas é um autor válido. A auditoria fica legível em vez de nula.
--
-- Nenhuma chave é criada aqui.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Nome dado pelo super admin ("ERP do cliente X"), só para identificar na tela.
  nome         text NOT NULL,
  -- Início da chave, guardado em claro para a tela conseguir dizer QUAL chave é
  -- sem nunca revelar o resto ("erp_live_a1b2c3…").
  key_prefix   text NOT NULL,
  -- SHA-256 em hexadecimal da chave completa. É por aqui que a busca acontece.
  key_hash     text NOT NULL,
  -- Usuário técnico que assina o que entra por esta chave.
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  CONSTRAINT api_keys_hash_unico UNIQUE (key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company
  ON public.api_keys(company_id);

-- Só chave viva interessa na resolução, que roda a cada requisição.
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_ativa
  ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.api_keys IS
  'Chaves de API por empresa. Só o hash é guardado; quem lê é a Edge Function (service_role).';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Sem policy nenhuma para `authenticated`: o frontend nunca toca esta tabela.
-- A tela lê a view abaixo e revoga pela RPC; quem escreve é a Edge Function.
GRANT ALL ON public.api_keys TO service_role;

-- ============================================================================
-- O que a tela da Plataforma enxerga
--
-- Sem `security_invoker`: a view roda como dona e filtra por is_super_admin(),
-- no mesmo molde de vw_titulos_completos. Assim a tabela base continua sem
-- nenhuma policy para `authenticated` e o hash nunca sai daqui.
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_api_keys AS
SELECT
  k.id,
  k.company_id,
  c.nome AS company_nome,
  k.nome,
  k.key_prefix,
  k.created_at,
  k.last_used_at,
  k.revoked_at,
  (k.revoked_at IS NULL) AS ativa
FROM public.api_keys k
JOIN public.companies c ON c.id = k.company_id
WHERE public.is_super_admin();

GRANT SELECT ON public.vw_api_keys TO authenticated;
GRANT ALL ON public.vw_api_keys TO service_role;

COMMENT ON VIEW public.vw_api_keys IS
  'Chaves de API sem o hash — o que a página Plataforma lista. Só super admin.';

-- ============================================================================
-- Resolução da chave (chamada pela Edge Function a cada requisição)
--
-- Devolve a empresa e o ator da chave, ou NULL se ela não existe ou foi
-- revogada. Carimba o último uso para a tela conseguir mostrar se a integração
-- do cliente está de fato rodando.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolver_chave_api(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_key record;
BEGIN
  SELECT k.id, k.company_id, k.actor_id INTO v_key
    FROM public.api_keys k
   WHERE k.key_hash = p_hash AND k.revoked_at IS NULL;

  IF v_key.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.api_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'api_key_id', v_key.id,
    'company_id', v_key.company_id,
    'actor_id',   v_key.actor_id
  );
END; $$;

-- Ninguém além da Edge Function precisa disso.
REVOKE ALL ON FUNCTION public.resolver_chave_api(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolver_chave_api(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_chave_api(text) TO service_role;

-- ============================================================================
-- Revogação (ação da tela)
--
-- Revogar é o botão de pânico da integração: derruba o acesso do ERP na hora,
-- sem apagar o histórico de uso da chave.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revogar_chave_api(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_afetadas int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o super admin gerencia chaves de API';
  END IF;

  UPDATE public.api_keys
     SET revoked_at = now()
   WHERE id = p_id AND revoked_at IS NULL;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  IF v_afetadas = 0 THEN RAISE EXCEPTION 'Chave não encontrada ou já revogada'; END IF;

  RETURN jsonb_build_object('sucesso', true, 'id', p_id);
END; $$;

REVOKE ALL ON FUNCTION public.revogar_chave_api(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revogar_chave_api(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_chave_api(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
