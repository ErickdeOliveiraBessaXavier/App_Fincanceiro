-- ============================================================================
-- Tira `anon` de todas as tabelas, views e sequences do schema public
--
-- O mesmo default que abria as funções (20260929120000) dava a `anon` todos os
-- privilégios em toda tabela, view e sequence nova. Hoje a RLS protege as
-- tabelas (todas as policies são só para `authenticated`) e as views sensíveis
-- já tinham sido fechadas uma a uma em 2026-08-26 — mas cada objeto novo
-- nascia exposto e dependia de alguém lembrar de revogar. Foi assim que a MV de
-- parcelas ficou legível sem login.
--
-- O app não lê nada antes do login (AuthContext só consulta depois da sessão),
-- então `anon` não precisa de acesso a nada aqui.
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO v
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S', 'p', 'f')
     AND (has_table_privilege('anon', c.oid, 'SELECT')
          OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE')
          OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v IS NOT NULL THEN RAISE EXCEPTION 'anon ainda acessa: %', v; END IF;
END $$;
