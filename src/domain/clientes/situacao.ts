/**
 * Situação do cliente derivada dos títulos — regra única.
 *
 * O status gravado em `clientes.status` não é mantido em sincronia com a
 * realidade financeira, então toda exibição deriva dos títulos consolidados
 * (vw_titulos_completos).
 *
 * Antes esta regra vivia só em queries/clientes.ts e a tela de Títulos usava uma
 * versão própria, reduzida a "tem vencido? inadimplente : ativo" — o mesmo
 * cliente aparecia "Em Acordo" em Clientes e "Ativo" em Títulos.
 */

import { classificarTitulo, type ClasseTitulo } from '@/domain/metricas';

export type SituacaoCliente = 'inadimplente' | 'em_acordo' | 'quitado' | 'ativo';

/** O mínimo que a regra precisa de um título; `acordo_status` pode faltar. */
export interface TituloSituacao {
  status: string | null;
  acordo_status?: string | null;
}

const CLASSES_INADIMPLENTE: ClasseTitulo[] = ['vencido', 'acordo_quebrado'];
const CLASSES_QUITADO: ClasseTitulo[] = ['pago', 'acordo_cumprido'];

/**
 * Precedência: inadimplente > em_acordo > quitado > ativo.
 *
 * Vencido ganha de tudo porque é o que exige ação. "Em acordo" vem antes de
 * "quitado" porque a novação zera o saldo do título: sem esta ordem, um cliente
 * com acordo ativo apareceria como quitado.
 *
 * A classificação é a MESMA das métricas (`classificarTitulo`), e é o que
 * conserta o acordo QUEBRADO: o título fica com status 'pago' (a novação zerou o
 * saldo) e o cliente, que deve de verdade, aparecia como "Quitado".
 */
export function derivarStatusCliente(titulos: TituloSituacao[]): SituacaoCliente {
  if (titulos.length === 0) return 'ativo';

  const classes = titulos.map((t) =>
    classificarTitulo({ status: t.status ?? '', acordo_status: t.acordo_status ?? null }),
  );

  if (classes.some((c) => CLASSES_INADIMPLENTE.includes(c))) return 'inadimplente';
  if (classes.includes('em_acordo')) return 'em_acordo';
  if (classes.every((c) => CLASSES_QUITADO.includes(c))) return 'quitado';
  return 'ativo';
}
