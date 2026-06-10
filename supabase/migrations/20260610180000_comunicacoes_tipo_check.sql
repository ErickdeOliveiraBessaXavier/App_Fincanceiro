-- =====================================================================
-- Alinha o CHECK de comunicacoes.tipo com os tipos de evento da UI.
-- =====================================================================
-- O registro de evento da telecobrança (RegistroEventoModal) grava em
-- comunicacoes.tipo o value de TIPOS_EVENTO (ex.: 'contato_cliente',
-- 'alega_pagamento', ...). A Timeline (EventoTimeline) lê esse mesmo valor
-- e resolve via getTipoEvento(). O CHECK original só aceitava um conjunto
-- estreito ('ligacao','email','sms','whatsapp','visita','acordo','promessa'),
-- estourando comunicacoes_tipo_check para a maioria dos eventos.
--
-- A tabela irmã agendamentos.tipo_evento não tem CHECK; a validação dos
-- valores fica na camada de aplicação (constante TIPOS_EVENTO). Para evitar
-- que cada novo tipo de evento volte a quebrar o insert, removemos o CHECK
-- de tipo em comunicacoes, espelhando agendamentos.

ALTER TABLE public.comunicacoes
  DROP CONSTRAINT IF EXISTS comunicacoes_tipo_check;
