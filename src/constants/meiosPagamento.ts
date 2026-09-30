/**
 * Meios de pagamento aceitos pelo banco — espelho exato do CHECK
 * `eventos_parcela_meio_pagamento_check` em `movimentos_financeiros`.
 *
 * Fonte única para os dois modais de baixa (título e acordo). O modal de
 * título tinha a própria lista, com "Cartão de Crédito", "Cartão de Débito" e
 * "Cheque", que o banco recusava com erro de constraint.
 */
export const MEIOS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'outro', label: 'Outro' },
] as const;

export type MeioPagamento = (typeof MEIOS_PAGAMENTO)[number]['value'];
