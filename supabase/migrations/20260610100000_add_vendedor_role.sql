-- =====================================================================
-- Papel "vendedor" — adicionar o valor ao enum app_role.
-- =====================================================================
-- Precisa ficar SOZINHO nesta migration: o Postgres não permite usar um
-- valor de enum recém-adicionado dentro da mesma transação em que ele foi
-- criado. As funções/policies que referenciam 'vendedor' ficam na migration
-- seguinte (20260610110000_vendedores.sql), já com o valor commitado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor' BEFORE 'operador';
