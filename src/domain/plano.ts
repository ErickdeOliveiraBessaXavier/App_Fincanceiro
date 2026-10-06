/**
 * Plano da empresa: uso do limite de títulos e prazo de acesso — regra única
 * das telas (Plataforma, aviso no app, Configurações, Importar).
 *
 * Quem decide de verdade é o banco: a trigger `_conferir_limite_titulos` recusa
 * o título novo e `current_company_id()` bloqueia a empresa com prazo vencido.
 * Aqui só se traduz isso para a tela.
 */

/** HINT da exceção que o banco levanta quando o limite do plano é atingido. */
export const HINT_LIMITE_DO_PLANO = 'limite_do_plano';

/** A partir de que percentual o uso merece aviso. */
const PERCENTUAL_ATENCAO = 80;
const PERCENTUAL_CRITICO = 90;

export type FaixaDeUso = 'ilimitado' | 'normal' | 'atencao' | 'critico' | 'esgotado';

export interface UsoDoPlano {
  usados: number;
  /** null = plano sem limite. */
  limite: number | null;
  /** Inteiro, sem teto em 100 (o limite pode ter sido reduzido abaixo do uso). */
  percentual: number | null;
  faixa: FaixaDeUso;
  /** Quantos títulos novos ainda cabem; null = sem limite. */
  restantes: number | null;
}

function faixaDoPercentual(percentual: number): FaixaDeUso {
  if (percentual >= 100) return 'esgotado';
  if (percentual >= PERCENTUAL_CRITICO) return 'critico';
  if (percentual >= PERCENTUAL_ATENCAO) return 'atencao';
  return 'normal';
}

export function calcularUso(usados: number, limite: number | null): UsoDoPlano {
  if (limite === null) {
    return { usados, limite, percentual: null, faixa: 'ilimitado', restantes: null };
  }
  // Arredonda para baixo: "100%" só quando de fato não cabe mais nenhum.
  const percentual = Math.floor((usados / limite) * 100);
  return {
    usados,
    limite,
    percentual,
    faixa: faixaDoPercentual(percentual),
    restantes: Math.max(limite - usados, 0),
  };
}

export function usoMereceAviso(uso: UsoDoPlano): boolean {
  return uso.faixa === 'atencao' || uso.faixa === 'critico' || uso.faixa === 'esgotado';
}

const MS_POR_DIA = 86_400_000;

/**
 * Dias de acesso que faltam, arredondando para cima ("termina em 1 dia" até o
 * último minuto). null = sem prazo; 0 = vencido.
 */
export function diasRestantes(expiraEm: string | null, agora: Date = new Date()): number | null {
  if (!expiraEm) return null;
  const ms = new Date(expiraEm).getTime() - agora.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / MS_POR_DIA);
}

export type SituacaoDeAcesso = 'ativa' | 'pendente' | 'suspensa' | 'inadimplente' | 'expirada';

/**
 * Mesma regra de `current_company_id()`: ativa, dentro do prazo e sem fatura
 * atrasada além da tolerância (`inadimplente`, calculado pelo banco).
 */
export function situacaoDeAcesso(
  empresa: { status: string; acesso_expira_em?: string | null; inadimplente?: boolean },
  agora: Date = new Date(),
): SituacaoDeAcesso {
  if (empresa.status === 'pendente') return 'pendente';
  if (empresa.status !== 'ativa') return 'suspensa';
  if (empresa.inadimplente) return 'inadimplente';
  return diasRestantes(empresa.acesso_expira_em ?? null, agora) === 0 ? 'expirada' : 'ativa';
}

/** Erro do Supabase/PostgREST causado pelo limite do plano. */
export function ehErroDeLimite(erro: { hint?: string | null } | null | undefined): boolean {
  return erro?.hint === HINT_LIMITE_DO_PLANO;
}

const NUMERO = new Intl.NumberFormat('pt-BR');

/** "7.842 de 10.000 títulos — 78%" ou "7.842 títulos — sem limite". */
export function descreverUso(uso: UsoDoPlano): string {
  if (uso.limite === null) return `${NUMERO.format(uso.usados)} títulos — sem limite`;
  return `${NUMERO.format(uso.usados)} de ${NUMERO.format(uso.limite)} títulos — ${uso.percentual}%`;
}

export function formatarNumero(n: number): string {
  return NUMERO.format(n);
}

/**
 * Data escolhida num `<input type="date">` → fim daquele dia no horário de
 * Brasília. "Acesso até 15/10" vale o dia 15 inteiro, não até a meia-noite
 * que o abre.
 */
export function fimDoDiaNoBrasil(dataIso: string): string {
  return `${dataIso}T23:59:59-03:00`;
}
