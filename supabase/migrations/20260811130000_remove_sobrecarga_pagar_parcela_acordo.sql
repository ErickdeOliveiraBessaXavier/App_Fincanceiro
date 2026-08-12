-- ============================================================================
-- Remove a sobrecarga deprecada pagar_parcela_acordo(uuid, date)
--
-- Ela existiu por uma janela só: entre 20260811120000 (que trocou a assinatura
-- para incluir o valor recebido) e o deploy do front que passou a mandar esse
-- valor. Sem ela, a versão publicada do app teria quebrado a baixa de acordo
-- nesse intervalo, porque chamava a assinatura antiga.
--
-- Com o front novo publicado, o único chamador é
-- src/lib/queries/acordos.ts -> usePagarParcelaAcordo, que envia p_valor.
--
-- Manter duas portas para a mesma baixa é justamente o tipo de duplicação que
-- o razão de eventos veio resolver: a assinatura antiga quitava sempre pelo
-- saldo e não sabia registrar juros de atraso nem pagamento parcial.
-- ============================================================================

DROP FUNCTION IF EXISTS public.pagar_parcela_acordo(uuid, date);

NOTIFY pgrst, 'reload schema';
