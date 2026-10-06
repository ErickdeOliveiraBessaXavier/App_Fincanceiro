/**
 * Cobrança da plataforma: implantação + mensalidade das empresas.
 *
 * Quem decide de verdade é o banco: `_gerar_mensalidades` emite as faturas e
 * `current_company_id()` bloqueia a empresa com fatura em aberto vencida há
 * mais que a tolerância. Aqui só se traduz isso para a tela, com as mesmas
 * regras.
 */
import { formatData, isoDeData, parseDataLocal } from '@/utils/format';

/** Carência da 1ª mensalidade a partir da contratação (acordo com os parceiros). */
export const CARENCIA_PADRAO_DIAS = 60;
/** Dias após o vencimento até o bloqueio. Igual ao default do banco. */
export const TOLERANCIA_PADRAO_DIAS = 10;

export type TipoFatura = 'implantacao' | 'mensalidade';
export type StatusFatura = 'aberta' | 'paga' | 'cancelada';

export interface FaturaAssinatura {
  id: string;
  tipo: TipoFatura;
  /** YYYY-MM-01; só na mensalidade. */
  competencia: string | null;
  vencimento: string;
  valor: number;
  status: StatusFatura;
  pago_em: string | null;
  forma_pagamento: string | null;
  observacao: string | null;
}

/**
 * Situação de cobrança de uma fatura:
 * - `a_vencer`: em aberto, vencimento hoje ou adiante;
 * - `vencida`: em aberto, dentro da tolerância (aviso, sem bloqueio);
 * - `bloqueando`: em aberto, passou da tolerância — a empresa está bloqueada.
 */
export type SituacaoFatura = 'paga' | 'cancelada' | 'a_vencer' | 'vencida' | 'bloqueando';

const MS_POR_DIA = 86_400_000;

/** Dias corridos de `de` até `ate` (datas YYYY-MM-DD, sem fuso). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((parseDataLocal(ate).getTime() - parseDataLocal(de).getTime()) / MS_POR_DIA);
}

export function somarDias(dataIso: string, dias: number): string {
  const d = parseDataLocal(dataIso);
  d.setDate(d.getDate() + dias);
  return isoDeData(d);
}

export function situacaoDaFatura(
  fatura: Pick<FaturaAssinatura, 'status' | 'vencimento'>,
  toleranciaDias: number,
  hoje: string,
): SituacaoFatura {
  if (fatura.status !== 'aberta') return fatura.status;
  const atraso = diasEntre(fatura.vencimento, hoje);
  if (atraso <= 0) return 'a_vencer';
  // Mesma conta do banco: bloqueia quando vencimento + tolerância < hoje.
  return atraso > toleranciaDias ? 'bloqueando' : 'vencida';
}

/** Data do bloqueio de uma fatura em aberto: o dia seguinte ao fim da tolerância. */
export function dataDoBloqueio(vencimento: string, toleranciaDias: number): string {
  return somarDias(vencimento, toleranciaDias + 1);
}

/** Início da cobrança sugerido: contratação + carência. */
export function inicioCobrancaPadrao(hoje: string, carenciaDias = CARENCIA_PADRAO_DIAS): string {
  return somarDias(hoje, carenciaDias);
}

/** Primeira mensalidade: o 1º dia `diaVencimento` a partir do início da cobrança. */
export function primeiroVencimento(inicioCobranca: string, diaVencimento: number): string {
  const inicio = parseDataLocal(inicioCobranca);
  const mes = diaVencimento >= inicio.getDate() ? inicio.getMonth() : inicio.getMonth() + 1;
  return isoDeData(new Date(inicio.getFullYear(), mes, diaVencimento));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "Implantação" ou "Mensalidade out/2026". */
export function descreverFatura(f: Pick<FaturaAssinatura, 'tipo' | 'competencia'>): string {
  if (f.tipo === 'implantacao' || !f.competencia) return 'Implantação';
  const d = parseDataLocal(f.competencia);
  return `Mensalidade ${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarReais(valor: number): string {
  return BRL.format(valor);
}

/** Texto curto da situação, para a coluna da tabela e os avisos. */
export function descreverSituacao(
  fatura: Pick<FaturaAssinatura, 'status' | 'vencimento' | 'pago_em'>,
  toleranciaDias: number,
  hoje: string,
): string {
  const situacao = situacaoDaFatura(fatura, toleranciaDias, hoje);
  const textos: Record<SituacaoFatura, () => string> = {
    paga: () => `Paga em ${formatData(fatura.pago_em)}`,
    cancelada: () => 'Cancelada',
    a_vencer: () => `Vence em ${formatData(fatura.vencimento)}`,
    vencida: () => `Vencida — bloqueio em ${formatData(dataDoBloqueio(fatura.vencimento, toleranciaDias))}`,
    bloqueando: () => 'Em atraso — acesso bloqueado',
  };
  return textos[situacao]();
}

// ===================== Visão da Plataforma =====================

const GRAVIDADE: Record<SituacaoFatura, number> = {
  paga: 0, cancelada: 0, a_vencer: 1, vencida: 2, bloqueando: 3,
};

export interface ResumoCobrancaEmpresa {
  /** A pior situação entre as faturas em aberto; null = nada em aberto. */
  situacao: Exclude<SituacaoFatura, 'paga' | 'cancelada'> | null;
  emAberto: number;
  emAtraso: number;
}

/** Agrega as faturas em aberto de uma empresa. */
export function resumirCobranca(
  abertas: Pick<FaturaAssinatura, 'status' | 'vencimento' | 'valor'>[],
  toleranciaDias: number,
  hoje: string,
): ResumoCobrancaEmpresa {
  let pior: ResumoCobrancaEmpresa['situacao'] = null;
  let emAberto = 0;
  let emAtraso = 0;
  for (const f of abertas) {
    const s = situacaoDaFatura(f, toleranciaDias, hoje);
    if (s === 'paga' || s === 'cancelada') continue;
    emAberto += f.valor;
    if (s !== 'a_vencer') emAtraso += f.valor;
    if (!pior || GRAVIDADE[s] > GRAVIDADE[pior]) pior = s;
  }
  return { situacao: pior, emAberto, emAtraso };
}

/** Mensalidade efetiva: a negociada, se houver; senão, a do plano. */
export function valorMensalEfetivo(personalizado: number | null, doPlano: number): number {
  return personalizado ?? doPlano;
}
