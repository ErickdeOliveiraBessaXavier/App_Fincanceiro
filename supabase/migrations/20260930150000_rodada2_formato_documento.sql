-- ============================================================================
-- Correções da Auditoria — Rodada 2 (AUDITORIA_RODADA_2.md), parte 3 — item 6
--
-- O banco aceitava qualquer texto em clientes.cpf_cnpj (há um cliente com '').
-- Aqui só o formato: 11 (CPF) ou 14 (CNPJ) dígitos, sem máscara. O dígito
-- verificador é conferido no cadastro manual (src/utils/format.ts, erroCpfCnpj);
-- importador e API continuam aceitando o documento do ERP, para não travar uma
-- carga por um cadastro antigo — 3 dos 19 clientes atuais têm dígito errado.
--
-- NOT VALID: vale para toda linha nova ou alterada, sem reprovar as antigas.
-- Quem editar o cliente sem documento vai precisar informar um válido.
-- ============================================================================

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_formato;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_cpf_cnpj_formato
  CHECK (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$') NOT VALID;
