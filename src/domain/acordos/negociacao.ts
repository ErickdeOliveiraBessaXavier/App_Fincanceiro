// Relação entre o débito original e o valor efetivamente negociado.
//
// `acordos.desconto` é um PERCENTUAL e o banco só aceita 0..100
// (CONSTRAINT acordos_desconto_check). Quando o acordo fecha ACIMA do débito
// — juros do parcelamento, multa ou simplesmente uma negociação com acréscimo —
// o percentual calculado fica negativo e o insert é recusado (HTTP 400). Não
// existe desconto a gravar nesse caso: vai 0.
//
// Nada se perde: `valor_original` e `valor_acordo` continuam gravados e
// `resumoNegociacao` reconstrói a diferença real para exibição.

export type TipoNegociacao = 'desconto' | 'acrescimo' | 'neutro';

export interface ResumoNegociacao {
  tipo: TipoNegociacao;
  /** Diferença absoluta, em reais. */
  valor: number;
  /** Diferença sobre o valor original, em %. Sempre >= 0. */
  percentual: number;
}

// Abaixo de meio centavo a diferença não aparece na tela arredondada — tratar
// como acordo "no valor cheio" evita exibir 'Desconto de R$ 0,00'.
const TOLERANCIA = 0.005;

export function resumoNegociacao(valorOriginal: number, valorAcordo: number): ResumoNegociacao {
  const diferenca = (valorOriginal || 0) - (valorAcordo || 0);

  if (Math.abs(diferenca) < TOLERANCIA) {
    return { tipo: 'neutro', valor: 0, percentual: 0 };
  }

  const percentual = valorOriginal > 0 ? Math.abs(diferenca / valorOriginal) * 100 : 0;
  return {
    tipo: diferenca > 0 ? 'desconto' : 'acrescimo',
    valor: Math.abs(diferenca),
    percentual,
  };
}

/** Percentual a gravar em `acordos.desconto`, dentro do domínio aceito (0..100). */
export function descontoPercentual(valorOriginal: number, valorAcordo: number): number {
  const resumo = resumoNegociacao(valorOriginal, valorAcordo);
  if (resumo.tipo !== 'desconto') return 0;
  return Math.min(100, resumo.percentual);
}
