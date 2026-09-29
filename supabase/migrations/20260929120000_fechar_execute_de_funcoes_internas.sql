-- ============================================================================
-- Fecha o EXECUTE das funções internas (Auditoria Rodada 1, itens 1, 2 e 17)
--
-- Dois buracos confirmados pelo ACL no banco:
--   * `_importar_titulo_completo` — motor da API v1, recebe empresa e autor por
--     parâmetro e NÃO checa papel — estava executável por `anon`. Sem login,
--     dava para gravar título, parcela e pagamento em qualquer empresa.
--   * `liquidar_parcelas_titulo` — lança 'renegociacao' zerando o saldo de um
--     título, sem checar papel — executável por qualquer `authenticated`,
--     inclusive o vendedor, que é só leitura.
--
-- Causa raiz (a mesma dos furos de 2026-08-26): o schema `public` tem DEFAULT
-- PRIVILEGES que dão EXECUTE a `anon` e `authenticated` em toda função criada
-- pelo `postgres`, e as funções mais antigas ainda carregam EXECUTE para
-- PUBLIC. `REVOKE ... FROM PUBLIC` sozinho não tira o grant nominal — por isso
-- as migrations anteriores revogavam "de todo mundo" e o acesso continuava.
--
-- Regra que passa a valer:
--   1. `anon` não executa NENHUMA função do schema public. O app não chama RPC
--      antes do login; o hook de token roda como `supabase_auth_admin`.
--   2. `authenticated` executa só a lista abaixo: o que o front chama por
--      `supabase.rpc`, mais os helpers que as policies de RLS e as views
--      avaliam com o papel de quem consulta.
--   3. Função nova nasce SEM EXECUTE para `anon`/`authenticated` (default
--      alterado no fim). Quem cria uma RPC para o front concede explicitamente:
--        GRANT EXECUTE ON FUNCTION public.minha_rpc(...) TO authenticated;
--
-- Fora do laço, de propósito:
--   * `role_rank` — o hook de token (invoker, roda como supabase_auth_admin)
--     chama a função e depende do EXECUTE de PUBLIC. É um CASE puro, sem
--     acesso a dado; manter aberto não expõe nada.
--   * `custom_access_token_hook` — grants próprios, definidos pelo Auth.
--
-- Trigger não precisa de EXECUTE de quem dispara: o privilégio só é checado no
-- CREATE TRIGGER. Funções chamadas de dentro de outra SECURITY DEFINER rodam
-- como o dono (postgres), que mantém o acesso.
-- ============================================================================

DO $$
DECLARE
  -- O que o front chama por supabase.rpc (grep em src/, 2026-09-29).
  v_rpcs_do_app text[] := ARRAY[
    'agendar_retorno', 'aplicar_encargo_parcela', 'buscar_cliente_arquivado',
    'cadastros_incompletos', 'cancelar_acordo', 'cancelar_titulo',
    'conceder_desconto_parcela', 'criar_acordo', 'criar_empresa_e_admin',
    'criar_titulo_com_parcelas', 'estornar_movimento', 'excluir_acordos_definitivo',
    'excluir_cliente', 'excluir_titulos_definitivo', 'importar_titulo_completo',
    'limpar_titulos_empresa', 'metricas_empresas', 'pagar_parcela_acordo',
    'reativar_cliente', 'refresh_mv_parcelas', 'registrar_pagamento_parcela',
    'registrar_resultado_cobranca', 'revogar_chave_api'
  ];
  -- Avaliados pelas policies de RLS e pelas views com o papel de quem consulta.
  v_helpers_de_rls text[] := ARRAY[
    'cobrador_ve_cliente', 'cobrador_ve_titulo', 'company_id_do_usuario',
    'current_cobrador_id', 'current_company_id', 'current_vendedor_id',
    'has_min_role', 'is_super_admin'
  ];
  v_fora text[] := ARRAY['role_rank', 'custom_access_token_hook'];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname <> ALL (v_fora)
       AND NOT EXISTS (  -- função de extensão não é nossa
         SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.assinatura);

    IF r.proname = ANY (v_rpcs_do_app || v_helpers_de_rls) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.assinatura);
    END IF;
  END LOOP;
END $$;

-- `role_rank` tinha também grant nominal para anon/authenticated; o de PUBLIC
-- continua cobrindo quem precisa (o hook).
REVOKE EXECUTE ON FUNCTION public.role_rank(public.app_role) FROM anon, authenticated;

-- Daqui para frente, função nova no public não nasce executável pela API.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Confere o resultado em vez de presumir pelo DDL: aborta a migration se
-- sobrar qualquer função executável além do combinado.
DO $$
DECLARE
  v_permitidas text[] := ARRAY[
    'agendar_retorno', 'aplicar_encargo_parcela', 'buscar_cliente_arquivado',
    'cadastros_incompletos', 'cancelar_acordo', 'cancelar_titulo',
    'conceder_desconto_parcela', 'criar_acordo', 'criar_empresa_e_admin',
    'criar_titulo_com_parcelas', 'estornar_movimento', 'excluir_acordos_definitivo',
    'excluir_cliente', 'excluir_titulos_definitivo', 'importar_titulo_completo',
    'limpar_titulos_empresa', 'metricas_empresas', 'pagar_parcela_acordo',
    'reativar_cliente', 'refresh_mv_parcelas', 'registrar_pagamento_parcela',
    'registrar_resultado_cobranca', 'revogar_chave_api',
    'cobrador_ve_cliente', 'cobrador_ve_titulo', 'company_id_do_usuario',
    'current_cobrador_id', 'current_company_id', 'current_vendedor_id',
    'has_min_role', 'is_super_admin',
    'role_rank'
  ];
  v_anon text;
  v_auth text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.proname <> 'role_rank'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  SELECT string_agg(p.proname, ', ') INTO v_auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind = 'f'
     AND p.proname <> ALL (v_permitidas)
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda executa: %', v_anon;
  END IF;
  IF v_auth IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated ainda executa fora da lista: %', v_auth;
  END IF;
END $$;
