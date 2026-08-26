-- ============================================================================
-- Fecha o EXECUTE que sobrou para `anon` nos helpers de agendamento
--
-- Correção de um furo aberto pela 20260826130000. Lá eu escrevi:
--
--   REVOKE ALL ON FUNCTION ... FROM public, authenticated;
--
-- e assumi que isso bastava. Não bastava: o Supabase concede EXECUTE a `anon`
-- e `authenticated` por DEFAULT PRIVILEGES no schema public, como concessão
-- EXPLÍCITA. Revogar de PUBLIC (o pseudo-papel) não remove concessão explícita
-- de um papel nomeado — então `anon` continuou com EXECUTE.
--
-- O estrago concreto, confirmado no linter de segurança e por
-- has_function_privilege():
--
--   * `fechar_retornos_pendentes(uuid)` é SECURITY DEFINER e NÃO valida papel
--     (a validação mora em quem a chama). Exposta a `anon` via
--     /rest/v1/rpc/, qualquer visitante não autenticado que soubesse um
--     cliente_id poderia fechar o retorno pendente daquele cliente.
--   * `marcar_substituicao(uuid[], uuid)` idem, escrevendo texto arbitrário
--     na coluna `resultado` de qualquer agendamento.
--
-- Lição registrada: revogação de privilégio precisa ser CONFERIDA depois de
-- aplicada (has_function_privilege), nunca presumida a partir do DDL escrito.
-- ============================================================================

-- Helpers internos: chamados de dentro das RPCs, que são SECURITY DEFINER e
-- executam como dono. Nenhum papel da aplicação precisa alcançá-los.
REVOKE EXECUTE ON FUNCTION public.fechar_retornos_pendentes(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.marcar_substituicao(uuid[], uuid)
  FROM PUBLIC, anon, authenticated;

-- `agendar_retorno` é chamada pela tela e valida papel de operador por conta
-- própria, então não era explorável — mas visitante deslogado não tem por que
-- alcançá-la. Mantém só `authenticated`.
REVOKE EXECUTE ON FUNCTION public.agendar_retorno(uuid, timestamptz, text, text, uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.agendar_retorno(uuid, timestamptz, text, text, uuid, uuid)
  TO authenticated;
