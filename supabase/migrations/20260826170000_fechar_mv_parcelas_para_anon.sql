-- ============================================================================
-- Tira a materialized view de parcelas do alcance de `anon`
--
-- Buraco da mesma família dos anteriores, e o mais grave que sobrou: ele
-- ANULAVA a proteção que a 20260826160000 acabou de instalar.
--
-- `vw_parcelas_consolidadas` passou a filtrar empresa e carteira. Mas ela lê de
-- `mv_parcelas_consolidadas`, e MATERIALIZED VIEW **não suporta RLS** — não há
-- policy possível ali. Como a MV estava com SELECT liberado para `anon` e o
-- PostgREST publica o schema `public` inteiro, bastava chamar
-- /rest/v1/mv_parcelas_consolidadas para ler as parcelas de TODAS as empresas,
-- sem login, pulando a view protegida por completo.
--
-- Curiosidade que mostra que isso era descuido e não intenção: `authenticated`
-- já estava SEM acesso; só `anon` tinha. Ou seja, o usuário logado era mais
-- restrito que o visitante anônimo.
--
-- A aplicação não consulta a MV direto — usa `vw_parcelas_consolidadas`, que
-- continua funcionando porque é SECURITY DEFINER e lê como dono.
-- ============================================================================

REVOKE SELECT ON public.mv_parcelas_consolidadas FROM anon;

COMMENT ON MATERIALIZED VIEW public.mv_parcelas_consolidadas IS
  'Materialized view NÃO tem RLS. Nunca conceda SELECT a anon/authenticated — o acesso é por vw_parcelas_consolidadas, que filtra empresa e carteira.';
