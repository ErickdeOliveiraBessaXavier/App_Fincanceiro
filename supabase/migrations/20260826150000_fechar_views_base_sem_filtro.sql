-- ============================================================================
-- Tira as views-base sem filtro de tenant do alcance da API
--
-- `vw_recebimentos`, `vw_descontos_concedidos` e `vw_parcelas_acordo_consolidadas`
-- são views SEM `security_invoker`, ou seja, consultam as tabelas com os
-- privilégios do DONO — furando a RLS de quem pergunta. E nenhuma delas filtra
-- `company_id`.
--
-- Como toda view do schema `public` nasce com SELECT para `anon` e
-- `authenticated` (default privileges do Supabase) e o PostgREST publica o
-- schema inteiro, o resultado era: qualquer um, inclusive DESLOGADO, lia
-- `/rest/v1/vw_recebimentos` e enxergava os pagamentos de TODAS as empresas.
-- O mesmo para descontos e para as parcelas de acordo.
--
-- Confirmado em Postgres local com `SET ROLE anon`: as três respondem sem erro.
--
-- Elas não são consumidas pela aplicação. O front usa apenas os invólucros
-- `_tenant`, que aplicam `WHERE company_id = current_company_id()`. As bases
-- existem só para esses invólucros as lerem — e isso continua funcionando,
-- porque os `_tenant` também rodam com os privilégios do dono.
--
-- Fecho por revogação em vez de `security_invoker=true`: ligar invoker na base
-- mudaria a semântica de leitura DENTRO dos invólucros `_tenant`, que passariam
-- a aplicar RLS do usuário da sessão sobre `movimentos_financeiros`. Isso é uma
-- mudança de comportamento de relatório, não de segurança, e não cabe no mesmo
-- passo que fecha um vazamento.
-- ============================================================================

REVOKE SELECT ON public.vw_recebimentos FROM anon, authenticated;
REVOKE SELECT ON public.vw_descontos_concedidos FROM anon, authenticated;
REVOKE SELECT ON public.vw_parcelas_acordo_consolidadas FROM anon, authenticated;

-- Sem ALTER DEFAULT PRIVILEGES de propósito: mexer no padrão do schema inteiro
-- para resolver três views afeta todo objeto futuro, com alcance que não dá
-- para prever aqui. `CREATE OR REPLACE VIEW` preserva privilégios existentes,
-- então o risco real é só um DROP + CREATE — que os COMMENTs abaixo avisam.

COMMENT ON VIEW public.vw_recebimentos IS
  'Base sem filtro de tenant. NÃO exponha a anon/authenticated — use vw_recebimentos_tenant.';
COMMENT ON VIEW public.vw_descontos_concedidos IS
  'Base sem filtro de tenant. NÃO exponha a anon/authenticated — use vw_descontos_concedidos_tenant.';
COMMENT ON VIEW public.vw_parcelas_acordo_consolidadas IS
  'Base sem filtro de tenant. NÃO exponha a anon/authenticated — use vw_parcelas_acordo_tenant.';
