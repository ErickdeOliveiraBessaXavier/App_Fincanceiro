/**
 * Situação do cliente derivada dos títulos — regra única.
 *
 * O status gravado em `clientes.status` não é mantido em sincronia com a
 * realidade financeira, então toda exibição deriva dos status consolidados dos
 * títulos (vw_titulos_completos.status).
 *
 * Antes esta regra vivia só em queries/clientes.ts e a tela de Títulos usava uma
 * versão própria, reduzida a "tem vencido? inadimplente : ativo" — o mesmo
 * cliente aparecia "Em Acordo" em Clientes e "Ativo" em Títulos.
 */

export type SituacaoCliente = 'inadimplente' | 'em_acordo' | 'quitado' | 'ativo';

/**
 * Precedência: inadimplente > em_acordo > quitado > ativo.
 *
 * Vencido ganha de tudo porque é o que exige ação. "Em acordo" vem antes de
 * "quitado" porque a novação zera o saldo do título: sem esta ordem, um cliente
 * com acordo ativo apareceria como quitado.
 */
export function derivarStatusCliente(statuses: string[]): SituacaoCliente {
  if (statuses.length === 0) return 'ativo';
  if (statuses.includes('vencido')) return 'inadimplente';
  if (statuses.includes('renegociado')) return 'em_acordo';
  if (statuses.every((s) => s === 'pago')) return 'quitado';
  return 'ativo';
}
