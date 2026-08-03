// Cronograma de parcelas do acordo.
//
// A data de cada parcela é uma SUGESTÃO ancorada no vencimento da 1ª parcela
// (mesmo dia nos meses seguintes), mas o usuário pode sobrescrever qualquer
// linha individualmente — as sobrescritas vivem em `datasManuais`, indexadas
// pelo número da parcela.

export interface CronogramaParcela {
  numero: number;
  valor: number;
  valor_juros: number;
  valor_total: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'vencida';
}

export interface ParametrosCronograma {
  valorAcordo: number;
  parcelas: number;
  taxaJuros?: number;
  primeiroVencimento: string;
}

/** Sobrescritas de data por número de parcela (1-based). */
export type DatasManuais = Record<number, string>;

// 'YYYY-MM-DD' -> Date no fuso LOCAL. `new Date('2026-08-15')` seria
// interpretado como meia-noite UTC, o que joga a data um dia para trás em
// fusos negativos como o do Brasil.
function parseDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function formatarDataIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/**
 * Soma meses preservando o dia de vencimento, ancorando no último dia do mês
 * quando o mês de destino é mais curto.
 *
 * `Date.setMonth` sozinho transborda: 31/01 + 1 mês vira "31/02", que o JS
 * normaliza para 03/03. Aqui 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto),
 * e o dia original volta a ser usado nos meses que o comportam.
 */
export function somarMesesAncorado(baseIso: string, meses: number): string {
  const base = parseDataLocal(baseIso);
  const alvo = new Date(base.getFullYear(), base.getMonth() + meses, 1);
  // Dia 0 do mês seguinte = último dia do mês de destino.
  const ultimoDiaDoMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(base.getDate(), ultimoDiaDoMes));
  return formatarDataIso(alvo);
}

/**
 * Monta o cronograma completo. Os juros são simples e progressivos
 * (parcela N paga N vezes a taxa sobre o valor base) — comportamento
 * preservado da implementação anterior.
 */
export function gerarCronograma(
  { valorAcordo, parcelas, taxaJuros, primeiroVencimento }: ParametrosCronograma,
  datasManuais: DatasManuais = {},
): CronogramaParcela[] {
  if (!valorAcordo || !parcelas || parcelas < 1 || !primeiroVencimento) return [];

  const valorBase = valorAcordo / parcelas;
  const taxa = (taxaJuros || 0) / 100;

  return Array.from({ length: parcelas }, (_, i) => {
    const numero = i + 1;
    const valorJuros = valorBase * taxa * numero;
    return {
      numero,
      valor: valorBase,
      valor_juros: valorJuros,
      valor_total: valorBase + valorJuros,
      data_vencimento: datasManuais[numero] ?? somarMesesAncorado(primeiroVencimento, i),
      status: 'pendente' as const,
    };
  });
}

/** Descarta sobrescritas de parcelas que não existem mais (ex.: 6 -> 3 parcelas). */
export function podarDatasManuais(datasManuais: DatasManuais, parcelas: number): DatasManuais {
  const podadas: DatasManuais = {};
  for (const [numero, data] of Object.entries(datasManuais)) {
    if (Number(numero) <= parcelas) podadas[Number(numero)] = data;
  }
  return podadas;
}
