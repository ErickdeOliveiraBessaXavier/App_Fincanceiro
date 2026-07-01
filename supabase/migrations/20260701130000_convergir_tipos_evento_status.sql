-- =====================================================================
-- Convergência: tipos de evento "órfãos" viram Status de Cobrança.
-- =====================================================================
-- Antes existiam duas taxonomias para o resultado do contato: os tipos de
-- evento (comunicacoes.tipo / agendamentos.tipo_evento) e os status de
-- cobrança (status_cobranca). Alguns tipos eram, na verdade, desfechos de
-- cobrança sem status equivalente. Passamos a ter UMA linguagem:
--   - cadastro_insuficiente, cliente_desconhecido -> status 'sem_contato_incorreto'
--   - devolucao (tipo)                            -> status 'devolucao'
--
-- O tipo passa a 'contato_cliente' (comunicacoes) / 'agendamento' (agendamentos),
-- que são os valores neutros/administrativos padrão. Idempotente: só toca em
-- linhas ainda sem status_cobranca. Sem alteração de schema (não há CHECK em
-- tipo/tipo_evento — removido em 20260610180000).

-- Histórico (comunicacoes)
UPDATE public.comunicacoes
  SET status_cobranca = 'sem_contato_incorreto', tipo = 'contato_cliente'
  WHERE tipo IN ('cadastro_insuficiente', 'cliente_desconhecido')
    AND status_cobranca IS NULL;

UPDATE public.comunicacoes
  SET status_cobranca = 'devolucao', tipo = 'contato_cliente'
  WHERE tipo = 'devolucao'
    AND status_cobranca IS NULL;

-- Ações futuras (agendamentos)
UPDATE public.agendamentos
  SET status_cobranca = 'sem_contato_incorreto', tipo_evento = 'agendamento'
  WHERE tipo_evento IN ('cadastro_insuficiente', 'cliente_desconhecido')
    AND status_cobranca IS NULL;

UPDATE public.agendamentos
  SET status_cobranca = 'devolucao', tipo_evento = 'agendamento'
  WHERE tipo_evento = 'devolucao'
    AND status_cobranca IS NULL;
