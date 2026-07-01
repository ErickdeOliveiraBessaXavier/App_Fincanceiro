-- =====================================================================
-- "Alega Pagamento" promovido a Status de Cobrança (8º).
-- =====================================================================
-- Antes era um tipo de evento (comunicacoes.tipo / agendamentos.tipo_evento).
-- Passa a ser status de cobrança, como cadastro_insuficiente/cliente_desconhecido
-- na migração 20260701130000. Reescreve os registros históricos para o status,
-- neutralizando o tipo. Idempotente (só toca em linhas ainda sem status_cobranca);
-- sem alteração de schema.

UPDATE public.comunicacoes
  SET status_cobranca = 'alega_pagamento', tipo = 'contato_cliente'
  WHERE tipo = 'alega_pagamento'
    AND status_cobranca IS NULL;

UPDATE public.agendamentos
  SET status_cobranca = 'alega_pagamento', tipo_evento = 'agendamento'
  WHERE tipo_evento = 'alega_pagamento'
    AND status_cobranca IS NULL;
