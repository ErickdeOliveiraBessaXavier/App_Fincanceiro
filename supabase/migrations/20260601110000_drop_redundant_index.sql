-- Limpeza: remove índice redundante em convites.token.
-- A coluna já é declarada UNIQUE (CREATE TABLE), o que cria um índice único
-- implícito (convites_token_key). O idx_convites_token apenas duplicava isso.
DROP INDEX IF EXISTS public.idx_convites_token;
