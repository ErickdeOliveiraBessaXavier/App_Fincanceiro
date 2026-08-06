/**
 * Datas e recortes de período das métricas — sempre no calendário LOCAL.
 *
 * Todo o bucket mensal do app vinha de `toISOString().slice(0,7)`, que resolve o
 * mês em UTC: no Brasil (UTC-3), das 21h do último dia do mês em diante o "mês
 * atual" já era o mês seguinte e a série inteira deslocava. E o passo
 * `date.setMonth(date.getMonth() - i)` estourava nos dias 29-31 (31/03 menos um
 * mês vira "31/02" -> 03/03), duplicando ou pulando meses.
 *
 * Ver a regra de fuso do projeto em src/utils/format.ts (parseDataLocal/isoDeData).
 */

import { isoDeData, parseDataLocal } from '@/utils/format';
import type { Periodo } from './tipos';

/** Data pura 'YYYY-MM-DD' pelo calendário local, aceitando data pura ou timestamp. */
export function diaLocal(valor: string): string {
  return isoDeData(parseDataLocal(valor));
}

/** 'YYYY-MM' pelo calendário local. */
export function mesDe(valor: string): string {
  return diaLocal(valor).slice(0, 7);
}

/**
 * Os `quantidade` meses terminando no mês de `referencia`, do mais antigo ao
 * mais recente. Ancorar no dia 1 evita o overflow de `setMonth`.
 */
export function ultimosMeses(quantidade: number, referencia: Date = new Date()): string[] {
  const meses: string[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const data = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1);
    meses.push(isoDeData(data).slice(0, 7));
  }
  return meses;
}

/** 'YYYY-MM' -> 'ago/26' para eixo de gráfico. */
export function rotuloMes(mes: string): string {
  const [ano, numeroMes] = mes.split('-').map(Number);
  return new Date(ano, numeroMes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '');
}

/**
 * Converte o intervalo do date-picker em período inclusivo.
 *
 * O picker devolve `Date` à meia-noite LOCAL. O código antigo mandava
 * `to.toISOString()` para o `lte`, o que cortava o último dia do período quase
 * inteiro. Trabalhando em data pura o limite passa a ser o dia fechado.
 */
export function periodoDeIntervalo(de: Date, ate: Date): Periodo {
  return { de: isoDeData(de), ate: isoDeData(ate) };
}

export function dentroDoPeriodo(data: string | null | undefined, periodo?: Periodo): boolean {
  if (!periodo) return true;
  if (!data) return false;
  const dia = diaLocal(data);
  return dia >= periodo.de && dia <= periodo.ate;
}

/** Primeiro dia do mês corrente, em data pura local. */
export function inicioDoMesAtual(referencia: Date = new Date()): string {
  return isoDeData(new Date(referencia.getFullYear(), referencia.getMonth(), 1));
}

/** Período fechado de um mês 'YYYY-MM' (o dia 0 do mês seguinte é o último dia). */
export function periodoDoMes(mes: string): Periodo {
  const [ano, numeroMes] = mes.split('-').map(Number);
  return {
    de: isoDeData(new Date(ano, numeroMes - 1, 1)),
    ate: isoDeData(new Date(ano, numeroMes, 0)),
  };
}

/**
 * Meses cobertos por um período, do mais antigo ao mais recente.
 *
 * É o que faz o gráfico acompanhar o filtro: antes ele sempre desenhava os
 * últimos 6 meses, mesmo com um período antigo selecionado — os cards mudavam e
 * o gráfico ficava vazio.
 */
export function mesesDoPeriodo(periodo: Periodo, maximo = 24): string[] {
  const [anoDe, mesDe_] = periodo.de.split('-').map(Number);
  const [anoAte, mesAte] = periodo.ate.split('-').map(Number);
  const total = (anoAte - anoDe) * 12 + (mesAte - mesDe_) + 1;
  const quantidade = Math.min(Math.max(total, 1), maximo);

  return Array.from({ length: quantidade }, (_, i) =>
    isoDeData(new Date(anoDe, mesDe_ - 1 + i, 1)).slice(0, 7),
  );
}
